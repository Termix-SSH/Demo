import type { Reading } from "../../shared/types.js";
import { baseUrl, describeStatus, json, send, socketUrl } from "./http.js";
import {
  DriverError,
  obj,
  str,
  type Driver,
  type DriverIo,
  type Target,
} from "./types.js";

const SESSION_TTL_MS = 10 * 60_000;
const SIGNAL_MS = 15_000;
// The JetKVM sends its ICE candidates after the answer
const CANDIDATE_MS = 1_500;
const sessions = new Map<string, { cookie: string; until: number }>();
// Newer firmware only reports its version on the signaling socket
const versions = new Map<string, string>();

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
    version: str(status.version) || versions.get(key(target)) || undefined,
    // The JetKVM only reports power over its WebRTC data channel
    power: "unknown",
  };
}

export interface RelayAnswer {
  sd: string;
  /** ICE candidates the JetKVM sent on the signaling socket. */
  candidates: unknown[];
}

class SignalError extends DriverError {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** Firmware 0.5.9 and later signal over a WebSocket. */
function signal(
  target: Target,
  io: DriverIo,
  cookie: string,
  offer: string,
): Promise<RelayAnswer> {
  return new Promise((resolve, reject) => {
    const socket = io.connect(
      socketUrl(target, "/webrtc/signaling/client", "http"),
      {
        headers: cookie ? { cookie } : {},
        ca: target.ca,
        pin: target.options.pin,
      },
    );
    let answer = "";
    const candidates: unknown[] = [];
    let gather: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(gather);
      try {
        socket.close();
      } catch {
        // already closed
      }
      if (error) reject(error);
      else resolve({ sd: answer, candidates });
    };
    const timer = setTimeout(
      () =>
        finish(
          answer ? undefined : new DriverError("The JetKVM sent no answer"),
        ),
      SIGNAL_MS,
    );
    socket.on("open", (() =>
      socket.send(
        JSON.stringify({ type: "offer", data: { sd: offer } }),
      )) as never);
    socket.on("message", ((raw: unknown) => {
      let message: Record<string, unknown>;
      try {
        message = obj(JSON.parse(String(raw)));
      } catch {
        return;
      }
      if (message.error) {
        finish(new DriverError("The JetKVM refused the session"));
      } else if (message.type === "device-metadata") {
        const version = str(obj(message.data).deviceVersion);
        if (version) versions.set(key(target), version);
      } else if (message.type === "answer") {
        answer = str(message.data);
        if (!answer) finish(new DriverError("The JetKVM sent no answer"));
        else gather = setTimeout(() => finish(), CANDIDATE_MS);
      } else if (message.type === "new-ice-candidate" && message.data) {
        candidates.push(message.data);
      }
    }) as never);
    socket.on("error", ((error: unknown) => {
      const text = error instanceof Error ? error.message : String(error);
      const status = Number(/server response: (\d+)/.exec(text)?.[1]);
      finish(
        new SignalError(
          status ? describeStatus(status) : `Could not reach the KVM: ${text}`,
          status || undefined,
        ),
      );
    }) as never);
    socket.on("close", (() =>
      finish(
        answer
          ? undefined
          : new DriverError("The JetKVM closed the connection"),
      )) as never);
  });
}

/** Firmware before 0.5.9 takes the offer in one request. */
async function post(
  target: Target,
  io: DriverIo,
  cookie: string,
  offer: string,
): Promise<RelayAnswer> {
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
  if (!response.ok) {
    throw new SignalError(describeStatus(response.status), response.status);
  }
  const answer = str(obj(await json(response)).sd);
  if (!answer) throw new DriverError("The JetKVM sent no answer");
  return { sd: answer, candidates: [] };
}

/**
 * Passes the browser's WebRTC offer to the JetKVM and returns its answer.
 * The video and keys then travel straight between the browser and the KVM.
 */
export async function relaySession(
  target: Target,
  io: DriverIo,
  offer: string,
): Promise<RelayAnswer> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const cookie = await cookieFor(target, io);
    try {
      try {
        return await signal(target, io, cookie, offer);
      } catch (error) {
        if (!(error instanceof SignalError) || error.status !== 404) {
          throw error;
        }
        return await post(target, io, cookie, offer);
      }
    } catch (error) {
      if (error instanceof SignalError && error.status === 401 && !attempt) {
        sessions.delete(key(target));
        continue;
      }
      throw error;
    }
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
