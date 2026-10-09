/**
 * The shape of a Termix announcement. scripts/announce.ts builds
 * announcements.json from the Markdown files in announcements/, and the
 * backend reads that file back through the same parser.
 */

export const ANNOUNCEMENT_SEVERITIES = [
  "info",
  "success",
  "warning",
  "critical",
] as const;
export const ANNOUNCEMENT_AUDIENCES = ["everyone", "admins"] as const;
export const ANNOUNCEMENT_DISPLAYS = ["inbox", "popup"] as const;
export const MAX_ACTIONS = 4;

export type AnnouncementAudience = (typeof ANNOUNCEMENT_AUDIENCES)[number];
export type AnnouncementDisplay = (typeof ANNOUNCEMENT_DISPLAYS)[number];

/** A button under an announcement: a web page or a Termix tab. */
export interface AnnouncementAction {
  label: string;
  url?: string;
  tab?: string;
}

export interface Announcement {
  id: string;
  title: string;
  /** Markdown. */
  body: string;
  severity: (typeof ANNOUNCEMENT_SEVERITIES)[number];
  /** When it goes live, ISO. */
  date: string;
  /** When it stops reaching inboxes, ISO, or null for never. */
  expires: string | null;
  /** Also reach users who signed up after `date`. */
  newUsers: boolean;
  audience: AnnouncementAudience;
  display: AnnouncementDisplay;
  actions: AnnouncementAction[];
}

/** The announcement when it is valid, otherwise what is wrong with it. */
export interface ParseResult {
  announcement?: Announcement;
  errors: string[];
}

const KEYS = new Set([
  "id",
  "title",
  "body",
  "severity",
  "date",
  "expires",
  "newUsers",
  "audience",
  "display",
  "actions",
]);
const ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const TAB_PATTERN = /^[a-z0-9][a-z0-9._-]*$/i;
const HOUR_MS = 60 * 60 * 1000;
const UNIT_MS: Record<string, number> = {
  h: HOUR_MS,
  d: 24 * HOUR_MS,
  w: 7 * 24 * HOUR_MS,
};

/** "12h", "7d" or "2w" in milliseconds, or null. */
export function parseDuration(value: string): number | null {
  const match = /^(\d+)\s*([hdw])$/i.exec(value.trim());
  if (!match) return null;
  const amount = Number(match[1]);
  return amount > 0 ? amount * UNIT_MS[match[2].toLowerCase()] : null;
}

function toTime(value: unknown): number | null {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.getTime() : null;
  }
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value.trim());
  return Number.isFinite(time) ? time : null;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T | null {
  if (value === undefined || value === null || value === "") return fallback;
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseActions(raw: unknown, errors: string[]): AnnouncementAction[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    errors.push("actions must be a list");
    return [];
  }
  if (raw.length > MAX_ACTIONS) {
    errors.push(`at most ${MAX_ACTIONS} actions`);
  }
  const actions: AnnouncementAction[] = [];
  raw.forEach((entry, index) => {
    const where = `actions[${index}]`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${where} must have a label and a url or tab`);
      return;
    }
    const { label, url, tab, ...rest } = entry as Record<string, unknown>;
    for (const key of Object.keys(rest)) {
      errors.push(`${where} has an unknown key "${key}"`);
    }
    if (typeof label !== "string" || !label.trim()) {
      errors.push(`${where} needs a label`);
    } else if (label.trim().length > 40) {
      errors.push(`${where} label is over 40 characters`);
    }
    const hasUrl = url !== undefined && url !== null;
    const hasTab = tab !== undefined && tab !== null;
    if (hasUrl === hasTab) {
      errors.push(`${where} needs either a url or a tab`);
      return;
    }
    if (hasUrl && (typeof url !== "string" || !/^https?:\/\/\S+$/i.test(url))) {
      errors.push(`${where} url must start with http:// or https://`);
      return;
    }
    if (hasTab && (typeof tab !== "string" || !TAB_PATTERN.test(tab))) {
      errors.push(`${where} tab is not a tab id`);
      return;
    }
    if (typeof label !== "string") return;
    actions.push(
      hasUrl
        ? { label: label.trim(), url: url as string }
        : { label: label.trim(), tab: tab as string },
    );
  });
  return actions;
}

/**
 * Checks one announcement and fills in its defaults. `expires` may be a date
 * or a duration counted from `date`.
 */
export function parseAnnouncement(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { errors: ["not an object"] };
  }
  const entry = raw as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(entry)) {
    if (!KEYS.has(key)) errors.push(`unknown key "${key}"`);
  }

  const id = typeof entry.id === "string" ? entry.id.trim() : "";
  if (!ID_PATTERN.test(id)) {
    errors.push("id must be lowercase letters, numbers and dashes");
  }

  const title = typeof entry.title === "string" ? entry.title.trim() : "";
  if (!title) errors.push("title is required");
  else if (title.length > 200) errors.push("title is over 200 characters");

  if (entry.body !== undefined && typeof entry.body !== "string") {
    errors.push("body must be text");
  }
  const body = typeof entry.body === "string" ? entry.body.trim() : "";

  const severity = oneOf(entry.severity, ANNOUNCEMENT_SEVERITIES, "info");
  if (!severity) {
    errors.push(
      `severity must be one of ${ANNOUNCEMENT_SEVERITIES.join(", ")}`,
    );
  }
  const audience = oneOf(entry.audience, ANNOUNCEMENT_AUDIENCES, "everyone");
  if (!audience) {
    errors.push(`audience must be one of ${ANNOUNCEMENT_AUDIENCES.join(", ")}`);
  }
  const display = oneOf(entry.display, ANNOUNCEMENT_DISPLAYS, "inbox");
  if (!display) {
    errors.push(`display must be one of ${ANNOUNCEMENT_DISPLAYS.join(", ")}`);
  }

  if (entry.newUsers !== undefined && typeof entry.newUsers !== "boolean") {
    errors.push("newUsers must be true or false");
  }

  const date = toTime(entry.date);
  if (date === null) errors.push("date must be a date like 2026-10-10");

  let expires: number | null = null;
  if (
    entry.expires !== undefined &&
    entry.expires !== null &&
    entry.expires !== ""
  ) {
    const duration =
      typeof entry.expires === "string" ? parseDuration(entry.expires) : null;
    expires =
      duration !== null
        ? date === null
          ? null
          : date + duration
        : toTime(entry.expires);
    if (expires === null && date !== null) {
      errors.push("expires must be a date or a duration like 7d, 2w or 12h");
    } else if (expires !== null && date !== null && expires <= date) {
      errors.push("expires must be after date");
    }
  }

  const actions = parseActions(entry.actions, errors);

  if (errors.length > 0) return { errors };
  return {
    errors: [],
    announcement: {
      id,
      title,
      body,
      severity,
      date: new Date(date).toISOString(),
      expires: expires === null ? null : new Date(expires).toISOString(),
      newUsers: entry.newUsers === true,
      audience,
      display,
      actions,
    },
  };
}

/** Whether an announcement is live at `now`: published and not expired. */
export function isLive(announcement: Announcement, now = Date.now()): boolean {
  if (Date.parse(announcement.date) > now) return false;
  return !announcement.expires || Date.parse(announcement.expires) > now;
}
