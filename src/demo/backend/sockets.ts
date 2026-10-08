import { normalizePath } from "./router";

/**
 * WebSockets to the backend are answered in the page. A socket handler gets
 * the server end of the connection; the browser end behaves like a normal
 * WebSocket, events and all.
 */

export interface ServerSocket {
  path: string;
  query: Record<string, string>;
  send(data: string | ArrayBuffer | Uint8Array | object): void;
  close(code?: number, reason?: string): void;
  onMessage(fn: (data: string | ArrayBuffer) => void): void;
  onClose(fn: () => void): void;
  readonly closed: boolean;
}

type SocketHandler = (
  socket: ServerSocket,
  params: Record<string, string>,
) => void;

const handlers: Array<{
  pattern: RegExp;
  keys: string[];
  handler: SocketHandler;
}> = [];

export function socket(path: string, handler: SocketHandler): void {
  const keys: string[] = [];
  const source = path
    .split("/")
    .map((part) => {
      if (part === "*") {
        keys.push("rest");
        return "(.*)";
      }
      if (part.startsWith(":")) {
        keys.push(part.slice(1));
        return "([^/]+)";
      }
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  handlers.push({ pattern: new RegExp(`^${source}/?$`), keys, handler });
}

const RealWebSocket = window.WebSocket;

class FakeWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  readyState = 0;
  binaryType: BinaryType = "blob";
  bufferedAmount = 0;
  extensions = "";
  protocol = "";
  readonly url: string;

  onopen: ((ev: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev: CloseEvent) => void) | null = null;
  onerror: ((ev: Event) => void) | null = null;

  private serverMessage: Array<(data: string | ArrayBuffer) => void> = [];
  private serverClose: Array<() => void> = [];

  constructor(
    url: string,
    handler: SocketHandler,
    params: Record<string, string>,
  ) {
    super();
    this.url = url;
    const { path, query } = normalizePath(url.replace(/^ws/, "http"));
    const isClosed = () => this.readyState >= 2;
    const server: ServerSocket = {
      path,
      query,
      get closed() {
        return isClosed();
      },
      send: (data) => {
        if (this.readyState !== 1) return;
        let payload: string | ArrayBuffer | Blob;
        if (typeof data === "string") payload = data;
        else if (data instanceof ArrayBuffer) payload = data;
        else if (data instanceof Uint8Array) payload = data.slice().buffer;
        else payload = JSON.stringify(data);
        if (typeof payload !== "string" && this.binaryType === "blob") {
          payload = new Blob([payload]);
        }
        setTimeout(
          () => this.emit(new MessageEvent("message", { data: payload })),
          0,
        );
      },
      close: (code = 1000, reason = "") => this.finish(code, reason),
      onMessage: (fn) => this.serverMessage.push(fn),
      onClose: (fn) => this.serverClose.push(fn),
    };
    setTimeout(() => {
      if (this.readyState !== 0) return;
      this.readyState = 1;
      try {
        handler(server, params);
      } catch (error) {
        console.error("[demo] socket handler threw", error);
        this.finish(1011, "error");
        return;
      }
      this.emit(new Event("open"));
    }, 120);
  }

  private emit(event: Event): void {
    const key = `on${event.type}` as "onopen";
    const fn = this[key] as ((ev: Event) => void) | null;
    fn?.call(this, event);
    this.dispatchEvent(event);
  }

  private finish(code: number, reason: string): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.serverClose.forEach((fn) => fn());
    setTimeout(
      () =>
        this.emit(new CloseEvent("close", { code, reason, wasClean: true })),
      0,
    );
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== 1) return;
    const deliver = (payload: string | ArrayBuffer) =>
      this.serverMessage.forEach((fn) => fn(payload));
    if (typeof data === "string") deliver(data);
    else if (data instanceof Blob) void data.arrayBuffer().then(deliver);
    else if (ArrayBuffer.isView(data)) {
      deliver(
        data.buffer.slice(
          data.byteOffset,
          data.byteOffset + data.byteLength,
        ) as ArrayBuffer,
      );
    } else deliver(data as ArrayBuffer);
  }

  close(code = 1000, reason = ""): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.finish(code, reason);
  }
}

function DemoWebSocket(url: string | URL, protocols?: string | string[]) {
  const href = String(url);
  const { path } = normalizePath(href.replace(/^ws/, "http"));
  for (const entry of handlers) {
    const match = entry.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    entry.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1] ?? "");
    });
    return new FakeWebSocket(href, entry.handler, params);
  }
  if (path.startsWith("/plugin-ws/") || path.startsWith("/ws")) {
    console.warn(`[demo] unhandled socket ${path}`);
    const dead = new FakeWebSocket(
      href,
      (s) => s.close(1011, "unavailable"),
      {},
    );
    return dead;
  }
  return new RealWebSocket(url, protocols);
}

{
  Object.assign(DemoWebSocket, {
    CONNECTING: 0,
    OPEN: 1,
    CLOSING: 2,
    CLOSED: 3,
    prototype: RealWebSocket.prototype,
  });
  (window as unknown as { WebSocket: unknown }).WebSocket = DemoWebSocket;
}
