import { AsyncResource } from "node:async_hooks";
import type {
  PluginContext,
  PluginWebSocketConnection,
} from "@termix-ssh/plugin-sdk/backend";
import type { InputEvent } from "../shared/types.js";
import type { ScreenSession } from "./drivers/index.js";
import type { Service } from "./service.js";

const OPEN = 1;
const PING_MS = 30_000;
const MAX_MESSAGE_BYTES = 64 * 1024;
// Drop frames when the browser falls behind
const MAX_BUFFERED = 2 * 1024 * 1024;
const MIN_FRAME_GAP_MS = 50;
const DEFAULT_MAX_MINUTES = 240;

interface Socket {
  readyState: number;
  bufferedAmount: number;
  send: (data: string | Buffer, options?: { binary: boolean }) => void;
  close: (code?: number, reason?: string) => void;
  ping: () => void;
  on: (event: string, listener: (...args: never[]) => void) => unknown;
}

export function parseInput(value: unknown): InputEvent | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  switch (event.t) {
    case "key":
      return typeof event.code === "string" &&
        event.code.length <= 24 &&
        typeof event.down === "boolean"
        ? { t: "key", code: event.code, down: event.down }
        : null;
    case "move":
      return typeof event.x === "number" && typeof event.y === "number"
        ? { t: "move", x: event.x, y: event.y }
        : null;
    case "button":
      return (event.button === 0 || event.button === 1 || event.button === 2) &&
        typeof event.down === "boolean"
        ? { t: "button", button: event.button, down: event.down }
        : null;
    case "wheel":
      return typeof event.dy === "number" ? { t: "wheel", dy: event.dy } : null;
    case "text":
      return typeof event.text === "string" && event.text.length <= 10_000
        ? { t: "text", text: event.text }
        : null;
    default:
      return null;
  }
}

/**
 * The screen at /plugin-ws/ip-kvm/screen. JPEG frames go to the browser as
 * binary messages. Keys and mouse come back as JSON.
 */
export function registerScreen(ctx: PluginContext, service: Service): void {
  const live = new Set<() => void>();
  ctx.disposables.add(() => {
    for (const end of [...live]) end();
    live.clear();
  });

  const onConnection = async (connection: PluginWebSocketConnection) => {
    const ws = connection.socket as Socket;
    const userId = connection.userId;
    if (!userId || !(await ctx.rbac.hasFor(userId, "console"))) {
      ws.close(1008, "Not allowed");
      return;
    }
    const send = (message: Record<string, unknown>) => {
      if (ws.readyState === OPEN) ws.send(JSON.stringify(message));
    };

    let session: ScreenSession | null = null;
    let attempt = 0;
    let lastFrame = 0;
    let limit: ReturnType<typeof setTimeout> | null = null;
    const pingTimer = setInterval(() => {
      if (ws.readyState === OPEN) ws.ping();
    }, PING_MS);

    const endSession = () => {
      const current = session;
      session = null;
      if (limit) clearTimeout(limit);
      limit = null;
      try {
        current?.close();
      } catch {
        // already closed
      }
    };
    const cleanup = () => {
      attempt++;
      clearInterval(pingTimer);
      endSession();
      live.delete(shutdown);
    };
    const shutdown = () => {
      cleanup();
      try {
        ws.close(1001, "Plugin disabled");
      } catch {
        // already closed
      }
    };
    live.add(shutdown);

    const connect = async (data: Record<string, unknown>) => {
      const mine = ++attempt;
      endSession();
      if (!connection.isDataUnlocked()) {
        send({ type: "error", message: "Session expired, log in again" });
        return;
      }
      try {
        const id = Number(data.id);
        const device = await service.get(id);
        if (device.hostId !== null) {
          const access = await ctx.asUser(userId, () =>
            ctx.hosts.checkAccess(device.hostId as number, "edit"),
          );
          if (!access.hasAccess) {
            send({
              type: "error",
              message: "You need edit access to this host",
            });
            return;
          }
        }
        const opened = await service.openScreen(id, {
          onFrame: (jpeg) => {
            const now = Date.now();
            if (
              ws.readyState !== OPEN ||
              ws.bufferedAmount > MAX_BUFFERED ||
              now - lastFrame < MIN_FRAME_GAP_MS
            ) {
              return;
            }
            lastFrame = now;
            ws.send(Buffer.from(jpeg), { binary: true });
          },
          onClose: (reason) => {
            if (mine !== attempt) return;
            send({ type: "ended", message: reason ?? "" });
            endSession();
          },
        });
        if (ws.readyState !== OPEN || mine !== attempt) {
          opened.close();
          return;
        }
        session = opened;
        const minutes =
          (await ctx.settings
            .get<number>("maxSessionMinutes")
            .catch(() => null)) ?? DEFAULT_MAX_MINUTES;
        if (minutes > 0) {
          limit = setTimeout(() => {
            send({ type: "ended", message: "The session time limit passed" });
            endSession();
          }, minutes * 60_000);
        }
        send({ type: "started" });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Could not connect";
        send({ type: "error", message });
      }
    };

    ws.on(
      "message",
      AsyncResource.bind(async (raw: { toString: () => string }) => {
        let message: { type?: unknown; data?: unknown };
        try {
          const text = raw.toString();
          if (text.length > MAX_MESSAGE_BYTES)
            throw new Error("Message too large");
          message = JSON.parse(text);
        } catch {
          send({ type: "error", message: "Bad message" });
          return;
        }
        switch (message.type) {
          case "connect":
            await connect(
              message.data && typeof message.data === "object"
                ? (message.data as Record<string, unknown>)
                : {},
            );
            break;
          case "input": {
            const event = parseInput(message.data);
            if (event) session?.input(event);
            break;
          }
          case "disconnect":
            attempt++;
            endSession();
            break;
          default:
            break;
        }
      }) as never,
    );
    ws.on("close", cleanup as never);
    ws.on("error", cleanup as never);
  };

  ctx.ws.route("/screen", onConnection, { public: true, optionalAuth: true });
}
