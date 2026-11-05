import {
  HostScriptError,
  parseKeys,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  CronStatus,
  CrontabView,
  JobBody,
  LogsView,
  RunResult,
  SystemFile,
  SystemView,
} from "../shared/types.js";
import {
  addJob,
  checkSystemFile,
  cleanJob,
  deleteJob,
  getJob,
  parseJobs,
  parseSystemJobs,
  setJobEnabled,
  splitPercent,
  updateJob,
} from "./crontab.js";
import type { HostSettings } from "./host-settings.js";
import type { Remote } from "./remote.js";
import {
  MARK,
  STATUS_SCRIPT,
  SYSTEM_SCRIPT,
  deleteSystemFileScript,
  logsScript,
  readCrontabScript,
  runNowScript,
  writeCrontabScript,
  writeSystemFileScript,
} from "./scripts.js";

const OUTPUT_LIMIT = 8000;

/** "+0130" as minutes. */
export function parseOffset(value: string): number {
  const match = value.match(/^([+-])(\d{2})(\d{2})$/);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

export function parseStatus(
  stdout: string,
): Omit<CronStatus, "canEdit" | "readOnly"> {
  const keys = parseKeys(stdout);
  const users = new Set<string>();
  for (const line of stdout.split("\n")) {
    if (line.startsWith("tab=") && line.length > 4)
      users.add(line.slice(4).trim());
  }
  return {
    os: keys.os ?? "",
    user: keys.user ?? "",
    root: keys.root === "1",
    installed: keys.installed === "1",
    running: keys.running === "1",
    timezone: keys.timezone || "UTC",
    offsetMinutes: parseOffset(keys.offset ?? ""),
    users: [...users].sort(),
  };
}

export function parseSystem(stdout: string): SystemView {
  const files: SystemFile[] = [];
  const scripts: SystemView["scripts"] = {
    hourly: [],
    daily: [],
    weekly: [],
    monthly: [],
  };
  let timers: number | null = null;
  let current: { path: string; lines: string[] } | null = null;
  const flush = () => {
    if (!current) return;
    const text = current.lines.join("\n").replace(/\n+$/, "") + "\n";
    const name = current.path.startsWith("/etc/cron.d/")
      ? current.path.slice("/etc/cron.d/".length)
      : "";
    files.push({
      path: current.path,
      name,
      editable: /^[A-Za-z0-9_-]{1,64}$/.test(name),
      text,
      jobs: parseSystemJobs(text),
    });
    current = null;
  };
  for (const line of stdout.split("\n")) {
    if (line.startsWith(`${MARK}FILE `)) {
      flush();
      current = { path: line.slice(MARK.length + 5), lines: [] };
    } else if (line.startsWith(`${MARK}SCRIPT `)) {
      flush();
      const [period, ...name] = line.slice(MARK.length + 7).split(" ");
      if (period in scripts) {
        scripts[period as keyof typeof scripts].push(name.join(" "));
      }
    } else if (line.startsWith(`${MARK}TIMERS `)) {
      flush();
      timers = Number(line.slice(MARK.length + 7)) || 0;
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();
  return { files, scripts, timers };
}

export function parseRun(stdout: string): RunResult {
  const lines = stdout.split("\n");
  let code: number | null = null;
  const kept: string[] = [];
  for (const line of lines) {
    if (line.startsWith(`${MARK}EXIT `))
      code = Number(line.slice(MARK.length + 5));
    else kept.push(line);
  }
  const output = kept.join("\n").trim();
  return {
    output: output.length > OUTPUT_LIMIT ? output.slice(-OUTPUT_LIMIT) : output,
    code,
  };
}

export function parseLogs(stdout: string): LogsView {
  const lines = stdout.split("\n");
  let source = "none";
  if (lines[0]?.startsWith(`${MARK}SOURCE `)) {
    source = lines.shift()!.slice(MARK.length + 7);
  }
  return { text: lines.join("\n").trim(), source };
}

export interface CronService {
  status: (
    hostId: number,
    s: HostSettings,
  ) => Promise<Omit<CronStatus, "canEdit" | "readOnly">>;
  crontab: (
    hostId: number,
    s: HostSettings,
    user: string,
  ) => Promise<CrontabView>;
  saveRaw: (
    hostId: number,
    s: HostSettings,
    user: string,
    text: string,
  ) => Promise<CrontabView>;
  add: (
    hostId: number,
    s: HostSettings,
    user: string,
    body: JobBody,
  ) => Promise<CrontabView>;
  update: (
    hostId: number,
    s: HostSettings,
    user: string,
    id: string,
    body: JobBody,
  ) => Promise<CrontabView>;
  setEnabled: (
    hostId: number,
    s: HostSettings,
    user: string,
    id: string,
    on: boolean,
  ) => Promise<CrontabView>;
  remove: (
    hostId: number,
    s: HostSettings,
    user: string,
    id: string,
  ) => Promise<CrontabView>;
  runNow: (
    hostId: number,
    s: HostSettings,
    user: string,
    id: string,
  ) => Promise<RunResult>;
  system: (hostId: number, s: HostSettings) => Promise<SystemView>;
  saveSystemFile: (
    hostId: number,
    s: HostSettings,
    name: string,
    text: string,
  ) => Promise<void>;
  deleteSystemFile: (
    hostId: number,
    s: HostSettings,
    name: string,
  ) => Promise<void>;
  logs: (hostId: number, s: HostSettings, lines: number) => Promise<LogsView>;
}

export function createService(remote: Remote): CronService {
  // Another user's crontab needs root; the login user's own does not.
  const exec = (
    hostId: number,
    s: HostSettings,
    user: string,
    script: string,
    timeoutMs = 30_000,
  ) =>
    user
      ? remote.root(hostId, s.sudo, script, { timeoutMs })
      : remote.plain(hostId, script, { timeoutMs });

  const crontab = async (hostId: number, s: HostSettings, user: string) => {
    const { stdout } = await exec(hostId, s, user, readCrontabScript(user));
    return { user, jobs: parseJobs(stdout), raw: stdout };
  };

  const save = async (
    hostId: number,
    s: HostSettings,
    user: string,
    text: string,
  ) => {
    if (text.length > 256_000)
      throw new HostScriptError("The crontab is too big");
    await exec(hostId, s, user, writeCrontabScript(user, text));
    return crontab(hostId, s, user);
  };

  const change = async (
    hostId: number,
    s: HostSettings,
    user: string,
    edit: (text: string) => string,
  ) => {
    const current = await crontab(hostId, s, user);
    return save(hostId, s, user, edit(current.raw));
  };

  return {
    status: async (hostId, s) =>
      parseStatus((await remote.read(hostId, s.sudo, STATUS_SCRIPT)).stdout),
    crontab,
    saveRaw: save,
    add: (hostId, s, user, body) => {
      const job = cleanJob(body);
      return change(hostId, s, user, (text) => addJob(text, job));
    },
    update: (hostId, s, user, id, body) => {
      const job = cleanJob(body);
      return change(hostId, s, user, (text) => updateJob(text, id, job));
    },
    setEnabled: (hostId, s, user, id, on) =>
      change(hostId, s, user, (text) => setJobEnabled(text, id, on)),
    remove: (hostId, s, user, id) =>
      change(hostId, s, user, (text) => deleteJob(text, id)),
    runNow: async (hostId, s, user, id) => {
      const current = await crontab(hostId, s, user);
      const job = getJob(current.raw, id);
      const { run, input } = splitPercent(job.command);
      const { stdout } = await exec(
        hostId,
        s,
        user,
        runNowScript(user, run, input),
        150_000,
      );
      return parseRun(stdout);
    },
    system: async (hostId, s) =>
      parseSystem(
        (
          await remote.read(hostId, s.sudo, SYSTEM_SCRIPT, {
            maxOutputBytes: 1_000_000,
          })
        ).stdout,
      ),
    saveSystemFile: async (hostId, s, name, text) => {
      const body = text.replace(/\r\n/g, "\n").replace(/\n*$/, "\n");
      if (body.length > 128_000)
        throw new HostScriptError("The file is too big");
      checkSystemFile(body);
      await remote.root(hostId, s.sudo, writeSystemFileScript(name, body));
    },
    deleteSystemFile: async (hostId, s, name) => {
      await remote.root(hostId, s.sudo, deleteSystemFileScript(name));
    },
    logs: async (hostId, s, lines) =>
      parseLogs((await remote.read(hostId, s.sudo, logsScript(lines))).stdout),
  };
}
