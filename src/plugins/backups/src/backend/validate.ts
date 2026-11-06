import { isValidCron, isValidTimezone } from "../shared/cron.js";
import {
  DB_ENGINES,
  EMPTY_KEEP,
  OVERWRITE_POLICIES,
  REPO_KINDS,
  type JobAlerts,
  type JobHooks,
  type JobInput,
  type JobSourceInput,
  type KeepPolicy,
  type OverwritePolicy,
  type RepoLocation,
  type RepositoryInput,
  type RestoreTarget,
} from "../shared/types.js";
import { BackupsError } from "./errors.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const bad = (message: string) => new BackupsError(message, 400);

const CONTROL = /[\0-\x1f\x7f]/;

export function name(value: unknown, what = "Name"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw bad(`${what} is required`);
  if (text.length > 120) throw bad(`${what} is too long`);
  if (CONTROL.test(text))
    throw bad(`${what} has a character that is not allowed`);
  return text;
}

/** An absolute path on a host. No line breaks, so it fits one line of a list file. */
export function absPath(value: unknown, what = "Path"): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text.startsWith("/")) throw bad(`${what} must start with /`);
  if (text.length > 4096 || CONTROL.test(text)) {
    throw bad(`${what} is not valid`);
  }
  return text;
}

/** A restic exclude pattern. */
function pattern(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > 1024 || CONTROL.test(text)) {
    throw bad("An exclude pattern is not valid");
  }
  return text;
}

function strings(
  value: unknown,
  each: (v: unknown) => string,
  max = 200,
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw bad("Expected a list");
  if (value.length > max) throw bad("The list is too long");
  return [...new Set(value.map(each))];
}

const DOCKER_NAME = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,254}$/;
const STACK_NAME = /^[a-z0-9][a-z0-9_-]{0,62}$/;
const DB_NAME = /^[^\0-\x1f\x7f/\\]{1,128}$/;
const UNIX_USER = /^[a-z_][a-z0-9_.-]{0,31}$/;
const ADDRESS = /^[a-zA-Z0-9.:_-]{0,255}$/;
const DB_USER = /^[^\0-\x1f\x7f]{0,128}$/;
const SOURCE_ID = /^[a-z0-9]{1,16}$/;

export function sourceId(value: unknown): string {
  if (typeof value === "string" && SOURCE_ID.test(value)) return value;
  return Math.random().toString(36).slice(2, 10) || "s";
}

export function source(raw: any): JobSourceInput {
  if (!raw || typeof raw !== "object") throw bad("A source is not valid");
  const id = sourceId(raw.id);
  switch (raw.kind) {
    case "paths": {
      const paths = strings(raw.paths, (v) => absPath(v));
      if (paths.length === 0) throw bad("Add at least one path");
      return {
        id,
        kind: "paths",
        paths,
        excludes: strings(raw.excludes, pattern),
      };
    }
    case "database": {
      if (!DB_ENGINES.includes(raw.engine)) {
        throw bad("Pick MySQL, PostgreSQL or SQLite");
      }
      const loginId = Number(raw.loginId) || 0;
      if (!Number.isInteger(loginId) || loginId < 0) {
        throw bad("The database login is not valid");
      }
      const address = typeof raw.address === "string" ? raw.address.trim() : "";
      if (!ADDRESS.test(address))
        throw bad("The database address is not valid");
      const port =
        raw.port === null || raw.port === undefined || raw.port === ""
          ? null
          : Number(raw.port);
      if (
        port !== null &&
        (!Number.isInteger(port) || port < 1 || port > 65535)
      ) {
        throw bad("The database port is not valid");
      }
      const username = typeof raw.username === "string" ? raw.username : "";
      if (!DB_USER.test(username)) throw bad("The database user is not valid");
      const runAs = typeof raw.runAs === "string" ? raw.runAs.trim() : "";
      if (runAs && !UNIX_USER.test(runAs))
        throw bad("Run as user is not valid");
      const databases =
        raw.engine === "sqlite"
          ? strings(raw.databases, (v) => absPath(v, "A SQLite file"))
          : strings(raw.databases, (v) => {
              const text = typeof v === "string" ? v.trim() : "";
              if (!DB_NAME.test(text))
                throw bad("A database name is not valid");
              return text;
            });
      if (raw.engine === "sqlite" && databases.length === 0) {
        throw bad("Add the path of at least one SQLite file");
      }
      const password = typeof raw.password === "string" ? raw.password : "";
      if (/[\0\r\n]/.test(password)) throw bad("The password is not valid");
      return {
        id,
        kind: "database",
        engine: raw.engine,
        loginId: raw.engine === "sqlite" ? 0 : loginId,
        address,
        port,
        username,
        hasPassword: false,
        runAs,
        databases,
        password,
      };
    }
    case "docker": {
      const volumes = strings(raw.volumes, (v) => {
        if (typeof v !== "string" || !DOCKER_NAME.test(v)) {
          throw bad("A volume name is not valid");
        }
        return v;
      });
      const stacks = strings(raw.stacks, (v) => {
        if (typeof v !== "string" || !STACK_NAME.test(v)) {
          throw bad("A stack name is not valid");
        }
        return v;
      });
      if (volumes.length === 0 && stacks.length === 0) {
        throw bad("Pick at least one volume or stack");
      }
      return { id, kind: "docker", volumes, stacks, stop: raw.stop === true };
    }
    default:
      throw bad("A source is not valid");
  }
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0 || n > 10_000) {
    throw bad("Keep values must be whole numbers from 0 to 10000");
  }
  return n;
}

export function keep(raw: any): KeepPolicy {
  if (!raw || typeof raw !== "object") return { ...EMPTY_KEEP };
  return {
    last: count(raw.last),
    daily: count(raw.daily),
    weekly: count(raw.weekly),
    monthly: count(raw.monthly),
    yearly: count(raw.yearly),
  };
}

function hook(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  if (text.length > 20_000 || text.includes("\0")) {
    throw bad("A command is too long");
  }
  return text.trim() ? text : "";
}

export function hooks(raw: any): JobHooks {
  return { pre: hook(raw?.pre), post: hook(raw?.post) };
}

export function alerts(raw: any): JobAlerts {
  const staleDays = Number(raw?.staleDays ?? 0);
  if (!Number.isInteger(staleDays) || staleDays < 0 || staleDays > 365) {
    throw bad("Days without a backup must be from 0 to 365");
  }
  return { onFailure: raw?.onFailure !== false, staleDays };
}

export function job(raw: any): JobInput {
  if (!raw || typeof raw !== "object") throw bad("The job is not valid");
  const repositoryId = Number(raw.repositoryId);
  if (!Number.isInteger(repositoryId) || repositoryId < 1) {
    throw bad("Pick a repository");
  }
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) {
    throw bad("Add at least one source");
  }
  if (raw.sources.length > 20) throw bad("A job can have at most 20 sources");
  const cron = typeof raw.cron === "string" ? raw.cron.trim() : "";
  if (cron && !isValidCron(cron)) throw bad("The schedule is not valid");
  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (timezone && !isValidTimezone(timezone)) {
    throw bad("The time zone is not valid");
  }
  const sources = raw.sources.map(source);
  const ids = new Set<string>();
  for (const s of sources) {
    while (ids.has(s.id)) s.id = sourceId(undefined);
    ids.add(s.id);
  }
  return {
    name: name(raw.name),
    repositoryId,
    enabled: raw.enabled !== false,
    sources,
    hooks: hooks(raw.hooks),
    cron,
    timezone,
    keep: keep(raw.keep),
    alerts: alerts(raw.alerts),
    oneFileSystem: raw.oneFileSystem === true,
  };
}

const REMOTE = /^[A-Za-z0-9_]{1,64}$/;
const BUCKET = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,254}$/;
const REGION = /^[a-z0-9-]{0,64}$/;
const KEY_ID = /^[^\0-\x20\x7f]{0,256}$/;

function httpUrl(value: unknown, what: string): string {
  const text = typeof value === "string" ? value.trim() : "";
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw bad(`${what} is not a valid address`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw bad(`${what} must start with http:// or https://`);
  }
  if (url.username || url.password) {
    throw bad("Put the user and password in their own fields");
  }
  return text.replace(/\/+$/, "");
}

function relPath(value: unknown, what: string): string {
  const text =
    typeof value === "string" ? value.trim().replace(/^\/+|\/+$/g, "") : "";
  if (text.length > 1024 || CONTROL.test(text) || /\s/.test(text)) {
    throw bad(`${what} is not valid`);
  }
  return text;
}

export function repository(raw: any): RepositoryInput {
  if (!raw || typeof raw !== "object") throw bad("The repository is not valid");
  if (!REPO_KINDS.includes(raw.kind)) throw bad("Pick a storage type");
  const l = (raw.location ?? {}) as Record<string, unknown>;
  let location: RepoLocation;
  switch (raw.kind) {
    case "s3": {
      const endpoint = l.endpoint ? httpUrl(l.endpoint, "The endpoint") : "";
      const bucket = typeof l.bucket === "string" ? l.bucket.trim() : "";
      if (!BUCKET.test(bucket)) throw bad("The bucket name is not valid");
      const region = typeof l.region === "string" ? l.region.trim() : "";
      if (!REGION.test(region)) throw bad("The region is not valid");
      const accessKeyId =
        typeof l.accessKeyId === "string" ? l.accessKeyId.trim() : "";
      if (!accessKeyId || !KEY_ID.test(accessKeyId)) {
        throw bad("The access key id is required");
      }
      location = {
        endpoint,
        bucket,
        prefix: relPath(l.prefix, "The prefix"),
        region,
        accessKeyId,
      };
      break;
    }
    case "rest": {
      const username = typeof l.username === "string" ? l.username.trim() : "";
      if (!KEY_ID.test(username)) throw bad("The user name is not valid");
      location = { url: httpUrl(l.url, "The server address"), username };
      break;
    }
    case "rclone": {
      const remote = typeof l.remote === "string" ? l.remote.trim() : "";
      if (!REMOTE.test(remote)) {
        throw bad("The remote name may only use letters, numbers and _");
      }
      // Local and SFTP remotes can use a full path, so a leading / stays.
      const raw = typeof l.path === "string" ? l.path.trim() : "";
      location = {
        remote,
        path: (raw.startsWith("/") ? "/" : "") + relPath(raw, "The path"),
      };
      break;
    }
    default: {
      const hostId = Number(l.hostId);
      if (!Number.isInteger(hostId) || hostId < 1) throw bad("Pick a host");
      location = { hostId, path: absPath(l.path, "The folder") };
    }
  }
  const secret = typeof raw.secret === "string" ? raw.secret : "";
  if (secret.length > 20_000 || secret.includes("\0")) {
    throw bad("The secret is too long");
  }
  if (raw.kind !== "rclone" && /[\r\n]/.test(secret)) {
    throw bad("The secret is not valid");
  }
  const password = typeof raw.password === "string" ? raw.password : "";
  if (/[\0\r\n]/.test(password)) throw bad("The password is not valid");
  return { name: name(raw.name), kind: raw.kind, location, secret, password };
}

/** A restic snapshot id, full or short. */
export function snapshotId(value: unknown): string {
  const text = String(value ?? "");
  if (!/^[a-f0-9]{8,64}$/.test(text)) throw bad("The snapshot id is not valid");
  return text;
}

export function restoreTarget(
  raw: any,
): RestoreTarget & { hostId: number | null } {
  const path = raw?.path ? absPath(raw.path, "The target folder") : "/";
  const overwrite: OverwritePolicy = OVERWRITE_POLICIES.includes(raw?.overwrite)
    ? raw.overwrite
    : "if-changed";
  const includes = strings(
    raw?.includes,
    (v) => absPath(v, "A picked file"),
    1000,
  );
  const hostId =
    raw?.hostId === undefined || raw?.hostId === null
      ? null
      : Number(raw.hostId);
  if (hostId !== null && (!Number.isInteger(hostId) || hostId < 1)) {
    throw bad("The target host is not valid");
  }
  return { path, overwrite, includes, hostId };
}
