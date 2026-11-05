/**
 * Cron schedule parsing, next run times and a short summary. Shared by the
 * backend (checks before a save) and the frontend (the form preview).
 */

const MACROS: Record<string, string | null> = {
  "@reboot": null,
  "@yearly": "0 0 1 1 *",
  "@annually": "0 0 1 1 *",
  "@monthly": "0 0 1 * *",
  "@weekly": "0 0 * * 0",
  "@daily": "0 0 * * *",
  "@midnight": "0 0 * * *",
  "@hourly": "0 * * * *",
};

const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export interface ParsedSchedule {
  reboot: boolean;
  minutes: Set<number>;
  hours: Set<number>;
  days: Set<number>;
  months: Set<number>;
  weekdays: Set<number>;
  dayAny: boolean;
  weekAny: boolean;
}

function parseValue(
  text: string,
  min: number,
  names?: string[],
): number | null {
  if (/^\d+$/.test(text)) return Number(text);
  if (names) {
    const index = names.indexOf(text.toLowerCase());
    if (index >= 0) return index + min;
  }
  return null;
}

/** One field as the set of values it matches, or null when it is not valid. */
export function parseField(
  text: string,
  min: number,
  max: number,
  names?: string[],
): Set<number> | null {
  const out = new Set<number>();
  if (!text) return null;
  for (const part of text.split(",")) {
    const match = part.match(/^([^/]+)(?:\/(\d+))?$/);
    if (!match) return null;
    const step = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isInteger(step) || step < 1) return null;
    let from: number;
    let to: number;
    if (match[1] === "*") {
      from = min;
      to = max;
    } else {
      const range = match[1].split("-");
      if (range.length > 2) return null;
      const a = parseValue(range[0], min, names);
      const b = range.length === 2 ? parseValue(range[1], min, names) : a;
      if (a === null || b === null) return null;
      from = a;
      // "5/10" means from 5 to the end, stepping by 10.
      to = range.length === 1 && match[2] !== undefined ? max : b;
    }
    if (from < min || to > max || from > to) return null;
    for (let value = from; value <= to; value += step) out.add(value);
  }
  return out;
}

/** The parsed schedule, or null when it is not a valid cron schedule. */
export function parseSchedule(expr: string): ParsedSchedule | null {
  const text = expr.trim().replace(/\s+/g, " ");
  if (text.startsWith("@")) {
    const macro = text.toLowerCase();
    if (!(macro in MACROS)) return null;
    const expanded = MACROS[macro];
    if (expanded === null) {
      return {
        reboot: true,
        minutes: new Set(),
        hours: new Set(),
        days: new Set(),
        months: new Set(),
        weekdays: new Set(),
        dayAny: true,
        weekAny: true,
      };
    }
    return parseSchedule(expanded);
  }
  const fields = text.split(" ");
  if (fields.length !== 5) return null;
  const minutes = parseField(fields[0], 0, 59);
  const hours = parseField(fields[1], 0, 23);
  const days = parseField(fields[2], 1, 31);
  const months = parseField(fields[3], 1, 12, MONTHS);
  // Weekday 7 is Sunday too.
  const weekdays = parseField(fields[4], 0, 7, DAYS);
  if (!minutes || !hours || !days || !months || !weekdays) return null;
  if (weekdays.has(7)) {
    weekdays.delete(7);
    weekdays.add(0);
  }
  return {
    reboot: false,
    minutes,
    hours,
    days,
    months,
    weekdays,
    dayAny: fields[2].startsWith("*"),
    weekAny: fields[4].startsWith("*"),
  };
}

export function isValidSchedule(expr: string): boolean {
  return parseSchedule(expr) !== null;
}

function dayMatches(parsed: ParsedSchedule, date: Date): boolean {
  const dom = parsed.days.has(date.getUTCDate());
  const dow = parsed.weekdays.has(date.getUTCDay());
  // Cron runs on either day when both fields are limited.
  if (!parsed.dayAny && !parsed.weekAny) return dom || dow;
  return dom && dow;
}

/**
 * The next times the schedule runs after `from`, in the host's time zone
 * given as its UTC offset in minutes. Empty for @reboot.
 */
export function nextRuns(
  expr: string,
  from: Date,
  count: number,
  offsetMinutes = 0,
): Date[] {
  const parsed = parseSchedule(expr);
  if (!parsed || parsed.reboot) return [];
  const out: Date[] = [];
  const shift = offsetMinutes * 60_000;
  // Work in the host's wall clock, kept in a UTC date.
  const wall = new Date(from.getTime() + shift);
  wall.setUTCSeconds(0, 0);
  wall.setUTCMinutes(wall.getUTCMinutes() + 1);
  const hours = [...parsed.hours].sort((a, b) => a - b);
  const minutes = [...parsed.minutes].sort((a, b) => a - b);
  const day = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()),
  );
  for (let i = 0; i < 366 * 5 && out.length < count; i++) {
    if (parsed.months.has(day.getUTCMonth() + 1) && dayMatches(parsed, day)) {
      for (const hour of hours) {
        for (const minute of minutes) {
          const at = new Date(day.getTime());
          at.setUTCHours(hour, minute, 0, 0);
          if (at.getTime() < wall.getTime()) continue;
          out.push(new Date(at.getTime() - shift));
          if (out.length >= count) return out;
        }
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return out;
}

export interface ScheduleSummary {
  key:
    | "reboot"
    | "everyMinute"
    | "everyNMinutes"
    | "hourlyAt"
    | "everyNHours"
    | "dailyAt"
    | "weekdaysAt"
    | "weeklyAt"
    | "monthlyAt"
    | "custom"
    | "invalid";
  values?: Record<string, string | number>;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A short summary key with values, for the UI to put into words. */
export function describeSchedule(expr: string): ScheduleSummary {
  const text = expr.trim().replace(/\s+/g, " ").toLowerCase();
  if (!isValidSchedule(text)) return { key: "invalid" };
  if (text === "@reboot") return { key: "reboot" };
  const full = text.startsWith("@") ? (MACROS[text] as string) : text;
  const [m, h, dom, mon, dow] = full.split(" ");
  const num = (value: string) => /^\d+$/.test(value);
  if (mon !== "*") return { key: "custom" };
  if (dom === "*" && dow === "*") {
    if (m === "*" && h === "*") return { key: "everyMinute" };
    const everyN = m.match(/^\*\/(\d+)$/);
    if (everyN && h === "*") {
      return { key: "everyNMinutes", values: { n: Number(everyN[1]) } };
    }
    if (num(m) && h === "*") {
      return { key: "hourlyAt", values: { minute: Number(m) } };
    }
    const everyH = h.match(/^\*\/(\d+)$/);
    if (num(m) && everyH) {
      return {
        key: "everyNHours",
        values: { n: Number(everyH[1]), minute: Number(m) },
      };
    }
  }
  if (!num(m) || !num(h)) return { key: "custom" };
  const time = `${pad(Number(h))}:${pad(Number(m))}`;
  if (dom === "*" && dow === "*") return { key: "dailyAt", values: { time } };
  if (dom === "*" && dow === "1-5") {
    return { key: "weekdaysAt", values: { time } };
  }
  if (dom === "*") {
    const day = parseValue(dow, 0, DAYS);
    if (day !== null && day <= 7) {
      return { key: "weeklyAt", values: { day: day % 7, time } };
    }
  }
  if (dow === "*" && num(dom)) {
    return { key: "monthlyAt", values: { day: Number(dom), time } };
  }
  return { key: "custom" };
}

/** A short stable hash, for ids that survive a reload. */
export function shortHash(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
