import type { MediaState, PowerAction, Reading } from "../../shared/types.js";
import { baseUrl, describeStatus, json, send, socketUrl } from "./http.js";
import { firstFrame, openMjpeg } from "./mjpeg.js";
import {
  DriverError,
  num,
  obj,
  str,
  type Driver,
  type DriverIo,
  type ScreenHandlers,
  type ScreenSession,
  type Target,
} from "./types.js";

const POWER: Record<PowerAction, string> = {
  on: "on",
  "graceful-shutdown": "off",
  off: "off_hard",
  reset: "reset_hard",
};
const BUTTON = ["left", "middle", "right"] as const;
// PiKVM wants absolute mouse positions from -32768 to 32767
const ABS = 65535;

function headers(target: Target): Record<string, string> {
  return {
    "x-kvmd-user": target.credentials.username ?? "admin",
    "x-kvmd-passwd": target.credentials.password ?? "",
  };
}

async function call(
  target: Target,
  io: DriverIo,
  path: string,
  init: {
    method?: string;
    body?: string;
    timeoutMs?: number;
    lenient?: boolean;
  } = {},
): Promise<Record<string, unknown>> {
  const response = await send(target, io, `${baseUrl(target)}${path}`, {
    ...init,
    headers: {
      ...headers(target),
      ...(init.body ? { "content-type": "text/plain" } : {}),
    },
  });
  if (!response.ok) throw new DriverError(describeStatus(response.status));
  if (init.lenient) return {};
  return obj(obj(await json(response)).result);
}

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const info = await call(target, io, "/api/info?fields=system,hw,meta");
  // These two are optional on a PiKVM without ATX or a video capture
  const [atx, streamer] = await Promise.all([
    call(target, io, "/api/atx").catch((): Record<string, unknown> => ({})),
    call(target, io, "/api/streamer").catch(
      (): Record<string, unknown> => ({}),
    ),
  ]);
  const system = obj(obj(info.system).kvmd);
  const platform = obj(obj(info.hw).platform);
  const meta = obj(obj(info.meta).server);
  const source = obj(obj(streamer.streamer).source);
  const resolution = obj(source.resolution);
  const led = obj(atx.leds).power;
  return {
    at: new Date().toISOString(),
    model: str(platform.model) || str(platform.base) || "PiKVM",
    version: str(system.version) || undefined,
    hostname: str(meta.host) || undefined,
    power: typeof led === "boolean" ? (led ? "on" : "off") : "unknown",
    width: num(resolution.width),
    height: num(resolution.height),
    signal: typeof source.online === "boolean" ? source.online : undefined,
  };
}

async function power(target: Target, io: DriverIo, action: PowerAction) {
  await call(target, io, `/api/atx/power?action=${POWER[action]}&wait=0`, {
    method: "POST",
  });
}

async function screen(
  target: Target,
  io: DriverIo,
  handlers: ScreenHandlers,
): Promise<ScreenSession> {
  const video = await openMjpeg(
    target,
    io,
    `${baseUrl(target)}/streamer/stream`,
    headers(target),
    handlers.onFrame,
    handlers.onClose,
  );
  const socket = io.connect(socketUrl(target, "/api/ws"), {
    headers: headers(target),
    ca: target.ca,
  });
  let open = false;
  const queue: string[] = [];
  const write = (event: unknown) => {
    const text = JSON.stringify(event);
    if (open) socket.send(text);
    else if (queue.length < 200) queue.push(text);
  };
  socket.on("open", (() => {
    open = true;
    for (const text of queue.splice(0)) socket.send(text);
  }) as never);
  socket.on("close", (() =>
    handlers.onClose("The KVM closed the connection")) as never);
  socket.on("error", (() =>
    handlers.onClose("The KVM connection failed")) as never);
  return {
    input(event) {
      switch (event.t) {
        case "key":
          write({
            event_type: "key",
            event: { key: event.code, state: event.down },
          });
          break;
        case "move":
          write({
            event_type: "mouse_move",
            event: {
              to: {
                x: Math.round(Math.min(1, Math.max(0, event.x)) * ABS - 32768),
                y: Math.round(Math.min(1, Math.max(0, event.y)) * ABS - 32768),
              },
            },
          });
          break;
        case "button":
          write({
            event_type: "mouse_button",
            event: { button: BUTTON[event.button], state: event.down },
          });
          break;
        case "wheel":
          write({
            event_type: "mouse_wheel",
            event: { delta: { x: 0, y: event.dy > 0 ? -1 : 1 } },
          });
          break;
        case "text":
          void call(target, io, "/api/hid/print?limit=0", {
            method: "POST",
            body: event.text,
            timeoutMs: 120_000,
          }).catch(() => {});
          break;
      }
    },
    close() {
      video.close();
      try {
        socket.close();
      } catch {
        // already closed
      }
    },
  };
}

async function mediaList(target: Target, io: DriverIo): Promise<MediaState> {
  const msd = await call(target, io, "/api/msd");
  if (msd.enabled === false) {
    throw new DriverError("Mass storage is turned off on this PiKVM");
  }
  const images = Object.entries(obj(obj(msd.storage).images)).map(
    ([name, value]) => ({
      id: name,
      name,
      size: num(obj(value).size),
    }),
  );
  const drive = obj(msd.drive);
  const image = obj(drive.image);
  return {
    images,
    mounted: drive.connected === true ? str(image.name) || null : null,
    cdrom: drive.cdrom === true,
    fromUrl: true,
  };
}

export const pikvm: Driver = {
  info: {
    id: "pikvm",
    defaultPort: 443,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: true,
      paste: true,
      snapshot: true,
    },
    powerActions: ["on", "graceful-shutdown", "off", "reset"],
  },
  read,
  power,
  screen,
  snapshot: (target, io) =>
    firstFrame(
      target,
      io,
      `${baseUrl(target)}/streamer/stream`,
      headers(target),
    ),
  async paste(target, io, text) {
    await call(target, io, "/api/hid/print?limit=0", {
      method: "POST",
      body: text,
      timeoutMs: 120_000,
    });
  },
  media: {
    list: mediaList,
    async mount(target, io, imageId, cdrom) {
      const name = encodeURIComponent(imageId);
      await call(target, io, "/api/msd/set_connected?connected=0", {
        method: "POST",
      });
      await call(
        target,
        io,
        `/api/msd/set_params?image=${name}&cdrom=${cdrom ? 1 : 0}`,
        { method: "POST" },
      );
      await call(target, io, "/api/msd/set_connected?connected=1", {
        method: "POST",
      });
    },
    async eject(target, io) {
      await call(target, io, "/api/msd/set_connected?connected=0", {
        method: "POST",
      });
    },
    async fromUrl(target, io, url, name) {
      await call(
        target,
        io,
        `/api/msd/write_remote?url=${encodeURIComponent(url)}&image=${encodeURIComponent(name)}`,
        { method: "POST", timeoutMs: 10 * 60_000, lenient: true },
      );
    },
  },
};
