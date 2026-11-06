export type Source = "journal" | "files" | "docker";
export type Level = "error" | "warn" | "info" | "debug";
export type LevelFilter = "all" | "warn" | "error";

export const SOURCES: readonly Source[] = ["journal", "files", "docker"];

export const MAX_HOSTS = 50;
export const MAX_LIMIT = 2000;
export const DEFAULT_LIMIT = 500;
export const MAX_RANGE_MS = 7 * 24 * 3_600_000;
export const MAX_QUERY = 200;

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

export interface SearchableHost {
  id: number;
  name: string;
  folder: string | null;
}
