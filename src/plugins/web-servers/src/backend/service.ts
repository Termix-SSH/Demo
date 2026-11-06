import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ActionResult,
  ConfigFile,
  FileContent,
  LogFile,
  LogResult,
  LogSource,
  ServerInfo,
  ServerKind,
  ServiceAction,
  Site,
  SiteSpec,
  TestResult,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import {
  logStats,
  parseFileContent,
  parseFiles,
  parseLogFiles,
  parseSiteFile,
  parseSites,
  parseStatus,
  siteFacts,
  type Status,
} from "./parse.js";
import type { Remote } from "./remote.js";
import {
  LOG_ROOT,
  MARK,
  STATUS_SCRIPT,
  certbotScript,
  deleteSiteScript,
  installCertbotScript,
  installServerScript,
  journalScript,
  listFilesScript,
  listLogsScript,
  listScript,
  readFileScript,
  readSiteScript,
  saveSiteScript,
  serviceScript,
  tailScript,
  testScript,
  toggleSiteScript,
  writeFileScript,
} from "./scripts.js";
import {
  label,
  requireInstalled,
  siteCandidates,
  siteFileName,
} from "./servers.js";
import { dropSpec, readSpec, renderSite } from "./templates.js";
import {
  cleanBackupId,
  cleanContent,
  cleanEmail,
  cleanKind,
  cleanLines,
  cleanPathUnder,
  cleanSiteName,
  cleanSpec,
} from "./validate.js";

const OUTPUT_LIMIT = 8000;
const DOMAIN_RE =
  /^([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

export interface WebService {
  status: (hostId: number, s: HostSettings) => Promise<Status>;
  sites: (hostId: number, s: HostSettings) => Promise<Site[]>;
  readSite: (
    hostId: number,
    s: HostSettings,
    server: ServerKind,
    name: string,
  ) => Promise<{
    file: string;
    enabled: boolean;
    content: string;
    spec: SiteSpec | null;
  }>;
  preview: (
    hostId: number,
    s: HostSettings,
    server: unknown,
    name: unknown,
    spec: unknown,
  ) => Promise<{ content: string }>;
  saveSite: (
    hostId: number,
    s: HostSettings,
    body: { server: unknown; name: unknown; spec?: unknown; content?: unknown },
    isNew: boolean,
  ) => Promise<ActionResult>;
  toggleSite: (
    hostId: number,
    s: HostSettings,
    server: ServerKind,
    name: string,
    on: boolean,
  ) => Promise<ActionResult>;
  deleteSite: (
    hostId: number,
    s: HostSettings,
    server: ServerKind,
    name: string,
  ) => Promise<ActionResult>;
  issueCert: (
    hostId: number,
    s: HostSettings,
    server: ServerKind,
    name: string,
    body: { email?: unknown; staging?: unknown },
  ) => Promise<ActionResult>;
  files: (
    hostId: number,
    s: HostSettings,
    server: unknown,
  ) => Promise<ConfigFile[]>;
  readFile: (
    hostId: number,
    s: HostSettings,
    server: unknown,
    path: unknown,
  ) => Promise<FileContent>;
  writeFile: (
    hostId: number,
    s: HostSettings,
    server: unknown,
    path: unknown,
    content: unknown,
    backupId?: unknown,
  ) => Promise<ActionResult>;
  test: (
    hostId: number,
    s: HostSettings,
    server: unknown,
  ) => Promise<TestResult>;
  act: (
    hostId: number,
    s: HostSettings,
    server: ServerKind,
    action: ServiceAction,
  ) => Promise<ActionResult>;
  install: (
    hostId: number,
    s: HostSettings,
    server: unknown,
  ) => Promise<ActionResult>;
  installCertbot: (hostId: number, s: HostSettings) => Promise<ActionResult>;
  logFiles: (hostId: number, s: HostSettings) => Promise<LogFile[]>;
  readLog: (
    hostId: number,
    s: HostSettings,
    source: LogSource,
    lines: unknown,
  ) => Promise<LogResult>;
}

/** Keeps only the last state of lines a tool redrew with \r, like apt. */
export function cleanOutput(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/\r+$/, "").split("\r").pop() ?? "")
    .join("\n")
    .trim();
}

/** The line of a failed command that best says what went wrong. */
export function pickMessage(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  // A line ending in ":" only leads into the real message.
  const hit = lines.find(
    (line) =>
      !line.endsWith(":") &&
      /\b(error|failed|cannot|can't|invalid|unable|not found|denied|emerg)\b/i.test(
        line,
      ),
  );
  return (hit ?? lines.at(-1) ?? "").slice(0, 500);
}

/** A log source from a query or socket message. */
export function cleanLogSource(input: {
  kind?: unknown;
  path?: unknown;
  server?: unknown;
}): LogSource {
  if (input.kind === "journal") {
    return { kind: "journal", server: cleanKind(input.server) };
  }
  return {
    kind: "file",
    path: cleanPathUnder(input.path, [LOG_ROOT], "log file"),
  };
}

export function createService(remote: Remote): WebService {
  const status = async (hostId: number, s: HostSettings) =>
    parseStatus((await remote.read(hostId, s.sudo, STATUS_SCRIPT)).stdout);

  const installed = async (hostId: number, s: HostSettings) =>
    (await status(hostId, s)).servers.filter((server) => server.installed);

  const server = async (hostId: number, s: HostSettings, kind: unknown) =>
    requireInstalled((await status(hostId, s)).servers, cleanKind(kind));

  /** Runs a change as root and keeps the end of its output. */
  const change = async (
    hostId: number,
    s: HostSettings,
    script: string,
    timeoutMs = 120_000,
  ): Promise<ActionResult> => {
    const result = await remote.root(hostId, s.sudo, script, {
      timeoutMs,
      maxOutputBytes: 2_000_000,
      allowFail: true,
    });
    const output = cleanOutput(result.stdout);
    const tail =
      output.length > OUTPUT_LIMIT ? output.slice(-OUTPUT_LIMIT) : output;
    if (result.code !== 0) {
      if (/password is required|a terminal is required/i.test(result.stderr)) {
        throw new HostScriptError(
          "This host needs a root login, passwordless sudo or a saved Sudo Password",
          400,
          { code: "sudo" },
        );
      }
      const own = tail
        .split("\n")
        .filter((line) => line.startsWith("SCRIPT_ERR:"))
        .map((line) => line.slice(11))
        .join("\n");
      throw new HostScriptError(
        pickMessage(own || tail || result.stderr) || "The command failed",
        400,
        { output: own || tail },
      );
    }
    return { ok: true, output: tail };
  };

  const readSite = async (
    hostId: number,
    s: HostSettings,
    kind: ServerKind,
    name: string,
  ) => {
    const srv = await server(hostId, s, kind);
    const { stdout } = await remote.read(
      hostId,
      s.sudo,
      readSiteScript(srv, siteCandidates(srv, cleanSiteName(name))),
    );
    const site = parseSiteFile(stdout);
    return { ...site, content: site.text, spec: readSpec(site.text) };
  };

  const renderFor = (srv: ServerInfo, name: string, specInput: unknown) => {
    const spec = cleanSpec(specInput, srv.kind);
    return renderSite(srv, name, spec);
  };

  return {
    status,
    sites: async (hostId, s) => {
      const servers = await installed(hostId, s);
      if (servers.length === 0) return [];
      return parseSites(
        (
          await remote.read(hostId, s.sudo, listScript(servers), {
            timeoutMs: 60_000,
            maxOutputBytes: 8_000_000,
          })
        ).stdout,
      );
    },
    readSite: async (hostId, s, kind, name) => {
      const site = await readSite(hostId, s, kind, name);
      return {
        file: site.file,
        enabled: site.enabled,
        content: site.content,
        spec: site.spec,
      };
    },
    preview: async (hostId, s, kind, name, spec) => {
      const srv = await server(hostId, s, kind);
      return { content: renderFor(srv, cleanSiteName(name), spec).content };
    },
    saveSite: async (hostId, s, body, isNew) => {
      const srv = await server(hostId, s, body.server);
      const name = cleanSiteName(body.name);
      const candidates = siteCandidates(srv, name);
      let content: string;
      let modules: string[] = [];
      let ports: number[] = [];
      if (body.spec !== undefined) {
        const rendered = renderFor(srv, name, body.spec);
        content = rendered.content;
        modules = rendered.modules;
        ports = rendered.ports;
      } else {
        content = dropSpec(cleanContent(body.content));
      }
      return change(
        hostId,
        s,
        saveSiteScript(srv, candidates, content, {
          newFile: isNew
            ? `${srv.siteDir}/${siteFileName(srv, name)}`
            : undefined,
          modules,
          ports,
        }),
      );
    },
    toggleSite: async (hostId, s, kind, name, on) => {
      const srv = await server(hostId, s, kind);
      return change(
        hostId,
        s,
        toggleSiteScript(srv, siteCandidates(srv, cleanSiteName(name)), on),
      );
    },
    deleteSite: async (hostId, s, kind, name) => {
      const srv = await server(hostId, s, kind);
      return change(
        hostId,
        s,
        deleteSiteScript(srv, siteCandidates(srv, cleanSiteName(name))),
      );
    },
    issueCert: async (hostId, s, kind, name, body) => {
      const st = await status(hostId, s);
      const srv = requireInstalled(st.servers, kind);
      if (srv.kind === "caddy") {
        throw new HostScriptError("Caddy gets its certificates on its own");
      }
      if (!st.certbot) throw new HostScriptError("certbot is not installed");
      if (srv.kind === "nginx" ? !st.certbotNginx : !st.certbotApache) {
        throw new HostScriptError(
          `certbot's ${label(srv.kind)} plugin is not installed. Press Install certbot.`,
        );
      }
      const site = await readSite(hostId, s, kind, name);
      const domains = (
        site.spec?.names ?? siteFacts(kind, site.content).names
      ).filter((d) => DOMAIN_RE.test(d));
      if (domains.length === 0) {
        throw new HostScriptError(
          "This site has no domain names a certificate can be issued for",
        );
      }
      const email = cleanEmail(body.email);
      const issued = await change(
        hostId,
        s,
        certbotScript(srv, domains, { email, staging: body.staging === true }),
        300_000,
      );
      if (!site.spec) return issued;
      // A site made in the form turns on HTTPS with the new certificate.
      const live = `/etc/letsencrypt/live/${domains[0]}`;
      const spec: SiteSpec = {
        ...site.spec,
        https: true,
        forceHttps: true,
        certPath: `${live}/fullchain.pem`,
        keyPath: `${live}/privkey.pem`,
      };
      const rendered = renderFor(srv, cleanSiteName(name), spec);
      const saved = await change(
        hostId,
        s,
        saveSiteScript(
          srv,
          siteCandidates(srv, cleanSiteName(name)),
          rendered.content,
          {
            modules: rendered.modules,
            ports: rendered.ports,
          },
        ),
      );
      return { ok: true, output: `${issued.output}\n\n${saved.output}`.trim() };
    },
    files: async (hostId, s, kind) => {
      const srv = await server(hostId, s, kind);
      return parseFiles(
        (await remote.read(hostId, s.sudo, listFilesScript(srv.root))).stdout,
      );
    },
    readFile: async (hostId, s, kind, path) => {
      const srv = await server(hostId, s, kind);
      const file = cleanPathUnder(path, [srv.root], "file");
      return parseFileContent(
        (
          await remote.read(hostId, s.sudo, readFileScript(file, srv.root), {
            maxOutputBytes: 2_000_000,
          })
        ).stdout,
      );
    },
    writeFile: async (hostId, s, kind, path, content, backupId) => {
      const srv = await server(hostId, s, kind);
      const file = cleanPathUnder(path, [srv.root], "file");
      if (backupId !== undefined && backupId !== null && backupId !== "") {
        return change(
          hostId,
          s,
          writeFileScript(srv, file, "", cleanBackupId(backupId)),
        );
      }
      return change(
        hostId,
        s,
        writeFileScript(srv, file, cleanContent(content)),
      );
    },
    test: async (hostId, s, kind) => {
      const srv = await server(hostId, s, kind);
      const { stdout } = await remote.read(hostId, s.sudo, testScript(srv));
      const ok = stdout.includes(`${MARK}OK`);
      const output = stdout
        .split("\n")
        .filter((line) => !line.startsWith(MARK))
        .join("\n")
        .trim();
      return { ok, output };
    },
    act: async (hostId, s, kind, action) => {
      const srv = await server(hostId, s, kind);
      return change(hostId, s, serviceScript(srv, action));
    },
    install: async (hostId, s, kind) => {
      const k = cleanKind(kind);
      const st = await status(hostId, s);
      return change(hostId, s, installServerScript(st.manager, k), 600_000);
    },
    installCertbot: async (hostId, s) => {
      const st = await status(hostId, s);
      const kinds = st.servers
        .filter((srv) => srv.installed && srv.kind !== "caddy")
        .map((srv) => srv.kind);
      return change(
        hostId,
        s,
        installCertbotScript(st.manager, kinds),
        600_000,
      );
    },
    logFiles: async (hostId, s) => {
      const servers = await installed(hostId, s);
      if (servers.length === 0) return [];
      const dirs = [...new Set(servers.map((srv) => srv.logDir))];
      return parseLogFiles(
        (await remote.read(hostId, s.sudo, listLogsScript(dirs))).stdout,
      );
    },
    readLog: async (hostId, s, source, lines) => {
      const count = cleanLines(lines);
      let stdout: string;
      if (source.kind === "journal") {
        const srv = await server(hostId, s, source.server);
        stdout = (
          await remote.read(hostId, s.sudo, journalScript(srv.unit, count), {
            maxOutputBytes: 4_000_000,
          })
        ).stdout;
      } else {
        stdout = (
          await remote.read(hostId, s.sudo, tailScript(source.path, count), {
            maxOutputBytes: 4_000_000,
          })
        ).stdout;
      }
      const all = stdout.replace(/\n$/, "").split("\n");
      const out = all.length === 1 && all[0] === "" ? [] : all;
      return { lines: out, stats: logStats(out) };
    },
  };
}
