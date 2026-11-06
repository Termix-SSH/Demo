import { createCipheriv, createHash, randomBytes } from "node:crypto";
import type { MediaState, PowerAction, Reading } from "../../shared/types.js";
import { baseUrl, describeStatus, json, send, socketUrl } from "./http.js";
import { createKeyboard } from "../../shared/hid.js";
import { firstFrame, openMjpeg } from "./mjpeg.js";
import {
  DriverError,
  obj,
  str,
  type Driver,
  type DriverIo,
  type ScreenHandlers,
  type ScreenSession,
  type Target,
} from "./types.js";

// Sipeed's web page encrypts the password with this passphrase (CryptoJS, OpenSSL format)
const PASSPHRASE = "nanokvm-sipeed-2024";
const TOKEN_TTL_MS = 30 * 60_000;
const COOKIE = "nano-kvm-token";
const BUTTON_BITS = [1, 4, 2];
// NanoKVM absolute mouse range
const ABS = 32767;

const tokens = new Map<string, { token: string; until: number }>();

/** CryptoJS AES.encrypt(password, passphrase), URL encoded. */
export function encryptPassword(password: string, salt = randomBytes(8)) {
  let material = Buffer.alloc(0);
  let block = Buffer.alloc(0);
  while (material.length < 48) {
    block = createHash("md5")
      .update(Buffer.concat([block, Buffer.from(PASSPHRASE), salt]))
      .digest();
    material = Buffer.concat([material, block]);
  }
  const cipher = createCipheriv(
    "aes-256-cbc",
    material.subarray(0, 32),
    material.subarray(32, 48),
  );
  const body = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return encodeURIComponent(
    Buffer.concat([Buffer.from("Salted__"), salt, body]).toString("base64"),
  );
}

function key(target: Target): string {
  return `${target.address}:${target.port}:${target.credentials.username}`;
}

async function login(target: Target, io: DriverIo): Promise<string> {
  const response = await send(
    target,
    io,
    `${baseUrl(target, "http")}/api/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: target.credentials.username ?? "admin",
        password: encryptPassword(target.credentials.password ?? ""),
      }),
    },
  );
  if (!response.ok) throw new DriverError(describeStatus(response.status));
  const body = obj(await json(response));
  const token = str(obj(body.data).token);
  if (Number(body.code) !== 0 || !token) {
    throw new DriverError("The KVM refused the login");
  }
  tokens.set(key(target), { token, until: Date.now() + TOKEN_TTL_MS });
  return token;
}

async function auth(
  target: Target,
  io: DriverIo,
): Promise<Record<string, string>> {
  const saved = tokens.get(key(target));
  const token =
    saved && saved.until > Date.now() ? saved.token : await login(target, io);
  return { cookie: `${COOKIE}=${token}` };
}

async function call(
  target: Target,
  io: DriverIo,
  path: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await send(
      target,
      io,
      `${baseUrl(target, "http")}${path}`,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          ...(await auth(target, io)),
          ...(body === undefined ? {} : { "content-type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    const expired = response.status === 401 || response.status === 403;
    if (expired && attempt === 0) {
      tokens.delete(key(target));
      continue;
    }
    if (!response.ok) throw new DriverError(describeStatus(response.status));
    const answer = obj(await json(response));
    // -2 is NanoKVM's "not logged in"
    if (Number(answer.code) === -2 && attempt === 0) {
      tokens.delete(key(target));
      continue;
    }
    if (answer.code !== undefined && Number(answer.code) !== 0) {
      throw new DriverError(str(answer.msg) || "The KVM refused the request");
    }
    return obj(answer.data);
  }
  throw new DriverError("The KVM refused the login");
}

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const info = await call(target, io, "/api/vm/info");
  const gpio = await call(target, io, "/api/vm/gpio").catch(
    (): Record<string, unknown> => ({}),
  );
  return {
    at: new Date().toISOString(),
    model: "NanoKVM",
    version: str(info.application) || undefined,
    hostname: str(info.mdns) || undefined,
    power:
      typeof gpio.pwr === "boolean" ? (gpio.pwr ? "on" : "off") : "unknown",
  };
}

const PRESS: Record<
  PowerAction,
  { type: "power" | "reset"; duration: number }
> = {
  on: { type: "power", duration: 800 },
  "graceful-shutdown": { type: "power", duration: 800 },
  off: { type: "power", duration: 8000 },
  reset: { type: "reset", duration: 800 },
};

async function screen(
  target: Target,
  io: DriverIo,
  handlers: ScreenHandlers,
): Promise<ScreenSession> {
  const headers = await auth(target, io);
  const video = await openMjpeg(
    target,
    io,
    `${baseUrl(target, "http")}/api/stream/mjpeg`,
    headers,
    handlers.onFrame,
    handlers.onClose,
  );
  const socket = io.connect(socketUrl(target, "/api/ws", "http"), {
    headers,
    ca: target.ca,
  });
  const keyboard = createKeyboard();
  let open = false;
  const queue: Buffer[] = [];
  const write = (bytes: number[]) => {
    const data = Buffer.from(bytes);
    if (open) socket.send(data);
    else if (queue.length < 200) queue.push(data);
  };
  let buttons = 0;
  let position = { x: 0, y: 0 };
  const mouse = (wheel = 0) => {
    const x = Math.round(position.x * ABS);
    const y = Math.round(position.y * ABS);
    write([3, buttons, x & 0xff, x >> 8, y & 0xff, y >> 8, wheel & 0xff]);
  };
  socket.on("open", (() => {
    open = true;
    for (const data of queue.splice(0)) socket.send(data);
  }) as never);
  socket.on("close", (() =>
    handlers.onClose("The KVM closed the connection")) as never);
  socket.on("error", (() =>
    handlers.onClose("The KVM connection failed")) as never);
  return {
    input(event) {
      switch (event.t) {
        case "key": {
          const report = keyboard.press(event.code, event.down);
          if (report) write([1, ...report]);
          break;
        }
        case "move":
          position = {
            x: Math.min(1, Math.max(0, event.x)),
            y: Math.min(1, Math.max(0, event.y)),
          };
          mouse();
          break;
        case "button": {
          const bit = BUTTON_BITS[event.button] ?? 0;
          buttons = event.down ? buttons | bit : buttons & ~bit;
          mouse();
          break;
        }
        case "wheel":
          mouse(event.dy > 0 ? 0xff : 1);
          break;
        case "text":
          // NanoKVM has no print call, so text is typed key by key in the paste route
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
  const list = await call(target, io, "/api/storage/image");
  const mounted = await call(target, io, "/api/storage/image/mounted").catch(
    (): Record<string, unknown> => ({}),
  );
  const files = Array.isArray(list.files) ? list.files.map(str) : [];
  const file = str(mounted.file);
  return {
    images: files.map((path) => ({
      id: path,
      name: path.split("/").pop() || path,
    })),
    mounted: file || null,
    cdrom: true,
    fromUrl: false,
  };
}

export const nanokvm: Driver = {
  info: {
    id: "nanokvm",
    defaultPort: 80,
    fields: [
      { key: "username", type: "text", required: true },
      { key: "password", type: "secret", required: true },
    ],
    features: {
      screen: true,
      browserScreen: false,
      power: true,
      media: true,
      paste: false,
      snapshot: true,
    },
    powerActions: ["on", "graceful-shutdown", "off", "reset"],
  },
  read,
  async power(target, io, action) {
    await call(target, io, "/api/vm/gpio", PRESS[action]);
  },
  screen,
  async snapshot(target, io) {
    return firstFrame(
      target,
      io,
      `${baseUrl(target, "http")}/api/stream/mjpeg`,
      await auth(target, io),
    );
  },
  media: {
    list: mediaList,
    async mount(target, io, imageId, cdrom) {
      await call(target, io, "/api/storage/image/mount", {
        file: imageId,
        cdrom,
      });
    },
    async eject(target, io) {
      await call(target, io, "/api/storage/image/mount", {
        file: "",
        cdrom: true,
      });
    },
  },
};
