import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import {
  DEFAULT_LIMIT,
  MAX_HOSTS,
  MAX_LIMIT,
  MAX_QUERY,
  MAX_RANGE_MS,
  SOURCES,
  type Level,
  type LevelFilter,
  type SearchRequest,
  type Source,
} from "../shared/types.js";

const RANGES: Record<string, number> = {
  "15m": 15 * 60_000,
  "1h": 3_600_000,
  "6h": 6 * 3_600_000,
  "24h": 24 * 3_600_000,
  "7d": MAX_RANGE_MS,
};

export function rangeMs(range: unknown): number {
  return RANGES[String(range)] ?? RANGES["1h"];
}

const text = (value: unknown, max: number, name: string): string => {
  const out = typeof value === "string" ? value.trim() : "";
  if (out.length > max || /[\r\n\0]/.test(out)) {
    throw new HostScriptError(`${name} is not valid`);
  }
  return out;
};

/** A pattern that nests a repeat inside a repeat can hang the matcher. */
const RISKY_REGEX = /\((?:[^()\\]|\\.)*[+*](?:[^()\\]|\\.)*\)[+*{]/;

/** Reads a search from a request body. Anything odd throws a HostScriptError. */
export function parseSearch(
  input: Record<string, unknown>,
  now = Date.now(),
): SearchRequest {
  const query = text(input.query, MAX_QUERY, "The search");
  const regex = input.regex === true;
  if (regex && query) {
    if (RISKY_REGEX.test(query)) {
      throw new HostScriptError("That pattern is too complex");
    }
    try {
      new RegExp(query);
    } catch {
      throw new HostScriptError("That is not a valid pattern");
    }
  }

  const to = Math.min(now, Number(input.to) || now);
  let from = Number(input.from);
  if (!Number.isFinite(from) || from <= 0) from = to - RANGES["1h"];
  from = Math.max(from, to - MAX_RANGE_MS);
  if (from >= to) throw new HostScriptError("The time range is not valid");

  const rawHosts = Array.isArray(input.hostIds) ? input.hostIds : [];
  const hostIds = [
    ...new Set(
      rawHosts.map(Number).filter((id) => Number.isInteger(id) && id > 0),
    ),
  ];
  if (hostIds.length > MAX_HOSTS) {
    throw new HostScriptError(`Pick at most ${MAX_HOSTS} hosts`);
  }

  const rawSources = Array.isArray(input.sources) ? input.sources : [];
  const sources = SOURCES.filter((s) => rawSources.includes(s));

  const level: LevelFilter =
    input.level === "warn" || input.level === "error" ? input.level : "all";
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Math.round(Number(input.limit) || DEFAULT_LIMIT)),
  );

  return {
    query,
    regex,
    caseSensitive: input.caseSensitive === true,
    hostIds,
    sources: sources.length ? sources : [...SOURCES],
    from,
    to,
    level,
    origin: text(input.origin, 120, "The name filter"),
    limit,
  };
}

/** Builds the line matcher for a search. An empty search matches everything. */
export function lineMatcher(req: SearchRequest): (line: string) => boolean {
  if (!req.query) return () => true;
  if (req.regex) {
    const re = new RegExp(req.query, req.caseSensitive ? "" : "i");
    return (line) => re.test(line);
  }
  if (req.caseSensitive) return (line) => line.includes(req.query);
  const needle = req.query.toLowerCase();
  return (line) => line.toLowerCase().includes(needle);
}

const ERROR_RE =
  /\b(error|fatal|panic|critical|crit|emerg|alert|fail(?:ed|ure)?)\b/i;
const WARN_RE = /\b(warn(?:ing)?)\b/i;
const DEBUG_RE = /\b(debug|trace)\b/i;

export function guessLevel(message: string): Level {
  if (ERROR_RE.test(message)) return "error";
  if (WARN_RE.test(message)) return "warn";
  if (DEBUG_RE.test(message)) return "debug";
  return "info";
}

export function priorityLevel(priority: number): Level {
  if (priority <= 3) return "error";
  if (priority === 4) return "warn";
  if (priority >= 7) return "debug";
  return "info";
}

export function levelPasses(level: Level, filter: LevelFilter): boolean {
  if (filter === "all") return true;
  if (filter === "error") return level === "error";
  return level === "error" || level === "warn";
}

export function originPasses(origin: string, filter: string): boolean {
  return !filter || origin.toLowerCase().includes(filter.toLowerCase());
}

export const isSource = (value: unknown): value is Source =>
  SOURCES.includes(value as Source);
