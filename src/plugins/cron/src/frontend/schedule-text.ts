import { describeSchedule, nextRuns } from "../shared/schedule";

type T = (key: string, options?: Record<string, unknown>) => string;

/** A schedule in plain words. */
export function scheduleText(t: T, schedule: string): string {
  const { key, values = {} } = describeSchedule(schedule);
  if (key === "weeklyAt") {
    return t("schedule.weeklyAt", {
      ...values,
      day: t(`days.${values.day}`),
    });
  }
  return t(`schedule.${key}`, values);
}

/** The host's wall clock time of a run, like "Mon 03:00" or "Jan 5 03:00". */
export function formatRun(
  date: Date,
  offsetMinutes: number,
  language: string,
): string {
  const wall = new Date(date.getTime() + offsetMinutes * 60_000);
  return new Intl.DateTimeFormat(language || undefined, {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(wall);
}

/** The next run as text, or empty for @reboot and bad schedules. */
export function nextRunText(
  schedule: string,
  offsetMinutes: number,
  language: string,
  now = new Date(),
): string {
  const [next] = nextRuns(schedule, now, 1, offsetMinutes);
  return next ? formatRun(next, offsetMinutes, language) : "";
}
