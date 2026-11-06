import { randomBytes } from "node:crypto";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  HostScriptError,
  parseKeys,
  shellQuote as q,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  AnsibleStatus,
  FactsHost,
  FilesView,
  RunBody,
  RunDetail,
  RunMeta,
  RunSummary,
  Target,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import { buildInventory, type InventoryHost } from "./inventory.js";
import {
  parseFacts,
  parseFiles,
  parseRawRuns,
  parseRecap,
  summarize,
} from "./parse.js";
import type { Remote } from "./remote.js";
import {
  PLAYBOOK_RE,
  RUN_ID_RE,
  cancelScript,
  cleanRelPath,
  deleteFileScript,
  filesScript,
  launchScript,
  listRunsScript,
  readFileScript,
  removeRunScript,
  runDetailScript,
  statusScript,
  writeFileScript,
} from "./scripts.js";

const LOG_TAIL = 200_000;
const FACTS_LOG = 3_000_000;
const PATTERN_RE = /^[A-Za-z0-9_.:,!&*[\]-]+$/;
const TAGS_RE = /^[A-Za-z0-9_.,-]+$/;
const MODULE_RE = /^[A-Za-z0-9_.]+$/;
const VAR_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

const FACT_FILTER = [
  "ansible_hostname",
  "ansible_fqdn",
  "ansible_distribution",
  "ansible_distribution_version",
  "ansible_os_family",
  "ansible_kernel",
  "ansible_architecture",
  "ansible_memtotal_mb",
  "ansible_swaptotal_mb",
  "ansible_processor_vcpus",
  "ansible_processor",
  "ansible_default_ipv4",
  "ansible_all_ipv4_addresses",
  "ansible_uptime_seconds",
  "ansible_virtualization_type",
  "ansible_virtualization_role",
  "ansible_python_version",
  "ansible_mounts",
].join(",");

export interface Service {
  status: (hostId: number, s: HostSettings) => Promise<AnsibleStatus>;
  files: (hostId: number, s: HostSettings) => Promise<FilesView>;
  readFile: (hostId: number, s: HostSettings, path: string) => Promise<string>;
  writeFile: (
    hostId: number,
    s: HostSettings,
    path: string,
    text: string,
  ) => Promise<void>;
  deleteFile: (hostId: number, s: HostSettings, path: string) => Promise<void>;
  targets: () => Promise<Target[]>;
  start: (
    hostId: number,
    s: HostSettings,
    body: RunBody,
  ) => Promise<RunSummary>;
  runs: (hostId: number) => Promise<RunSummary[]>;
  run: (hostId: number, id: string) => Promise<RunDetail>;
  facts: (hostId: number, id: string) => Promise<FactsHost[]>;
  cancel: (hostId: number, id: string) => Promise<void>;
  remove: (hostId: number, id: string) => Promise<void>;
}

function runId(value: string): string {
  if (!RUN_ID_RE.test(value))
    throw new HostScriptError("The run id is not valid");
  return value;
}

function word(value: unknown, re: RegExp, label: string, max = 200): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "";
  if (text.length > max || text.startsWith("-") || !re.test(text)) {
    throw new HostScriptError(`The ${label} is not valid`);
  }
  return text;
}

function typed(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^-?\d{1,15}$/.test(value)) return Number(value);
  return value;
}

/** key=value lines to the JSON Ansible reads with -e @file. */
export function parseExtraVars(text: string): Record<string, unknown> {
  const vars: Record<string, unknown> = {};
  for (const line of text.split("\n")) {
    const row = line.trim();
    if (!row || row.startsWith("#")) continue;
    const eq = row.indexOf("=");
    const key = eq > 0 ? row.slice(0, eq).trim() : "";
    if (!VAR_KEY_RE.test(key)) {
      throw new HostScriptError(`"${row.slice(0, 40)}" is not key=value`);
    }
    vars[key] = typed(row.slice(eq + 1).trim());
  }
  return vars;
}

interface Token {
  display: string;
  shell: string;
}

const tok = (value: string): Token => ({
  display: value,
  // Plain flags stay unquoted so the run script reads naturally.
  shell: /^--?[A-Za-z][A-Za-z-]*$/.test(value) ? value : q(value),
});

export function createService(ctx: PluginContext, remote: Remote): Service {
  const actor = () => String(ctx.currentActor() ?? "");

  async function targetHosts(
    controlId: number,
    ids: number[],
  ): Promise<InventoryHost[]> {
    const out: InventoryHost[] = [];
    for (const id of [...new Set(ids)].slice(0, 200)) {
      if (!Number.isInteger(id) || id < 1) {
        throw new HostScriptError("A host id is not valid");
      }
      // Running a playbook is root on the target, so edit access is needed.
      if (!(await ctx.hosts.checkAccess(id, "edit")).hasAccess) {
        throw new HostScriptError(`You need edit access to host ${id}`, 403);
      }
      const [summary, host] = await Promise.all([
        ctx.hosts.get(id),
        ctx.ssh.resolveHost(id),
      ]);
      if (!summary || !host) {
        throw new HostScriptError(`Host ${id} was not found`, 404);
      }
      const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);
      out.push({
        id,
        name: summary.name || summary.ip,
        ip: host.ip,
        port: host.port || 22,
        username: host.username,
        folder: summary.folder ?? "",
        tags: (summary.tags ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        password: str(host.password),
        key: str(host.key),
        keyPassword: str(host.keyPassword),
        sudoPassword: str(host.sudoPassword),
        local: id === controlId,
      });
    }
    return out;
  }

  async function listRuns(hostId: number): Promise<RunSummary[]> {
    const { stdout } = await remote.run(hostId, listRunsScript());
    const now = Date.now() / 1000;
    return parseRawRuns(stdout)
      .map((raw) => summarize(raw, now))
      .filter((run): run is RunSummary => run !== null)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  return {
    status: async (hostId, s) => {
      const out = parseKeys(
        (await remote.run(hostId, statusScript(s.projectDir))).stdout,
      );
      return {
        installed: out.installed === "1",
        version: out.version ?? "",
        user: out.user ?? "",
        projectDir: out.dir ?? s.projectDir,
        projectExists: out.project === "1",
        sshpass: out.sshpass === "1",
        canEdit: false,
        readOnly: s.readOnly,
      };
    },

    files: async (hostId, s) => ({
      files: parseFiles(
        (await remote.run(hostId, filesScript(s.projectDir))).stdout,
      ),
    }),

    readFile: async (hostId, s, path) => {
      const rel = cleanRelPath(path);
      if (!rel) throw new HostScriptError("The file name is not valid");
      return (await remote.run(hostId, readFileScript(s.projectDir, rel)))
        .stdout;
    },

    writeFile: async (hostId, s, path, text) => {
      const rel = cleanRelPath(path);
      if (!rel) throw new HostScriptError("The file name is not valid");
      if (text.length > 512_000) {
        throw new HostScriptError("That file is too large to save here");
      }
      await remote.run(
        hostId,
        writeFileScript(
          s.projectDir,
          rel,
          text,
          PLAYBOOK_RE.test(rel) && /^[\s-]*hosts:/m.test(text),
        ),
        { timeoutMs: 60_000 },
      );
    },

    deleteFile: async (hostId, s, path) => {
      const rel = cleanRelPath(path);
      if (!rel) throw new HostScriptError("The file name is not valid");
      await remote.run(hostId, deleteFileScript(s.projectDir, rel));
    },

    targets: async () => {
      const hosts = await ctx.hosts.list();
      const out: Target[] = [];
      for (const h of hosts) {
        if (!(await ctx.hosts.checkAccess(h.id, "edit")).hasAccess) continue;
        out.push({
          id: h.id,
          name: h.name || h.ip,
          address: h.ip,
          folder: h.folder ?? "",
          tags: (h.tags ?? "")
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });
      }
      return out.sort((a, b) => a.name.localeCompare(b.name));
    },

    start: async (hostId, s, body) => {
      const kind = body.kind;
      if (kind !== "playbook" && kind !== "adhoc" && kind !== "facts") {
        throw new HostScriptError("The run type is not valid");
      }
      const hostIds = Array.isArray(body.hostIds)
        ? body.hostIds.map(Number)
        : [];
      const hosts = hostIds.length ? await targetHosts(hostId, hostIds) : [];
      const inv = buildInventory(hosts);
      if (inv.skipped.length) {
        const names = inv.skipped
          .map((x) => hosts.find((h) => h.id === x.id)?.name)
          .join(", ");
        throw new HostScriptError(
          `These hosts use a key with a passphrase, which Ansible cannot take here: ${names}`,
        );
      }

      const limit = word(body.limit, PATTERN_RE, "limit");
      const tags = word(body.tags, TAGS_RE, "tags");
      const skipTags = word(body.skipTags, TAGS_RE, "skip tags");
      const vars = parseExtraVars(
        typeof body.extraVars === "string" ? body.extraVars : "",
      );
      const verbosity = Math.max(0, Math.min(4, Number(body.verbosity) || 0));

      const parts: Token[] = [];
      let title = "";
      let command: "ansible-playbook" | "ansible" = "ansible-playbook";
      const check = kind === "playbook" ? body.check === true : false;

      if (hostIds.length) {
        parts.push(tok("-i"), {
          display: "<termix hosts>",
          shell: '"$D/secret/inventory.json"',
        });
      } else {
        const file = body.inventory ? cleanRelPath(body.inventory, false) : "";
        if (body.inventory && !file) {
          throw new HostScriptError("The inventory path is not valid");
        }
        if (file) parts.push(tok("-i"), tok(file));
      }
      if (s.vaultPasswordFile) {
        parts.push(tok("--vault-password-file"), {
          display: s.vaultPasswordFile,
          shell: '"$VAULT_FILE"',
        });
      }
      if (body.become) parts.push(tok("-b"));
      if (verbosity) parts.push(tok(`-${"v".repeat(verbosity)}`));
      if (Object.keys(vars).length) {
        parts.push(tok("-e"), {
          display: "@extra-vars",
          shell: '@"$D/secret/vars.json"',
        });
      }

      if (kind === "playbook") {
        const playbook = cleanRelPath(body.playbook);
        if (!playbook || !PLAYBOOK_RE.test(playbook)) {
          throw new HostScriptError("Pick a playbook to run");
        }
        title = playbook;
        if (limit) parts.push(tok("-l"), tok(limit));
        if (tags) parts.push(tok("-t"), tok(tags));
        if (skipTags) parts.push(tok("--skip-tags"), tok(skipTags));
        if (check) parts.push(tok("-C"));
        if (body.diff) parts.push(tok("-D"));
        parts.push(tok(playbook));
      } else {
        command = "ansible";
        const pattern = word(body.pattern, PATTERN_RE, "pattern") || "all";
        const module =
          kind === "facts"
            ? "setup"
            : word(body.module, MODULE_RE, "module") || "ping";
        const args =
          kind === "facts"
            ? `gather_subset=hardware,network,virtual filter=${FACT_FILTER}`
            : typeof body.args === "string"
              ? body.args.slice(0, 2000)
              : "";
        title = kind === "facts" ? `facts ${pattern}` : `${module} ${pattern}`;
        parts.unshift(tok(pattern));
        parts.push(tok("-m"), tok(module));
        if (args) parts.push(tok("-a"), tok(args));
      }

      const now = Date.now();
      const uid = `${now}-${randomBytes(3).toString("hex")}`;
      const meta: RunMeta = {
        id: uid,
        kind,
        title,
        command: `${command} ${parts.map((p) => p.display).join(" ")}`.slice(
          0,
          600,
        ),
        startedAt: now,
        startedBy: actor(),
        check,
        hosts: Object.values(inv.aliases),
      };

      await remote.run(
        hostId,
        launchScript({
          uid,
          dir: s.projectDir,
          command,
          args: parts.map((p) => p.shell).join(" "),
          meta: JSON.stringify(meta),
          inventory: inv.json,
          vars: JSON.stringify(vars),
          keys: inv.keys,
          looseHostKeys: hostIds.length > 0,
          vaultFile: s.vaultPasswordFile,
        }),
        { timeoutMs: 60_000 },
      );
      return { ...meta, state: "running", exitCode: null, endedAt: null };
    },

    runs: listRuns,

    run: async (hostId, id) => {
      const uid = runId(id);
      const { stdout } = await remote.run(
        hostId,
        runDetailScript(uid, LOG_TAIL),
      );
      if (stdout.startsWith("@@missing")) {
        throw new HostScriptError("That run was not found", 404);
      }
      const raw = parseRawRuns(stdout)[0];
      const summary = raw ? summarize(raw, Date.now() / 1000) : null;
      if (!raw || !summary) {
        throw new HostScriptError("That run was not found", 404);
      }
      return {
        ...summary,
        log: raw.log,
        truncated: raw.size > LOG_TAIL,
        recap: parseRecap(raw.log),
      };
    },

    facts: async (hostId, id) => {
      const uid = runId(id);
      const { stdout } = await remote.run(
        hostId,
        runDetailScript(uid, FACTS_LOG),
      );
      const raw = parseRawRuns(stdout)[0];
      if (!raw) throw new HostScriptError("That run was not found", 404);
      return parseFacts(raw.log);
    },

    cancel: async (hostId, id) => {
      await remote.run(hostId, cancelScript(runId(id)));
    },

    remove: async (hostId, id) => {
      await remote.run(hostId, removeRunScript(runId(id)));
    },
  };
}
