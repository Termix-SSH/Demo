import type { Reading } from "../../shared/types.js";
import { baseUrl, describeStatus, json, send } from "./http.js";
import {
  DriverError,
  obj,
  str,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

const SESSION_TTL_MS = 10 * 60_000;
const sessions = new Map<string, { cookie: string; until: number }>();

function key(target: Target): string {
  return `${target.address}:${target.port}`;
}

/** Logs in when the JetKVM has a password. Returns the cookie header, or "". */
async function cookieFor(target: Target, io: DriverIo): Promise<string> {
  const saved = sessions.get(key(target));
  if (saved && saved.until > Date.now()) return saved.cookie;
  const password = target.credentials.password ?? "";
  if (!password) return "";
  const response = await send(
    target,
    io,
    `${baseUrl(target, "http")}/auth/login-local`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    },
  );
  if (!response.ok) throw new DriverError(describeStatus(response.status));
  const cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  sessions.set(key(target), { cookie, until: Date.now() + SESSION_TTL_MS });
  return cookie;
}

async function read(target: Target, io: DriverIo): Promise<Reading> {
  const response = await send(
    target,
    io,
    `${baseUrl(target, "http")}/device/status`,
  );
  if (!response.ok) throw new DriverError(describeStatus(response.status));
  const status = obj(await json(response));
  if (status.isSetup === false) {
    throw new DriverError("This JetKVM has not been set up yet");
  }
  // A wrong password only shows when the browser connects
  await cookieFor(target, io);
  return {
    at: new Date().toISOString(),
    model: "JetKVM",
    version: str(status.version) || undefined,
    // The JetKVM only reports power over its WebRTC data channel
    power: "unknown",
  };
}

/**
 * Passes the browser's WebRTC offer to the JetKVM and returns its answer.
 * The video and keys then travel straight between the browser and the KVM.
 */
export async function relaySession(
  target: Target,
  io: DriverIo,
  offer: string,
): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await cookieFor(target, io);
    const response = await send(
      target,
      io,
      `${baseUrl(target, "http")}/webrtc/session`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cookie ? { cookie } : {}),
        },
        body: JSON.stringify({ sd: offer }),
      },
    );
    if (response.status === 401 && attempt === 0) {
      sessions.delete(key(target));
      continue;
    }
    if (!response.ok) throw new DriverError(describeStatus(response.status));
    const answer = str(obj(await json(response)).sd);
    if (!answer) throw new DriverError("The JetKVM sent no answer");
    return answer;
  }
  throw new DriverError("The KVM refused the login");
}

export const jetkvm: Driver = {
  info: {
    id: "jetkvm",
    defaultPort: 80,
    fields: [{ key: "password", type: "secret", required: false }],
    features: {
      screen: false,
      browserScreen: true,
      power: false,
      media: false,
      paste: false,
      snapshot: false,
    },
    powerActions: [],
  },
  read,
};
