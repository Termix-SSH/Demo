import { parseKeys } from "@termix-ssh/plugin-sdk/host-scripts";
import {
  SERVER_KINDS,
  type Backup,
  type ConfigFile,
  type FileContent,
  type Layout,
  type LogFile,
  type LogStats,
  type ServerInfo,
  type ServerKind,
  type Site,
  type WebStatus,
} from "../shared/types.js";
import { MARK } from "./scripts.js";
import { serverPaths, siteNameOf } from "./servers.js";
import { readSpec } from "./templates.js";

const DAY = 86_400_000;

export type Status = Omit<WebStatus, "watching" | "canEdit" | "readOnly">;

export function parseStatus(stdout: string): Status {
  const keys = parseKeys(stdout);
  const servers: ServerInfo[] = SERVER_KINDS.map((kind) => {
    const layout: Layout =
      kind === "caddy"
        ? "caddy"
        : keys[`${kind}layout`] === "debian"
          ? "debian"
          : "confd";
    return {
      ...serverPaths(kind, layout),
      installed: keys[kind] !== undefined,
      version: keys[kind] ?? "",
      state: keys[`${kind}state`] ?? "",
      boot: keys[`${kind}boot`] === "1",
    };
  });
  const php = stdout
    .split("\n")
    .filter((line) => line.startsWith("php="))
    .map((line) => line.slice(4).trim())
    .filter(Boolean);
  return {
    os: keys.os ?? "",
    root: keys.root === "1",
    systemd: keys.systemd === "1",
    manager: keys.manager ?? "none",
    certbot: keys.certbot ?? "",
    certbotNginx: keys.certbotnginx === "1",
    certbotApache: keys.certbotapache === "1",
    servers,
    phpSockets: [...new Set(php)],
  };
}

function toIso(text: string): string {
  const at = Date.parse(text);
  return Number.isFinite(at) ? new Date(at).toISOString() : "";
}

/** Drops comments, keeping text in quotes. Good enough for the facts below. */
function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/(^|\s)#.*$/, ""))
    .join("\n");
}

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

/** The facts a site list shows, read from a config file. */
export function siteFacts(
  kind: ServerKind,
  text: string,
): Pick<
  Site,
  | "names"
  | "listen"
  | "root"
  | "upstream"
  | "tls"
  | "certPath"
  | "accessLog"
  | "errorLog"
> {
  const body = stripComments(text);
  const all = (re: RegExp) => [...body.matchAll(re)].map((m) => m[1].trim());
  if (kind === "nginx") {
    const names = unique(
      all(/\bserver_name\s+([^;]+);/g).flatMap((v) => v.split(/\s+/)),
    );
    const listen = unique(all(/\blisten\s+([^;]+);/g));
    const certPath = all(/\bssl_certificate\s+([^;\s]+)\s*;/g)[0] ?? "";
    return {
      names,
      listen,
      root: all(/\broot\s+([^;\s]+)\s*;/g)[0] ?? "",
      upstream: all(/\bproxy_pass\s+([^;\s]+)\s*;/g)[0] ?? "",
      tls: !!certPath || listen.some((l) => /\bssl\b/.test(l)),
      certPath,
      accessLog: (all(/\baccess_log\s+([^;\s]+)/g)[0] ?? "").replace(
        /^off$/,
        "",
      ),
      errorLog: all(/\berror_log\s+([^;\s]+)/g)[0] ?? "",
    };
  }
  if (kind === "apache") {
    const names = unique([
      ...all(/^\s*ServerName\s+(\S+)/gim),
      ...all(/^\s*ServerAlias\s+(.+)$/gim).flatMap((v) => v.split(/\s+/)),
    ]);
    const listen = unique(all(/<VirtualHost\s+([^>]+)>/gi));
    const certPath = all(/^\s*SSLCertificateFile\s+(\S+)/gim)[0] ?? "";
    const proxy = body.match(/^\s*ProxyPass\s+\S+\s+(\S+)/im);
    return {
      names,
      listen,
      root: (all(/^\s*DocumentRoot\s+(\S+)/gim)[0] ?? "").replace(/"/g, ""),
      upstream: proxy?.[1] ?? "",
      tls: !!certPath || /^\s*SSLEngine\s+on/im.test(body),
      certPath,
      accessLog: all(/^\s*CustomLog\s+(\S+)/gim)[0] ?? "",
      errorLog: all(/^\s*ErrorLog\s+(\S+)/gim)[0] ?? "",
    };
  }
  // Caddy: a site block starts with its addresses at the top level.
  const names: string[] = [];
  const listen: string[] = [];
  let depth = 0;
  let tls = false;
  for (const raw of body.split("\n")) {
    const line = raw.trim();
    if (depth === 0 && line.endsWith("{") && !line.startsWith("(")) {
      const head = line.slice(0, -1).trim();
      if (head) {
        for (const addr of head.split(/[\s,]+/).filter(Boolean)) {
          listen.push(addr);
          if (!addr.startsWith("http://")) tls = true;
          const host = addr
            .replace(/^https?:\/\//, "")
            .replace(/:\d+$/, "")
            .replace(/\/.*$/, "");
          if (host) names.push(host);
        }
      }
    }
    depth += (line.match(/{/g) ?? []).length;
    depth -= (line.match(/}/g) ?? []).length;
    if (depth < 0) depth = 0;
  }
  return {
    names: unique(names),
    listen: unique(listen),
    root: all(/^\s*root\s+(?:\*\s+)?(\S+)/gm)[0] ?? "",
    upstream: all(/^\s*reverse_proxy\s+(?:\S*\/\S*\s+)?(\S+)/gm)[0] ?? "",
    tls,
    certPath: "",
    accessLog: all(/^\s*output\s+file\s+(\S+)/gm)[0] ?? "",
    errorLog: "",
  };
}

/** Each site from the list script, sorted by server then name. */
export function parseSites(stdout: string, now = Date.now()): Site[] {
  const certs = new Map<string, string>();
  for (const line of stdout.split("\n")) {
    if (!line.startsWith(`${MARK}CERT `)) continue;
    const rest = line.slice(MARK.length + 5);
    const bar = rest.lastIndexOf("|");
    if (bar > 0) certs.set(rest.slice(0, bar), toIso(rest.slice(bar + 1)));
  }
  const sites: Site[] = [];
  const parts = stdout.split(`${MARK}FILE `).slice(1);
  for (const part of parts) {
    const newline = part.indexOf("\n");
    const [kind, en, file] = part.slice(0, newline).split("|");
    if (!SERVER_KINDS.includes(kind as ServerKind) || !file) continue;
    const end = part.lastIndexOf(`${MARK}END`);
    const text = part.slice(newline + 1, end < 0 ? undefined : end);
    const facts = siteFacts(kind as ServerKind, text);
    const name = siteNameOf(file.split("/").pop() ?? "");
    const certExpiry = facts.certPath ? (certs.get(facts.certPath) ?? "") : "";
    const at = certExpiry ? Date.parse(certExpiry) : NaN;
    sites.push({
      key: `${kind}:${name}`,
      server: kind as ServerKind,
      name,
      file,
      enabled: en === "1",
      ...facts,
      certExpiry,
      certDaysLeft: Number.isFinite(at) ? Math.floor((at - now) / DAY) : null,
      spec: readSpec(text),
    });
  }
  // A file in sites-enabled that is not a link shows up once.
  const seen = new Set<string>();
  return sites
    .filter((site) => {
      if (seen.has(site.key)) return false;
      seen.add(site.key);
      return true;
    })
    .sort(
      (a, b) =>
        a.server.localeCompare(b.server) || a.name.localeCompare(b.name),
    );
}

/** The text after the list script's FILE line, for a single site. */
export function parseSiteFile(stdout: string): {
  file: string;
  enabled: boolean;
  text: string;
} {
  const at = stdout.indexOf(`${MARK}FILE `);
  const newline = stdout.indexOf("\n", at);
  const [, en, file] = stdout.slice(at + MARK.length + 5, newline).split("|");
  return {
    file: file ?? "",
    enabled: en === "1",
    text: stdout.slice(newline + 1),
  };
}

export function parseFiles(stdout: string): ConfigFile[] {
  return stdout.split("\n").flatMap((line) => {
    const parts = line.split("|");
    if (parts.length < 3 || !parts[0].startsWith("/")) return [];
    return [
      { path: parts[0], size: Number(parts[1]) || 0, link: parts[2] === "1" },
    ];
  });
}

export function parseFileContent(stdout: string): FileContent {
  const lines = stdout.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${MARK}PATH `));
  const path = at >= 0 ? lines[at].slice(MARK.length + 5).trim() : "";
  const content = Buffer.from(lines[at + 1] ?? "", "base64").toString("utf8");
  const backups: Backup[] = lines.flatMap((line) => {
    if (!line.startsWith(`${MARK}BACKUP `)) return [];
    const [id, size] = line.slice(MARK.length + 7).split("|");
    const seconds = Number(id);
    if (!Number.isFinite(seconds)) return [];
    return [
      {
        id,
        at: new Date(seconds * 1000).toISOString(),
        size: Number(size) || 0,
      },
    ];
  });
  backups.sort((a, b) => b.id.localeCompare(a.id));
  return { path, content, backups };
}

export function parseLogFiles(stdout: string): LogFile[] {
  return stdout.split("\n").flatMap((line) => {
    const bar = line.lastIndexOf("|");
    if (bar < 0 || !line.startsWith("/")) return [];
    return [
      { path: line.slice(0, bar), size: Number(line.slice(bar + 1)) || 0 },
    ];
  });
}

const COMBINED =
  /^(\S+) \S+ \S+ \[[^\]]+\] "(?:[A-Z]+ )?([^ "]*)[^"]*" (\d{3}) /;

function top(counts: Map<string, number>, limit = 10) {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, count]) => ({ value, count }));
}

/**
 * Counts from access log lines in the common or combined format, or Caddy's
 * JSON. Null when no line looks like an access log.
 */
export function logStats(lines: string[]): LogStats | null {
  const status: LogStats["status"] = {
    "2xx": 0,
    "3xx": 0,
    "4xx": 0,
    "5xx": 0,
    other: 0,
  };
  const paths = new Map<string, number>();
  const clients = new Map<string, number>();
  let counted = 0;
  for (const line of lines) {
    let ip = "";
    let path = "";
    let code = 0;
    const match = COMBINED.exec(line);
    if (match) {
      ip = match[1];
      path = match[2];
      code = Number(match[3]);
    } else if (line.startsWith("{")) {
      try {
        const entry = JSON.parse(line) as {
          status?: number;
          request?: { uri?: string; remote_ip?: string; client_ip?: string };
        };
        if (typeof entry.status !== "number" || !entry.request) continue;
        ip = entry.request.client_ip ?? entry.request.remote_ip ?? "";
        path = entry.request.uri ?? "";
        code = entry.status;
      } catch {
        continue;
      }
    } else {
      continue;
    }
    counted++;
    const group = Math.floor(code / 100);
    if (group >= 2 && group <= 5) status[`${group}xx` as "2xx"]++;
    else status.other++;
    const bare = path.split("?")[0] || "/";
    paths.set(bare, (paths.get(bare) ?? 0) + 1);
    if (ip) clients.set(ip, (clients.get(ip) ?? 0) + 1);
  }
  if (counted === 0) return null;
  return { lines: counted, status, paths: top(paths), clients: top(clients) };
}
