import type { MaintenanceInput } from "../shared/types.js";

export interface MaintenanceWindow extends MaintenanceInput {
  id: number;
  userId: string;
  monitorKeys: string[];
}

interface LocalTime {
  day: number;
  minute: number;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WEEK_MINUTES = 7 * 1440;

export function localTime(at: number, timezone: string | undefined): LocalTime {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(at));
  } catch {
    return localTime(at, "UTC");
  }
  const read = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    day: DAY_NAMES.indexOf(read("weekday")),
    minute: Number(read("hour")) * 60 + Number(read("minute")),
  };
}

/** Whether a window covers this moment. */
export function windowActive(window: MaintenanceWindow, at: number): boolean {
  if (window.enabled === false) return false;
  if (window.kind === "once") {
    return (window.startsAt ?? 0) <= at && at < (window.endsAt ?? 0);
  }
  const days = window.days ?? [];
  const start = window.startMinute ?? 0;
  const length = window.durationMinutes ?? 0;
  const now = localTime(at, window.timezone);
  const current = now.day * 1440 + now.minute;
  return days.some((day) => {
    const begin = day * 1440 + start;
    // A window can run past midnight, or past Saturday into Sunday.
    const passed = (current - begin + WEEK_MINUTES) % WEEK_MINUTES;
    return passed < length;
  });
}

export interface MaintenanceSubject {
  key: string;
  userId: string;
  tags: string[];
}

export function windowCovers(
  window: MaintenanceWindow,
  monitor: MaintenanceSubject,
): boolean {
  if (window.scope === "monitors") {
    return window.monitorKeys.includes(monitor.key);
  }
  if (window.userId !== monitor.userId) return false;
  if (window.scope === "tag") return monitor.tags.includes(window.tag ?? "");
  return true;
}

export function inMaintenance(
  windows: MaintenanceWindow[],
  monitor: MaintenanceSubject,
  at: number,
): boolean {
  return windows.some(
    (window) => windowActive(window, at) && windowCovers(window, monitor),
  );
}

export function maintenanceProblem(input: MaintenanceInput): string {
  if (!input.name?.trim()) return "A name is required";
  if (input.kind === "once") {
    if (!input.startsAt || !input.endsAt || input.endsAt <= input.startsAt) {
      return "The end must be after the start";
    }
    return "";
  }
  if (input.kind !== "weekly") return "Pick one time or weekly";
  if (!input.days?.length) return "Pick at least one day";
  if (!input.durationMinutes || input.durationMinutes < 1) {
    return "A length is required";
  }
  return "";
}
