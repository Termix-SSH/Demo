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
  // No fields filter: kvmd on a GL.iNet Comet has no hw section and refuses it.
  const info = await call(target, io, "/api/info");
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
    // No ATX board means the LED tells nothing about the machine.
    power:
      atx.enabled !== false && typeof led === "boolean"
        ? led
          ? "on"
          : "off"
        : "unknown",
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

const SNAPSHOT_GAP_MS = 150;
const STREAMER_WAIT_MS = 15_000;

/**
 * Video as back to back JPEG snapshots. A GL.iNet Comet only streams H.264,
 * but serves snapshots while a kvmd socket is open (kvmd starts the streamer
 * for socket clients, so the first ones answer 502 for a moment).
 */
function openSnapshots(
  target: Target,
  io: DriverIo,
  onFrame: (jpeg: Buffer) => void,
  onEnd: (reason?: string) => void,
): { close: () => void } {
  let closed = false;
  void (async () => {
    let waitingSince = Date.now();
    while (!closed) {
      const started = Date.now();
      try {
        const response = await send(
          target,
          io,
          `${baseUrl(target)}/streamer/snapshot`,
          { headers: headers(target) },
        );
        if (response.ok) {
          const jpeg = Buffer.from(await response.arrayBuffer());
          if (!closed) onFrame(jpeg);
          waitingSince = Date.now();
        } else {
          await response.body?.cancel().catch(() => {});
          if (Date.now() - waitingSince > STREAMER_WAIT_MS) {
            throw new DriverError(describeStatus(response.status));
          }
        }
      } catch (error) {
        if (!closed) {
          onEnd(error instanceof Error ? error.message : String(error));
        }
        return;
      }
      const rest = SNAPSHOT_GAP_MS - (Date.now() - started);
      if (rest > 0) await new Promise((done) => setTimeout(done, rest));
    }
  })();
  return {
    close() {
      closed = true;
    },
  };
}

// kvmd 4.x only takes binary HID messages on /api/ws, the JSON ones are ignored
function hidFrame(type: number, down: boolean, name: string): Buffer {
  return Buffer.concat([
    Buffer.from([type, down ? 1 : 0]),
    Buffer.from(name, "ascii"),
  ]);
}

function moveFrame(x: number, y: number): Buffer {
  const frame = Buffer.alloc(5);
  frame[0] = 3;
  frame.writeInt16BE(Math.round(Math.min(1, Math.max(0, x)) * ABS - 32768), 1);
  frame.writeInt16BE(Math.round(Math.min(1, Math.max(0, y)) * ABS - 32768), 3);
  return frame;
}

/** Termix sends absolute pointer positions, which kvmd drops in relative mode. */
async function useAbsoluteMouse(target: Target, io: DriverIo): Promise<void> {
  const mouse = obj((await call(target, io, "/api/hid")).mouse);
  const outputs = obj(mouse.outputs);
  const available = Array.isArray(outputs.available) ? outputs.available : [];
  if (mouse.absolute !== false || !available.includes("usb")) return;
  await call(target, io, "/api/hid/set_params?mouse_output=usb", {
    method: "POST",
  });
}

async function screen(
  target: Target,
  io: DriverIo,
  handlers: ScreenHandlers,
  video: "mjpeg" | "snapshots" = "mjpeg",
): Promise<ScreenSession> {
  void useAbsoluteMouse(target, io).catch(() => {});
  // The socket comes first: it is what starts the streamer on kvmd.
  const socket = io.connect(socketUrl(target, "/api/ws"), {
    headers: headers(target),
    ca: target.ca,
    pin: target.options.pin,
  });
  let stream: { close: () => void };
  try {
    stream =
      video === "snapshots"
        ? openSnapshots(target, io, handlers.onFrame, handlers.onClose)
        : await openMjpeg(
            target,
            io,
            `${baseUrl(target)}/streamer/stream`,
            headers(target),
            handlers.onFrame,
            handlers.onClose,
          );
  } catch (error) {
    try {
      socket.close();
    } catch {
      // already closed
    }
    throw error;
  }
  let open = false;
  const queue: Buffer[] = [];
  const write = (frame: Buffer) => {
    if (open) socket.send(frame);
    else if (queue.length < 200) queue.push(frame);
  };
  socket.on("open", (() => {
    open = true;
    for (const frame of queue.splice(0)) socket.send(frame);
  }) as never);
  socket.on("close", (() =>
    handlers.onClose("The KVM closed the connection")) as never);
  socket.on("error", (() =>
    handlers.onClose("The KVM connection failed")) as never);
  return {
    input(event) {
      switch (event.t) {
        case "key":
          write(hidFrame(1, event.down, event.code));
          break;
        case "move":
          write(moveFrame(event.x, event.y));
          break;
        case "button":
          write(hidFrame(2, event.down, BUTTON[event.button]));
          break;
        case "wheel":
          write(Buffer.from([5, 0, 0, event.dy > 0 ? 0xff : 1]));
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
      stream.close();
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

const pikvmDriver: Driver = {
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

export const pikvm = pikvmDriver;

/**
 * GL.iNet Comet runs PiKVM's kvmd with a fixed admin user, so only the
 * password is asked for.
 */
export const glkvm: Driver = {
  ...pikvmDriver,
  info: {
    ...pikvmDriver.info,
    id: "glkvm",
    fields: [{ key: "password", type: "secret", required: true }],
  },
  async read(target, io) {
    const reading = await pikvmDriver.read(target, io);
    return {
      ...reading,
      model: reading.model === "PiKVM" ? "GL.iNet Comet" : reading.model,
    };
  },
  screen: (target, io, handlers) => screen(target, io, handlers, "snapshots"),
  snapshot: (target, io) =>
    new Promise<Buffer>((resolve, reject) => {
      let session: ScreenSession | null = null;
      let done = false;
      const finish = (frame: Buffer | null, reason?: string) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        session?.close();
        if (frame) resolve(frame);
        else reject(new DriverError(reason ?? "No picture from the KVM"));
      };
      const timer = setTimeout(() => finish(null), 20_000);
      screen(
        target,
        io,
        {
          onFrame: (jpeg) => finish(jpeg),
          onClose: (reason) => finish(null, reason),
        },
        "snapshots",
      )
        .then((opened) => {
          session = opened;
          if (done) opened.close();
        })
        .catch((error: unknown) =>
          finish(null, error instanceof Error ? error.message : String(error)),
        );
    }),
};
