import { toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { RepoKind, RepoLocation } from "../shared/types.js";
import { BackupsError } from "./errors.js";
import { trimEnd } from "./trim.js";

export interface RepoSecrets {
  /** The restic password. */
  password: string;
  /** s3 secret key, rest password or rclone config lines. */
  secret: string;
}

export type Env = Record<string, string>;

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

/** The restic repository string. Never holds a secret. */
export function repoString(kind: RepoKind, location: RepoLocation): string {
  switch (kind) {
    case "s3": {
      const endpoint = trimEnd(location.endpoint || "https://s3.amazonaws.com");
      const parts = [endpoint, location.bucket, location.prefix].filter(
        Boolean,
      );
      return `s3:${parts.join("/")}`;
    }
    case "rest":
      return `rest:${location.url}/`;
    case "rclone":
      return `rclone:${location.remote}:${location.path ?? ""}`;
    case "local":
      return location.path ?? "";
  }
}

/**
 * Lines of an rclone config section as `key = value`. A `[name]` header and
 * comments are skipped.
 */
export function parseRcloneConfig(text: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    if (line.startsWith("[") && line.endsWith("]")) continue;
    const eq = line.indexOf("=");
    if (eq < 1)
      throw new BackupsError(`This rclone line is not valid: ${line}`);
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!/^[a-zA-Z0-9_]+$/.test(key)) {
      throw new BackupsError(`This rclone key is not valid: ${key}`);
    }
    out.push([key, value]);
  }
  if (!out.some(([key]) => key === "type")) {
    throw new BackupsError(
      "The rclone config needs a type line, like type = s3",
    );
  }
  return out;
}

/** Everything restic needs to open the repository, as environment values. */
export function repoEnv(
  kind: RepoKind,
  location: RepoLocation,
  secrets: RepoSecrets,
): Env {
  const out: Env = {
    RESTIC_REPOSITORY: repoString(kind, location),
    RESTIC_PASSWORD: secrets.password,
    RESTIC_PROGRESS_FPS: "0.2",
  };
  switch (kind) {
    case "s3":
      out.AWS_ACCESS_KEY_ID = location.accessKeyId ?? "";
      out.AWS_SECRET_ACCESS_KEY = secrets.secret;
      if (location.region) out.AWS_DEFAULT_REGION = location.region;
      break;
    case "rest":
      if (location.username) {
        out.RESTIC_REST_USERNAME = location.username;
        out.RESTIC_REST_PASSWORD = secrets.secret;
      }
      break;
    case "rclone": {
      // The remote comes from these values alone, not a config file on the host.
      out.RCLONE_CONFIG = "/dev/null";
      const prefix = `RCLONE_CONFIG_${(location.remote ?? "").toUpperCase()}_`;
      for (const [key, value] of parseRcloneConfig(secrets.secret)) {
        out[prefix + key.toUpperCase()] = value;
      }
      break;
    }
    case "local":
      break;
  }
  return out;
}

export interface RepoSpec {
  kind: RepoKind;
  location: RepoLocation;
}

/**
 * Why a mirror can't take a copy from the main repository, or null. restic
 * copy opens both at once, so they can't need different values in the same
 * environment names.
 */
export function mirrorConflict(
  main: RepoSpec,
  mirror: RepoSpec,
  hostId: number,
): string | null {
  if (mirror.kind === "local" && mirror.location.hostId !== hostId) {
    return "A folder mirror must be on the job's own host";
  }
  if (main.kind === "s3" && mirror.kind === "s3") {
    if (
      (main.location.accessKeyId ?? "") !== (mirror.location.accessKeyId ?? "")
    ) {
      return "Two S3 repositories can only mirror each other with the same access key";
    }
    if ((main.location.region ?? "") !== (mirror.location.region ?? "")) {
      return "Two S3 repositories can only mirror each other in the same region";
    }
  }
  if (
    main.kind === "rclone" &&
    mirror.kind === "rclone" &&
    (main.location.remote ?? "").toUpperCase() ===
      (mirror.location.remote ?? "").toUpperCase()
  ) {
    return "Two rclone repositories need different remote names to mirror each other";
  }
  return null;
}

/**
 * Env for copying to one mirror: the mirror's own values, each prefixed
 * TMX_M<n>_ so the run script can switch to them in a subshell.
 */
export function mirrorEnv(index: number, env: Env): Env {
  const out: Env = {};
  for (const [key, value] of Object.entries(env)) {
    if (key === "RESTIC_PROGRESS_FPS") continue;
    out[`TMX_M${index}_${key}`] = value;
  }
  return out;
}

/**
 * The main repository as a copy source. A rest login rides in the address,
 * since the mirror may need RESTIC_REST_USERNAME for itself.
 */
export function copySourceEnv(
  kind: RepoKind,
  location: RepoLocation,
  secret: string,
): Env {
  if (kind !== "rest" || !location.username || !location.url) return {};
  const url = new URL(location.url);
  url.username = encodeURIComponent(location.username);
  url.password = encodeURIComponent(secret);
  return { TMX_FROM_REPOSITORY: `rest:${trimEnd(url.toString())}/` };
}

/**
 * Shell lines that export the values. Each value is decoded from base64 by a
 * pipe, so it is never in argv, never parsed by the shell and never on disk.
 */
export function exportLines(env: Env): string {
  return Object.entries(env)
    .map(([key, value]) => {
      if (!ENV_NAME.test(key)) {
        throw new BackupsError(`Bad environment name ${key}`);
      }
      if (value === "") return `export ${key}=`;
      return `export ${key}="$(printf %s '${toBase64(value)}' | base64 -d)"`;
    })
    .join("\n");
}
