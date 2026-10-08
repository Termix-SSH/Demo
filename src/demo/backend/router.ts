/**
 * The fake backend's routing table. Paths are matched after the API prefix
 * and base path are stripped, so a route reads like the real Express one:
 * route("GET", "/host/db/host/:id", ...).
 */

export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface DemoRequest {
  method: Method;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly data: unknown = { error: "Request failed" },
  ) {
    super(
      typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : `HTTP ${status}`,
    );
  }
}

export type Handler = (req: DemoRequest) => unknown | Promise<unknown>;

interface Route {
  method: Method;
  pattern: RegExp;
  keys: string[];
  handler: Handler;
  specificity: number;
}

const routes: Route[] = [];

function compile(path: string): { pattern: RegExp; keys: string[] } {
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
  return { pattern: new RegExp(`^${source}/?$`), keys };
}

export function route(method: Method, path: string, handler: Handler): void {
  const { pattern, keys } = compile(path);
  routes.push({
    method,
    pattern,
    keys,
    handler,
    specificity: path.split("/").filter((p) => p && !p.startsWith(":")).length,
  });
  routes.sort((a, b) => b.specificity - a.specificity);
}

export const get = (path: string, handler: Handler) =>
  route("GET", path, handler);
export const post = (path: string, handler: Handler) =>
  route("POST", path, handler);
export const put = (path: string, handler: Handler) =>
  route("PUT", path, handler);
export const patch = (path: string, handler: Handler) =>
  route("PATCH", path, handler);
export const del = (path: string, handler: Handler) =>
  route("DELETE", path, handler);

/** Strips the origin, the dev proxy prefix and the base path. */
export function normalizePath(url: string): {
  path: string;
  query: Record<string, string>;
} {
  const parsed = new URL(url, "http://demo.local");
  let path = decodeURI(parsed.pathname);
  path = path.replace(/^\/__termix_api\/\d+/, "");
  const base = new URL(document.baseURI).pathname.replace(/\/$/, "");
  if (base && path.startsWith(base + "/")) path = path.slice(base.length);
  const query: Record<string, string> = {};
  parsed.searchParams.forEach((value, key) => {
    query[key] = value;
  });
  return { path, query };
}

const warned = new Set<string>();

export async function dispatch(
  method: Method,
  url: string,
  body: unknown,
  extraQuery: Record<string, unknown> = {},
): Promise<{ status: number; data: unknown }> {
  const { path, query } = normalizePath(url);
  for (const [key, value] of Object.entries(extraQuery)) {
    if (value !== undefined && value !== null) query[key] = String(value);
  }
  for (const r of routes) {
    if (r.method !== method) continue;
    const match = r.pattern.exec(path);
    if (!match) continue;
    const params: Record<string, string> = {};
    r.keys.forEach((key, i) => {
      params[key] = decodeURIComponent(match[i + 1] ?? "");
    });
    try {
      const data = await r.handler({ method, path, params, query, body });
      return {
        status: 200,
        data: data === undefined ? { success: true } : data,
      };
    } catch (error) {
      if (error instanceof HttpError) {
        return { status: error.status, data: error.data };
      }
      console.error(`[demo] ${method} ${path} threw`, error);
      return { status: 500, data: { error: "Demo backend error" } };
    }
  }
  const key = `${method} ${path}`;
  if (!warned.has(key)) {
    warned.add(key);
    console.warn(`[demo] unhandled ${key}`);
  }
  return method === "GET"
    ? { status: 404, data: { error: "Not available in the demo" } }
    : { status: 200, data: { success: true } };
}
