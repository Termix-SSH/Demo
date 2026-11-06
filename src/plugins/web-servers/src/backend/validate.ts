import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import {
  SERVER_KINDS,
  type ServerKind,
  type ServiceAction,
  type SiteSpec,
  type SiteType,
} from "../shared/types.js";

const SITE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const HOST_NAME_RE =
  /^(\*\.)?([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;
const PATH_RE = /^\/[A-Za-z0-9/._@+-]{0,250}$/;
const UPSTREAM_RE =
  /^(https?):\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?(\/[A-Za-z0-9/._~%+-]*)?$/;
const URL_RE =
  /^https?:\/\/(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+)(:\d{1,5})?(\/[A-Za-z0-9/._~%+-]*)?$/;
const PHP_RE =
  /^(\/[A-Za-z0-9/._@+-]{1,200}\.sock|[A-Za-z0-9.-]{1,200}:\d{1,5})$/;
const INDEX_RE = /^[A-Za-z0-9._-]{1,60}( [A-Za-z0-9._-]{1,60}){0,5}$/;
const EMAIL_RE = /^[^\s@'"`$\\]+@[^\s@'"`$\\]+\.[^\s@'"`$\\]+$/;
/** Web roots stay under these, so a site can't serve /etc. */
export const WEB_ROOTS = [
  "/var/www",
  "/srv",
  "/usr/share/nginx",
  "/opt",
  "/home",
];

export const SERVICE_ACTIONS: ServiceAction[] = [
  "start",
  "stop",
  "restart",
  "reload",
  "enable",
  "disable",
];

export function cleanKind(value: unknown): ServerKind {
  if (!SERVER_KINDS.includes(value as ServerKind)) {
    throw new HostScriptError("Pick nginx, Apache or Caddy");
  }
  return value as ServerKind;
}

export function cleanAction(value: unknown): ServiceAction {
  if (!SERVICE_ACTIONS.includes(value as ServiceAction)) {
    throw new HostScriptError("Unknown action");
  }
  return value as ServiceAction;
}

export function cleanSiteName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!SITE_NAME_RE.test(name) || name.includes("..")) {
    throw new HostScriptError(
      "Site names may use letters, numbers, dots, dashes and underscores",
    );
  }
  if (/\.(conf|caddy|disabled)$/.test(name)) {
    throw new HostScriptError("Leave the file ending out of the site name");
  }
  return name;
}

/** "nginx:example" to its parts. */
export function parseSiteKey(value: unknown): {
  server: ServerKind;
  name: string;
} {
  const key = typeof value === "string" ? value : "";
  const at = key.indexOf(":");
  if (at < 0) throw new HostScriptError("Unknown site");
  return {
    server: cleanKind(key.slice(0, at)),
    name: cleanSiteName(key.slice(at + 1)),
  };
}

export function cleanPath(value: unknown, what = "path"): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (!PATH_RE.test(path) || path.includes("..") || path.includes("//")) {
    throw new HostScriptError(`The ${what} is not a valid path`);
  }
  return path;
}

/** A path that must be inside one of `roots`. */
export function cleanPathUnder(
  value: unknown,
  roots: string[],
  what = "path",
): string {
  const path = cleanPath(value, what);
  if (!roots.some((root) => path === root || path.startsWith(`${root}/`))) {
    throw new HostScriptError(`The ${what} must be inside ${roots.join(", ")}`);
  }
  return path;
}

export function cleanEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim() : "";
  if (email && !EMAIL_RE.test(email)) {
    throw new HostScriptError("The email is not valid");
  }
  return email;
}

function cleanPort(value: unknown, fallback: number): number {
  if (value === undefined || value === null || value === "") return fallback;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HostScriptError("The port is not valid");
  }
  return port;
}

function cleanHostName(value: string): string {
  const name = value.trim().toLowerCase();
  if (name === "_" || IPV4_RE.test(name) || HOST_NAME_RE.test(name)) {
    return name;
  }
  throw new HostScriptError(`${value} is not a valid host name`);
}

const TYPES: SiteType[] = ["static", "proxy", "php", "redirect"];

/** Checks every field the site form sends and fills in defaults. */
export function cleanSpec(input: unknown, server: ServerKind): SiteSpec {
  const raw = (input && typeof input === "object" ? input : {}) as Record<
    string,
    unknown
  >;
  const type = raw.type as SiteType;
  if (!TYPES.includes(type)) throw new HostScriptError("Pick a site type");
  const names = (Array.isArray(raw.names) ? raw.names : [])
    .map((n) => String(n).trim())
    .filter(Boolean)
    .map(cleanHostName);
  if (names.length === 0) throw new HostScriptError("Enter a domain");
  if (names.length > 50) throw new HostScriptError("Too many domains");
  if (server === "caddy" && names.includes("_")) {
    throw new HostScriptError("Caddy has no catch all name, use a domain");
  }

  const https = raw.https === true;
  const spec: SiteSpec = {
    type,
    names: [...new Set(names)],
    port: cleanPort(raw.port, 80),
    root: "",
    index: "",
    spa: type === "static" && raw.spa === true,
    upstream: "",
    websockets: type === "proxy" && raw.websockets !== false,
    redirectTo: "",
    keepPath: type === "redirect" && raw.keepPath !== false,
    phpSocket: "",
    https,
    httpsPort: cleanPort(raw.httpsPort, 443),
    certPath: "",
    keyPath: "",
    forceHttps: https && raw.forceHttps !== false,
    gzip: raw.gzip !== false,
    maxBodyMb: 0,
    accessLog: raw.accessLog !== false,
  };

  if (type === "static" || type === "php") {
    spec.root = cleanPathUnder(raw.root, WEB_ROOTS, "web root");
    const index =
      typeof raw.index === "string" && raw.index.trim()
        ? raw.index.trim().replace(/\s+/g, " ")
        : type === "php"
          ? "index.php index.html"
          : "index.html index.htm";
    if (!INDEX_RE.test(index)) {
      throw new HostScriptError("The index files are not valid");
    }
    spec.index = index;
  }
  if (type === "proxy") {
    const upstream =
      typeof raw.upstream === "string" ? raw.upstream.trim() : "";
    if (!UPSTREAM_RE.test(upstream)) {
      throw new HostScriptError(
        "Enter the app address, like http://127.0.0.1:3000",
      );
    }
    spec.upstream = upstream;
  }
  if (type === "redirect") {
    const to = typeof raw.redirectTo === "string" ? raw.redirectTo.trim() : "";
    if (!URL_RE.test(to)) {
      throw new HostScriptError(
        "Enter where to send visitors, like https://example.com",
      );
    }
    spec.redirectTo = to.replace(/\/$/, "");
  }
  if (type === "php") {
    const socket =
      typeof raw.phpSocket === "string" ? raw.phpSocket.trim() : "";
    if (!PHP_RE.test(socket) || socket.includes("..")) {
      throw new HostScriptError(
        "Enter the php-fpm socket, like /run/php/php8.2-fpm.sock or 127.0.0.1:9000",
      );
    }
    spec.phpSocket = socket;
  }
  if (https && server !== "caddy") {
    spec.certPath = raw.certPath ? cleanPath(raw.certPath, "certificate") : "";
    spec.keyPath = raw.keyPath ? cleanPath(raw.keyPath, "key") : "";
    if (!spec.certPath || !spec.keyPath) {
      throw new HostScriptError(
        "HTTPS needs a certificate and key. Save the site without HTTPS first, then press Get certificate.",
      );
    }
  }
  if (spec.port === spec.httpsPort && https) {
    throw new HostScriptError("HTTP and HTTPS need different ports");
  }
  const body = Number(raw.maxBodyMb ?? 0);
  if (!Number.isInteger(body) || body < 0 || body > 102_400) {
    throw new HostScriptError("The upload limit is not valid");
  }
  spec.maxBodyMb = body;
  return spec;
}

/** A file body to save. Text only, and not too big. */
export function cleanContent(value: unknown): string {
  if (typeof value !== "string") throw new HostScriptError("Missing content");
  if (value.length > 512 * 1024) {
    throw new HostScriptError("The file is too big to edit here");
  }
  if (value.includes("\0")) throw new HostScriptError("The file is not text");
  return value;
}

export function cleanLines(value: unknown): number {
  const lines = Number(value ?? 200);
  return Number.isInteger(lines) ? Math.min(5000, Math.max(10, lines)) : 200;
}

export function cleanBackupId(value: unknown): string {
  const id = typeof value === "string" ? value : "";
  if (!/^\d{10,13}$/.test(id)) throw new HostScriptError("Unknown backup");
  return id;
}
