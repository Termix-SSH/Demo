export type ManagerKind = "pm2" | "supervisor";

export interface ProcessRow {
  pid: number;
  ppid: number;
  user: string;
  cpu: number;
  mem: number;
  rss: number;
  stat: string;
  nice: number | null;
  threads: number;
  /** Seconds since the process started. */
  age: number;
  command: string;
  args: string;
}

export interface ProcessList {
  processes: ProcessRow[];
  cpus: number;
  load: [number, number, number];
  zombies: number;
}

export interface ProcessDetail {
  pid: number;
  cmdline: string;
  cwd: string;
  exe: string;
  unit: string;
  state: string;
  threads: number;
  rss: number;
  vsize: number;
  envKeys: string[];
  fdCount: number;
  limits: string[];
  ports: string[];
  /** Files the process has open for writing. These can be followed as logs. */
  files: Array<{ fd: number; path: string }>;
}

export interface AppRow {
  manager: ManagerKind;
  /** pm2 id or supervisor name. */
  key: string;
  name: string;
  /** online, stopped, errored, launching ... */
  status: string;
  /** A short state used for colors: up, down, wait. */
  health: "up" | "down" | "wait";
  pid: number | null;
  cpu: number | null;
  mem: number | null;
  restarts: number | null;
  /** Seconds, when known. */
  uptime: number | null;
  detail: string;
}

export interface ManagersView {
  pm2: boolean;
  supervisor: boolean;
  /** Why supervisorctl gave no rows, when it did not. */
  supervisorError?: string;
  apps: AppRow[];
}

export type LogTarget =
  | { kind: "journal"; unit: string }
  | { kind: "journal-pid"; pid: number }
  | { kind: "pm2"; key: string }
  | { kind: "supervisor"; key: string; stream: "stdout" | "stderr" }
  | { kind: "file"; pid: number; fd: number };

export interface LogsView {
  text: string;
  lines: number;
}

export interface StatusView {
  os: string;
  user: string;
  root: boolean;
  psOk: boolean;
  pm2: boolean;
  supervisor: boolean;
  systemd: boolean;
  canEdit: boolean;
  readOnly: boolean;
}

export type WatchKind = "process" | "pm2" | "supervisor";
export type WatchRule = "down" | "restarts" | "cpu" | "mem";

export interface WatchBody {
  kind: WatchKind;
  target: string;
  rule: WatchRule;
  threshold?: number;
  autoRestart?: boolean;
}

export interface WatchView {
  id: number;
  hostId: number;
  kind: WatchKind;
  target: string;
  rule: WatchRule;
  threshold: number;
  autoRestart: boolean;
  /** up, down or empty before the first check. */
  state: string;
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export const SIGNALS = [
  "TERM",
  "KILL",
  "HUP",
  "INT",
  "STOP",
  "CONT",
  "USR1",
  "USR2",
] as const;
export type SignalName = (typeof SIGNALS)[number];

export const APP_ACTIONS = ["start", "stop", "restart", "reload"] as const;
export type AppAction = (typeof APP_ACTIONS)[number];
