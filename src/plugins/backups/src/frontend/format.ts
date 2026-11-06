import type { JobView, RunStatus } from "../shared/types";
import type { ListRowTone, StatusTone } from "@termix-ssh/plugin-sdk/ui";

type T = (key: string, options?: Record<string, unknown>) => string;

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) {
    return "";
  }
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return "";
  }
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = s % 60;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${rest}s`;
  return `${rest}s`;
}

/** Like "5 minutes ago" or "in 2 hours". */
export function formatWhen(iso: string | null | undefined, t: T): string {
  if (!iso) return "";
  const time = Date.parse(iso);
  if (!Number.isFinite(time)) return "";
  const diff = Math.round((time - Date.now()) / 1000);
  const abs = Math.abs(diff);
  const pick = (count: number, unit: string) =>
    diff < 0
      ? t(`time.ago.${unit}`, { count })
      : t(`time.in.${unit}`, { count });
  if (abs < 60) return diff < 0 ? t("time.justNow") : t("time.soon");
  if (abs < 3600) return pick(Math.round(abs / 60), "minutes");
  if (abs < 86_400) return pick(Math.round(abs / 3600), "hours");
  return pick(Math.round(abs / 86_400), "days");
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "";
}

export function statusLabel(status: RunStatus | null, t: T): string {
  return status ? t(`status.${status}`) : t("status.never");
}

export function statusToneOf(status: RunStatus | null): StatusTone {
  switch (status) {
    case "success":
      return "ok";
    case "warning":
      return "warn";
    case "failed":
      return "bad";
    case "running":
      return "info";
    default:
      return "idle";
  }
}

export function rowToneOf(status: RunStatus | null): ListRowTone {
  switch (status) {
    case "success":
      return "success";
    case "warning":
      return "warning";
    case "failed":
      return "destructive";
    case "running":
      return "brand";
    default:
      return "muted";
  }
}

/** The job's state, counting a run in progress. */
export function jobStatus(job: JobView): RunStatus | null {
  return job.runningRunId ? "running" : job.lastStatus;
}

const PRESET_DAILY = /^(\d{1,2}) (\d{1,2}) \* \* \*$/;
const PRESET_WEEKLY = /^(\d{1,2}) (\d{1,2}) \* \* (\d)$/;

export type SchedulePreset = "manual" | "daily" | "weekly" | "custom";

export function presetOf(cron: string): SchedulePreset {
  if (!cron) return "manual";
  if (PRESET_DAILY.test(cron)) return "daily";
  if (PRESET_WEEKLY.test(cron)) return "weekly";
  return "custom";
}

/** Hour, minute and weekday read from a daily or weekly cron. */
export function partsOf(cron: string): {
  hour: number;
  minute: number;
  weekday: number;
} {
  const weekly = PRESET_WEEKLY.exec(cron);
  if (weekly) {
    return {
      minute: Number(weekly[1]),
      hour: Number(weekly[2]),
      weekday: Number(weekly[3]),
    };
  }
  const daily = PRESET_DAILY.exec(cron);
  if (daily) {
    return { minute: Number(daily[1]), hour: Number(daily[2]), weekday: 0 };
  }
  return { minute: 0, hour: 2, weekday: 0 };
}

export function scheduleLabel(job: JobView, t: T): string {
  if (!job.cron) return t("schedule.manualOnly");
  const preset = presetOf(job.cron);
  const parts = partsOf(job.cron);
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
  if (preset === "daily") return t("schedule.dailyAt", { time });
  if (preset === "weekly") {
    return t("schedule.weeklyAt", {
      day: t(`schedule.days.${parts.weekday}`),
      time,
    });
  }
  return job.cron;
}
