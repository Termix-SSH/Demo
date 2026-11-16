import { parseComposeProjects } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  DockerInventory,
  RunProgress,
  RunStatus,
  RunSummary,
  SnapshotEntry,
  SnapshotView,
} from "../shared/types.js";
import { MARK } from "./scripts.js";
import { trimEnd } from "./trim.js";

/* eslint-disable @typescript-eslint/no-explicit-any */

const num = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) ? value : 0;

function json(line: string | undefined): any {
  if (!line) return null;
  try {
    return JSON.parse(line.trim());
  } catch {
    return null;
  }
}

/** A restic status line, from backup or restore. */
export function parseProgress(line: string | undefined): RunProgress | null {
  const raw = json(line);
  if (!raw || raw.message_type !== "status") return null;
  const remaining = raw.seconds_remaining;
  return {
    percent: Math.min(Math.max(num(raw.percent_done), 0), 1),
    filesDone: num(raw.files_done ?? raw.files_restored),
    totalFiles: num(raw.total_files),
    bytesDone: num(raw.bytes_done ?? raw.bytes_restored),
    totalBytes: num(raw.total_bytes),
    secondsElapsed: num(raw.seconds_elapsed),
    secondsRemaining: typeof remaining === "number" ? remaining : null,
    current: Array.isArray(raw.current_files)
      ? raw.current_files
          .filter((f: unknown) => typeof f === "string")
          .slice(0, 2)
      : [],
  };
}

/** A restic summary line, and the snapshot it made. */
export function parseSummary(
  line: string | undefined,
): { summary: RunSummary; snapshotId: string | null } | null {
  const raw = json(line);
  if (!raw || raw.message_type !== "summary") return null;
  return {
    summary: {
      filesNew: num(raw.files_new),
      filesChanged: num(raw.files_changed),
      filesUnmodified: num(raw.files_unmodified ?? raw.files_skipped),
      dataAdded: num(raw.data_added ?? raw.bytes_restored),
      totalFiles: num(raw.total_files_processed ?? raw.total_files),
      totalBytes: num(raw.total_bytes_processed ?? raw.total_bytes),
      seconds: num(raw.total_duration ?? raw.seconds_elapsed),
    },
    snapshotId: typeof raw.snapshot_id === "string" ? raw.snapshot_id : null,
  };
}

/** The first restic error lines as plain text. */
export function parseErrors(text: string): string[] {
  return text
    .split("\n")
    .map((line) => {
      const raw = json(line);
      if (!raw) return "";
      const message = raw.error?.message ?? raw.message ?? "";
      return raw.item ? `${raw.item}: ${message}` : String(message);
    })
    .filter(Boolean);
}

export interface PolledRun {
  uid: string;
  missing: boolean;
  alive: boolean;
  result: { status: RunStatus; code: number; message: string } | null;
  progress: RunProgress | null;
  summary: RunSummary | null;
  snapshotId: string | null;
  errors: string[];
  log: string;
}

const RESULT_STATUSES: RunStatus[] = [
  "success",
  "warning",
  "failed",
  "canceled",
];

/** Splits the poll script output into one entry per run. */
export function parsePoll(output: string): PolledRun[] {
  const runs: PolledRun[] = [];
  let current: PolledRun | null = null;
  let section = "";
  const buffers: Record<string, string[]> = {};

  const flush = () => {
    if (!current) return;
    const result = buffers.result?.join("\n");
    if (result !== undefined) {
      const keys: Record<string, string> = {};
      for (const line of result.split("\n")) {
        const eq = line.indexOf("=");
        if (eq > 0) keys[line.slice(0, eq)] = line.slice(eq + 1);
      }
      const status = RESULT_STATUSES.includes(keys.status as RunStatus)
        ? (keys.status as RunStatus)
        : "failed";
      current.result = {
        status,
        code: Number(keys.code) || 0,
        message: keys.message ?? "",
      };
    }
    current.progress = parseProgress(buffers.progress?.[0]);
    const summary = parseSummary(buffers.summary?.[0]);
    current.summary = summary?.summary ?? null;
    current.snapshotId = summary?.snapshotId ?? null;
    current.errors = parseErrors((buffers.errors ?? []).join("\n"));
    current.log = (buffers.log ?? []).join("\n").trim();
    runs.push(current);
  };

  for (const line of output.split("\n")) {
    if (line.startsWith(MARK)) {
      const tag = line.slice(MARK.length).trim();
      if (tag.startsWith("run=")) {
        flush();
        current = {
          uid: tag.slice(4),
          missing: false,
          alive: false,
          result: null,
          progress: null,
          summary: null,
          snapshotId: null,
          errors: [],
          log: "",
        };
        for (const key of Object.keys(buffers)) delete buffers[key];
        section = "";
      } else if (current && tag === "missing") {
        current.missing = true;
      } else if (current && tag === "alive") {
        current.alive = true;
      } else if (tag === "end") {
        section = "";
      } else {
        section = tag;
        buffers[section] = [];
      }
      continue;
    }
    if (current && section) buffers[section]!.push(line);
  }
  flush();
  return runs;
}

export function parseSnapshots(output: string): SnapshotView[] {
  const start = output.indexOf("[");
  const raw = start >= 0 ? json(output.slice(start)) : null;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s: any) => s && typeof s.id === "string")
    .map((s: any) => ({
      id: s.id,
      shortId: typeof s.short_id === "string" ? s.short_id : s.id.slice(0, 8),
      time: typeof s.time === "string" ? s.time : "",
      hostname: typeof s.hostname === "string" ? s.hostname : "",
      paths: Array.isArray(s.paths) ? s.paths.map(String) : [],
      tags: Array.isArray(s.tags) ? s.tags.map(String) : [],
      bytes:
        typeof s.summary?.total_bytes_processed === "number"
          ? s.summary.total_bytes_processed
          : null,
      files:
        typeof s.summary?.total_files_processed === "number"
          ? s.summary.total_files_processed
          : null,
    }))
    .sort((a: SnapshotView, b: SnapshotView) => b.time.localeCompare(a.time));
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf("/");
  return cut <= 0 ? "/" : path.slice(0, cut);
}

/** The direct children of `dir` from `restic ls --json`. */
export function parseLs(output: string, dir: string): SnapshotEntry[] {
  const want = dir === "/" ? "/" : trimEnd(dir);
  const out: SnapshotEntry[] = [];
  for (const line of output.split("\n")) {
    const raw = json(line);
    if (!raw || raw.struct_type !== "node" || typeof raw.path !== "string") {
      continue;
    }
    if (raw.path === want || parentOf(raw.path) !== want) continue;
    const type =
      raw.type === "dir" || raw.type === "file" || raw.type === "symlink"
        ? raw.type
        : "other";
    out.push({
      name: String(raw.name ?? raw.path.split("/").pop()),
      path: raw.path,
      type,
      size: typeof raw.size === "number" ? raw.size : null,
      mtime: typeof raw.mtime === "string" ? raw.mtime : null,
    });
  }
  return out.sort((a, b) =>
    a.type === b.type
      ? a.name.localeCompare(b.name)
      : a.type === "dir"
        ? -1
        : b.type === "dir"
          ? 1
          : a.name.localeCompare(b.name),
  );
}

export interface DockerVolume {
  name: string;
  mountpoint: string;
  project: string;
}

export function parseDocker(output: string): {
  docker: boolean;
  volumes: DockerVolume[];
  inventory: DockerInventory;
} {
  if (output.includes(`${MARK}nodocker`)) {
    return {
      docker: false,
      volumes: [],
      inventory: { volumes: [], stacks: [] },
    };
  }
  const volStart = output.indexOf(`${MARK}volumes`);
  const stackStart = output.indexOf(`${MARK}stacks`);
  const volText =
    volStart >= 0
      ? output.slice(
          volStart + MARK.length + 7,
          stackStart >= 0 ? stackStart : undefined,
        )
      : "";
  const stackText =
    stackStart >= 0 ? output.slice(stackStart + MARK.length + 6) : "";
  const volumes: DockerVolume[] = [];
  for (const line of volText.split("\n")) {
    const parts = line.trim().split("|");
    if (parts.length < 3 || !parts[0]) continue;
    const project = parts[parts.length - 1]!.replace("<no value>", "");
    volumes.push({
      name: parts[0],
      mountpoint: parts.slice(1, -1).join("|"),
      project,
    });
  }
  const stacks = parseComposeProjects(stackText).map((stack) => ({
    name: stack.name,
    status: stack.state,
    dir: stack.composeFile ? parentOf(stack.composeFile) : "",
  }));
  return {
    docker: true,
    volumes,
    inventory: {
      volumes: volumes
        .map(({ name, mountpoint }) => ({ name, mountpoint }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      stacks,
    },
  };
}
