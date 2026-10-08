import { dispatch, normalizePath, type Method } from "./router";
import { latency } from "./adapter";

/**
 * fetch() calls to backend paths go to the same routes axios does. Anything
 * else (fonts, the registry, the docs) is a real request.
 */

const BACKEND_PREFIXES = [
  "/users",
  "/plugins",
  "/plugin-api/",
  "/plugin-assets/",
  "/host",
  "/credentials",
  "/rbac",
  "/version",
  "/health",
  "/releases",
  "/database",
  "/sync",
  "/audit-logs",
];

/** Routes that answer with a raw Response, for streams and file bodies. */
const rawHandlers: Array<{
  test: (path: string) => boolean;
  handle: (path: string, init: RequestInit | undefined) => Promise<Response>;
}> = [];

export function rawFetch(
  test: (path: string) => boolean,
  handle: (path: string, init: RequestInit | undefined) => Promise<Response>,
): void {
  rawHandlers.push({ test, handle });
}

const realFetch = window.fetch.bind(window);

{
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const sameOrigin =
      url.startsWith("/") ||
      url.startsWith(window.location.origin) ||
      !/^[a-z]+:\/\//i.test(url);
    if (!sameOrigin) return realFetch(input, init);
    const { path } = normalizePath(url);
    if (!BACKEND_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return realFetch(input, init);
    }
    const raw = rawHandlers.find((h) => h.test(path));
    if (raw) return raw.handle(path, init);
    await latency();
    const method = (init?.method ?? "GET").toUpperCase() as Method;
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        // Not JSON, pass it through.
      }
    }
    const { status, data } = await dispatch(method, url, body);
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
}
