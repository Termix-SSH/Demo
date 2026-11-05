import type {
  AppRow,
  ProcessDetail,
  ProcessList,
  ProcessRow,
  StatusView,
} from "../shared/types.js";

/** Splits script output at `@@name` marker lines. */
export function sections(output: string): Record<string, string> {
  const out: Record<string, string> = {};
  let current = "";
  const buffer: string[] = [];
  const flush = () => {
    if (current) out[current] = buffer.join("\n").trim();
    buffer.length = 0;
  };
  for (const line of output.split("\n")) {
    const m = /^@@(\w+)\s*$/.exec(line);
    if (m) {
      flush();
      current = m[1];
    } else if (current) {
      buffer.push(line.replace(/\r$/, ""));
    }
  }
  flush();
  return out;
}

/** Some programs have command lines of many KB, like qemu. */
const ARGS_MAX = 300;

const PS_RE =
  /^(\d+)\s+(\d+)\s+(\S+)\s+([\d.]+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(-?\d+|-)\s+(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/;

export function parseProcessRows(output: string): ProcessRow[] {
  const rows: ProcessRow[] = [];
  for (const raw of output.split("\n")) {
    const m = PS_RE.exec(raw.trim());
    if (!m) continue;
    rows.push({
      pid: Number(m[1]),
      ppid: Number(m[2]),
      user: m[3],
      cpu: Number(m[4]),
      mem: Number(m[5]),
      rss: Number(m[6]),
      stat: m[7],
      nice: m[8] === "-" ? null : Number(m[8]),
      threads: Number(m[9]),
      age: Number(m[10]),
      command: m[11],
      args: (m[12] || m[11]).slice(0, ARGS_MAX),
    });
  }
  return rows;
}

export function parseProcessList(output: string): ProcessList {
  const s = sections(output);
  const load = (s.load ?? "").split(/\s+/).slice(0, 3).map(Number);
  return {
    processes: parseProcessRows(s.ps ?? ""),
    cpus: Math.max(1, Number(s.cpus) || 1),
    load: [load[0] || 0, load[1] || 0, load[2] || 0],
    zombies: Number(s.zombies) || 0,
  };
}

/** The systemd service a cgroup path belongs to, or empty. */
export function unitFromCgroup(text: string): string {
  for (const line of text.split("\n")) {
    const m = /([A-Za-z0-9:_.@\\-]+\.service)(?:\/|$)/.exec(line);
    if (m) return m[1];
  }
  return "";
}

function statusNumber(text: string, key: string): number {
  const m = new RegExp(`^${key}:\\s+(\\d+)`, "m").exec(text);
  return m ? Number(m[1]) : 0;
}

export function parseDetail(pid: number, output: string): ProcessDetail {
  const s = sections(output);
  const status = s.status ?? "";
  const files: ProcessDetail["files"] = [];
  for (const line of (s.files ?? "").split("\n")) {
    const i = line.indexOf("|");
    if (i < 1) continue;
    const fd = Number(line.slice(0, i));
    if (Number.isInteger(fd)) files.push({ fd, path: line.slice(i + 1) });
  }
  return {
    pid,
    cmdline: (s.cmdline ?? "").trim(),
    cwd: s.cwd ?? "",
    exe: s.exe ?? "",
    unit: unitFromCgroup(s.cgroup ?? ""),
    state: /^State:\s+(.*)$/m.exec(status)?.[1]?.trim() ?? "",
    threads: statusNumber(status, "Threads"),
    rss: statusNumber(status, "VmRSS") * 1024,
    vsize: statusNumber(status, "VmSize") * 1024,
    envKeys: (s.env ?? "").split("\n").filter(Boolean),
    fdCount: Number(s.fds) || 0,
    limits: (s.limits ?? "").split("\n").filter(Boolean),
    ports: (s.ports ?? "").split("\n").filter(Boolean),
    files,
  };
}

export function parseStatus(
  output: string,
  canEdit: boolean,
  readOnly: boolean,
) {
  const kv: Record<string, string> = {};
  for (const line of output.split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) kv[line.slice(0, i)] = line.slice(i + 1).trim();
  }
  const view: StatusView = {
    os: kv.os ?? "",
    user: kv.user ?? "",
    root: kv.root === "1",
    psOk: kv.ps === "1",
    pm2: kv.pm2 === "1",
    supervisor: kv.supervisor === "1",
    systemd: kv.systemd === "1",
    canEdit,
    readOnly,
  };
  return view;
}

const PM2_UP = new Set(["online"]);
const PM2_WAIT = new Set(["launching", "waiting restart", "stopping"]);

/** pm2 prints notices before the JSON, so the array is found by its line. */
export function parsePm2(text: string): AppRow[] {
  if (!text || text.includes("@@none")) return [];
  const found = /(^|\n)\[\s*[\]{]/.exec(text);
  if (!found) return [];
  const start = found.index;
  let list: unknown;
  try {
    list = JSON.parse(text.slice(start).trim());
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  const now = Date.now();
  return list.map((item): AppRow => {
    const app = item as {
      name?: string;
      pm_id?: number;
      pid?: number;
      monit?: { memory?: number; cpu?: number };
      pm2_env?: {
        status?: string;
        restart_time?: number;
        pm_uptime?: number;
        exec_mode?: string;
        pm_exec_path?: string;
      };
    };
    const status = app.pm2_env?.status ?? "unknown";
    const up = PM2_UP.has(status);
    return {
      manager: "pm2",
      key: String(app.pm_id ?? ""),
      name: app.name ?? String(app.pm_id ?? ""),
      status,
      health: up ? "up" : PM2_WAIT.has(status) ? "wait" : "down",
      pid: app.pid ? app.pid : null,
      cpu: app.monit?.cpu ?? null,
      mem: app.monit?.memory ?? null,
      restarts: app.pm2_env?.restart_time ?? null,
      uptime:
        up && app.pm2_env?.pm_uptime
          ? Math.max(0, Math.floor((now - app.pm2_env.pm_uptime) / 1000))
          : null,
      detail: app.pm2_env?.pm_exec_path ?? "",
    };
  });
}

const SUP_RE =
  /^(\S+)\s+(RUNNING|STOPPED|STARTING|BACKOFF|STOPPING|EXITED|FATAL|UNKNOWN)\b\s*(.*)$/;

function supervisorUptime(text: string): number | null {
  const m = /uptime (?:(\d+) days?, )?(\d+):(\d+):(\d+)/.exec(text);
  if (!m) return null;
  return (
    Number(m[1] ?? 0) * 86400 +
    Number(m[2]) * 3600 +
    Number(m[3]) * 60 +
    Number(m[4])
  );
}

export function parseSupervisor(text: string): AppRow[] {
  if (!text || text.includes("@@none")) return [];
  const rows: AppRow[] = [];
  for (const raw of text.split("\n")) {
    const m = SUP_RE.exec(raw.trim());
    if (!m) continue;
    const status = m[2];
    const rest = m[3] ?? "";
    rows.push({
      manager: "supervisor",
      key: m[1],
      name: m[1],
      status: status.toLowerCase(),
      health:
        status === "RUNNING"
          ? "up"
          : status === "STARTING" ||
              status === "BACKOFF" ||
              status === "STOPPING"
            ? "wait"
            : "down",
      pid: Number(/pid (\d+)/.exec(rest)?.[1]) || null,
      cpu: null,
      mem: null,
      restarts: null,
      uptime: supervisorUptime(rest),
      detail: rest,
    });
  }
  return rows;
}

/** True when supervisorctl could not reach supervisord. */
export function supervisorBroken(text: string): string {
  const line = text
    .split("\n")
    .find((l) => /refused connection|no such file|permission|error:/i.test(l));
  return line?.trim() ?? "";
}
