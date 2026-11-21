export type Source = "journal" | "files" | "docker";
export type Level = "error" | "warn" | "info" | "debug";
export type LevelFilter = "all" | "warn" | "error";

export const SOURCES: readonly Source[] = ["journal", "files", "docker"];

export const MAX_HOSTS = 50;
export const MAX_LIMIT = 2000;
export const DEFAULT_LIMIT = 500;
export const MAX_RANGE_MS = 7 * 24 * 3_600_000;
export const MAX_QUERY = 200;
/** Most hosts one live follow can watch. */
export const MAX_FOLLOW_HOSTS = 10;
/** Most saved searches per person. */
export const MAX_SAVED = 50;

export const RANGE_IDS = ["15m", "1h", "6h", "24h", "7d"] as const;
export type RangeId = (typeof RANGE_IDS)[number];

export interface SearchRequest {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  /** Empty means every host the user can search. */
  hostIds: number[];
  sources: Source[];
  /** Unix ms. */
  from: number;
  to: number;
  level: LevelFilter;
  /** Only unit, container or file names containing this text. */
  origin: string;
  limit: number;
}

export interface LogEntry {
  time: number;
  hostId: number;
  host: string;
  source: Source;
  /** Unit, container or file path. */
  origin: string;
  level: Level;
  message: string;
}

export interface SourceResult {
  count: number;
  error?: string;
}

export interface HostResult {
  hostId: number;
  host: string;
  status: "ok" | "error";
  count: number;
  error?: string;
  sources: Partial<Record<Source, SourceResult>>;
}

export interface SearchResponse {
  entries: LogEntry[];
  hosts: HostResult[];
  /** More lines matched than the limit allows. */
  truncated: boolean;
  tookMs: number;
}

/** What a saved search keeps: the search, with a range instead of times. */
export interface SavedQuery {
  query: string;
  regex: boolean;
  caseSensitive: boolean;
  hostIds: number[];
  sources: Source[];
  range: RangeId;
  level: LevelFilter;
  origin: string;
}

export interface SavedAlert {
  enabled: boolean;
  /** Minutes between checks. */
  everyMinutes: number;
  /** Alert when a check finds at least this many lines. */
  minMatches: number;
  /** Alert channels to send to besides the person's own rules. */
  channelIds: number[];
}

export interface SavedSearchInput {
  name: string;
  search: SavedQuery;
  alert: SavedAlert;
}

export interface SavedSearch extends SavedSearchInput {
  id: number;
  /** The last check found enough lines and has not gone quiet yet. */
  alertActive: boolean;
  lastRunAt: string | null;
  lastMatchAt: string | null;
  lastCount: number | null;
  lastError: string | null;
}

export interface SearchableHost {
  id: number;
  name: string;
  folder: string | null;
}
