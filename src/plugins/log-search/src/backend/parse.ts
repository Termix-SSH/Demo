import { parseJournal } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Level, SearchRequest } from "../shared/types.js";
import { guessLevel, priorityLevel } from "./query.js";
import { journalQueryFor } from "./scripts.js";

export interface RawEntry {
  /** Unix ms, or 0 when the line has no time. */
  time: number;
  origin: string;
  level: Level;
  message: string;
}

export interface Parsed {
  entries: RawEntry[];
  /** A problem that stopped this source on the host. */
  error?: string;
}

const MAX_MESSAGE = 2000;
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001b\[[0-9;?]*[A-Za-z]/g;
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

export function cleanLine(line: string): string {
  const out = line.replace(ANSI_RE, "").replace(/\r$/, "");
  return out.length > MAX_MESSAGE ? `${out.slice(0, MAX_MESSAGE)}...` : out;
}

/** "+0100" or "-05:30" as minutes east of UTC. */
export function offsetMinutes(text: string): number {
  const match = /^([+-])(\d{2}):?(\d{2})$/.exec(text.trim());
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === "-" ? -minutes : minutes;
}

const ISO_RE =
  /^\[?(\d{4})[-/](\d{2})[-/](\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:[.,](\d{1,9}))?\s?(Z|[+-]\d{2}:?\d{2})?/;
const SYSLOG_RE = /^([A-Z][a-z]{2})\s+(\d{1,2})\s(\d{2}):(\d{2}):(\d{2})/;
const CLF_RE =
  /\[(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{4})\]/;

/**
 * The time a log line starts with, in Unix ms, or 0. A line with no zone is
 * read in the host's own zone, given as minutes east of UTC.
 */
export function lineTime(
  line: string,
  hostOffset: number,
  now = Date.now(),
): number {
  let match = ISO_RE.exec(line);
  if (match) {
    const [, y, mo, d, h, mi, s, frac, zone] = match;
    const offset = zone ? (zone === "Z" ? 0 : offsetMinutes(zone)) : hostOffset;
    const ms = frac ? Number(frac.slice(0, 3).padEnd(3, "0")) : 0;
    return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, ms) - offset * 60_000 || 0;
  }
  match = SYSLOG_RE.exec(line);
  if (match) {
    const month = MONTHS.indexOf(match[1].toLowerCase());
    if (month < 0) return 0;
    const year = new Date(now).getUTCFullYear();
    const at = (y: number) =>
      Date.UTC(y, month, +match![2], +match![3], +match![4], +match![5]) -
      hostOffset * 60_000;
    let time = at(year);
    // A December line read in January belongs to last year.
    if (time > now + 86_400_000) time = at(year - 1);
    return time;
  }
  match = CLF_RE.exec(line.slice(0, 200));
  if (match) {
    const month = MONTHS.indexOf(match[2].toLowerCase());
    if (month < 0) return 0;
    return (
      Date.UTC(+match[3], month, +match[1], +match[4], +match[5], +match[6]) -
      offsetMinutes(match[7]) * 60_000
    );
  }
  return 0;
}

export function parseJournalOutput(
  output: string,
  req: SearchRequest,
  now = Date.now(),
): Parsed {
  const entries = parseJournal(output, journalQueryFor(req, now)).map(
    (entry) => ({
      time: entry.time,
      origin: entry.unit || entry.ident,
      level: priorityLevel(entry.priority),
      message: cleanLine(entry.message),
    }),
  );
  return { entries };
}

export function parseFilesOutput(output: string, now = Date.now()): Parsed {
  const entries: RawEntry[] = [];
  let offset = 0;
  let origin = "";
  let mtime = 0;
  for (const raw of output.split("\n")) {
    if (raw.startsWith("@@TZ ")) {
      offset = offsetMinutes(raw.slice(5));
      continue;
    }
    if (raw.startsWith("@@FILE ")) {
      const rest = raw.slice(7);
      const space = rest.indexOf(" ");
      mtime = Number(rest.slice(0, space)) * 1000 || 0;
      origin = rest.slice(space + 1);
      continue;
    }
    if (!origin || !raw.trim() || raw.includes("\0")) continue;
    const message = cleanLine(raw);
    entries.push({
      time: lineTime(message, offset, now) || mtime,
      origin,
      level: guessLevel(message),
      message,
    });
  }
  return { entries };
}

export function parseDockerOutput(output: string): Parsed {
  const entries: RawEntry[] = [];
  let origin = "";
  for (const raw of output.split("\n")) {
    if (raw.startsWith("@@NODOCKER")) {
      return { entries, error: "Docker or Podman is not installed" };
    }
    if (raw.startsWith("@@ERR ")) {
      return { entries, error: raw.slice(6).slice(0, 300) };
    }
    if (raw.startsWith("@@C ")) {
      origin = raw.slice(4);
      continue;
    }
    if (!origin || !raw.trim()) continue;
    const space = raw.indexOf(" ");
    const stamp = space > 0 ? Date.parse(raw.slice(0, space)) : NaN;
    const hasStamp = Number.isFinite(stamp);
    const message = cleanLine(hasStamp ? raw.slice(space + 1) : raw);
    entries.push({
      time: hasStamp ? stamp : 0,
      origin,
      level: guessLevel(message),
      message,
    });
  }
  return { entries };
}
