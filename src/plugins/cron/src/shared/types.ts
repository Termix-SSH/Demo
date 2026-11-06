export interface CronStatus {
  os: string;
  /** The user Termix logs in as. */
  user: string;
  root: boolean;
  installed: boolean;
  running: boolean;
  /** Host time zone name and its UTC offset in minutes. */
  timezone: string;
  offsetMinutes: number;
  /** Users whose crontab can be picked (needs root). */
  users: string[];
  canEdit: boolean;
  readOnly: boolean;
}

export interface CronJob {
  /** Stable while the line is unchanged. */
  id: string;
  enabled: boolean;
  schedule: string;
  command: string;
  label: string;
}

export interface CrontabView {
  /** Empty for the login user's own crontab. */
  user: string;
  jobs: CronJob[];
  raw: string;
}

export interface JobBody {
  user?: string;
  schedule: string;
  command: string;
  label?: string;
  enabled?: boolean;
}

export interface RunResult {
  output: string;
  code: number | null;
}

export interface SystemJob {
  enabled: boolean;
  schedule: string;
  user: string;
  command: string;
}

export interface SystemFile {
  path: string;
  /** File name in /etc/cron.d, empty for /etc/crontab. */
  name: string;
  editable: boolean;
  text: string;
  jobs: SystemJob[];
}

export interface SystemView {
  files: SystemFile[];
  scripts: Record<"hourly" | "daily" | "weekly" | "monthly", string[]>;
  /** Number of systemd timers, or null without systemd. */
  timers: number | null;
}

export interface LogsView {
  text: string;
  source: string;
}

/** One host in the Cron dashboard card. */
export interface CronHostSummary {
  hostId: number;
  checkedAt: string;
  installed: boolean;
  running: boolean;
  jobs: number;
  disabled: number;
  error?: string;
}
