import type {
  Branch,
  Commit,
  FileChange,
  Remote,
  StashEntry,
  StatusView,
} from "../shared/types.js";
import { MARK } from "./scripts.js";

const FS = "\x1f";
const RS = "\x1e";

const int = (value: string | undefined) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const baseName = (path: string) =>
  path.replace(/\/+$/, "").split("/").pop() || path;

/** Text after a marker line, up to the next marker. */
export function sections(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  let name = "";
  let lines: string[] = [];
  const flush = () => {
    if (name) out[name] = lines.join("\n");
  };
  for (const line of text.split("\n")) {
    if (line.startsWith(MARK)) {
      flush();
      name = line.slice(MARK.length).trim();
      lines = [];
    } else {
      lines.push(line);
    }
  }
  flush();
  return out;
}

export interface ParsedStatus extends StatusView {
  changed: number;
  untracked: number;
  conflicts: number;
}

/**
 * Reads `git status --porcelain=v2 -b`. With `nul` the entries are NUL
 * separated and a rename is followed by its source.
 */
export function parseStatus(text: string, nul: boolean): ParsedStatus {
  const result: ParsedStatus = {
    branch: "",
    detached: false,
    upstream: "",
    ahead: 0,
    behind: 0,
    files: [],
    changed: 0,
    untracked: 0,
    conflicts: 0,
  };
  const parts = text.split(nul ? "\0" : "\n");
  for (let i = 0; i < parts.length; i++) {
    const line = parts[i];
    if (!line) continue;
    if (line.startsWith("# ")) {
      const [key, ...rest] = line.slice(2).split(" ");
      const value = rest.join(" ");
      if (key === "branch.head") {
        result.detached = value === "(detached)";
        result.branch = result.detached ? "" : value;
      } else if (key === "branch.upstream") {
        result.upstream = value;
      } else if (key === "branch.ab") {
        const m = value.match(/^\+(\d+) -(\d+)$/);
        if (m) {
          result.ahead = int(m[1]);
          result.behind = int(m[2]);
        }
      }
      continue;
    }
    const kind = line[0];
    if (kind === "1" || kind === "2") {
      const fields = line.split(" ");
      const xy = fields[1] ?? "..";
      let path: string;
      let from: string | undefined;
      if (kind === "1") {
        path = fields.slice(8).join(" ");
      } else if (nul) {
        path = fields.slice(9).join(" ");
        from = parts[++i];
      } else {
        const rest = fields.slice(9).join(" ");
        const [p, o] = rest.split("\t");
        path = p;
        from = o;
      }
      result.files.push({ path, from, index: xy[0], tree: xy[1] });
      result.changed++;
    } else if (kind === "u") {
      const fields = line.split(" ");
      result.files.push({
        path: fields.slice(10).join(" "),
        index: fields[1]?.[0] ?? "U",
        tree: fields[1]?.[1] ?? "U",
        conflict: true,
      });
      result.conflicts++;
      result.changed++;
    } else if (kind === "?") {
      result.files.push({
        path: line.slice(2),
        index: ".",
        tree: "?",
        untracked: true,
      });
      result.untracked++;
    }
  }
  return result;
}

export interface ParsedInfo {
  path: string;
  error?: string;
  status?: ParsedStatus;
  last?: { hash: string; author: string; date: string; subject: string };
  remoteUrl: string;
  stashes: number;
  name: string;
}

/** One block per repo, from the info script. */
export function parseInfo(stdout: string): ParsedInfo[] {
  const out: ParsedInfo[] = [];
  const blocks = stdout.split(`${MARK}repo\n`).slice(1);
  for (const block of blocks) {
    const nl = block.indexOf("\n");
    const path = block.slice(0, nl).trim();
    const rest = block.slice(nl + 1);
    const base = { path, name: baseName(path), remoteUrl: "", stashes: 0 };
    const s = sections(rest);
    if ("missing" in s) {
      out.push({ ...base, error: "missing" });
      continue;
    }
    if ("notrepo" in s) {
      out.push({ ...base, error: "notrepo" });
      continue;
    }
    const lastParts = (s.last ?? "").trim().split(FS);
    out.push({
      ...base,
      status: parseStatus(s.status ?? "", false),
      last:
        lastParts.length >= 4
          ? {
              hash: lastParts[0],
              author: lastParts[1],
              date: lastParts[2],
              subject: lastParts.slice(3).join(FS),
            }
          : undefined,
      remoteUrl: hideCredentials((s.remote ?? "").trim()),
      stashes: int((s.stash ?? "").trim()),
    });
  }
  return out;
}

/** Removes a user:password part from an https address. */
export function hideCredentials(url: string): string {
  return url.replace(/^(https?:\/\/)[^/@\s]+@/i, "$1");
}

export function parseLog(text: string): Commit[] {
  const commits: Commit[] = [];
  for (const record of text.split(RS)) {
    const body = record.replace(/^\n+/, "");
    if (!body.trim()) continue;
    const f = body.split(FS);
    if (f.length < 6) continue;
    commits.push({
      hash: f[0],
      short: f[1],
      author: f[2],
      date: f[3],
      refs: f[4]
        ? f[4]
            .split(", ")
            .map((r) => r.replace(/^HEAD -> /, ""))
            .filter((r) => r && r !== "HEAD")
        : [],
      subject: f.slice(5).join(FS).trim(),
    });
  }
  return commits;
}

export function parseCommitHead(text: string): {
  commit: Commit;
  body: string;
} {
  const [head, ...rest] = text.split(RS);
  const commit = parseLog(`${head}${RS}`)[0];
  return { commit, body: rest.join(RS).trim() };
}

export function parseBranches(text: string): Branch[] {
  const branches: Branch[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const f = line.split(FS);
    if (f.length < 7) continue;
    const ref = f[1];
    const remote = ref.startsWith("refs/remotes/");
    if (remote && ref.endsWith("/HEAD")) continue;
    const track = f[4];
    const ahead = track.match(/ahead (\d+)/);
    const behind = track.match(/behind (\d+)/);
    branches.push({
      name: f[2],
      current: f[0] === "*",
      remote,
      upstream: f[3],
      ahead: int(ahead?.[1]),
      behind: int(behind?.[1]),
      gone: track.includes("gone"),
      hash: f[5],
      subject: f.slice(6).join(FS),
    });
  }
  return branches.sort(
    (a, b) =>
      Number(b.current) - Number(a.current) ||
      Number(a.remote) - Number(b.remote) ||
      a.name.localeCompare(b.name),
  );
}

export function parseRemotes(text: string): Remote[] {
  const map = new Map<string, Remote>();
  for (const line of text.split("\n")) {
    const m = line.match(/^(\S+)\t(\S+) \((fetch|push)\)$/);
    if (!m) continue;
    const entry = map.get(m[1]) ?? { name: m[1], fetch: "", push: "" };
    entry[m[3] as "fetch" | "push"] = hideCredentials(m[2]);
    map.set(m[1], entry);
  }
  return [...map.values()];
}

export function parseStashes(text: string): StashEntry[] {
  const out: StashEntry[] = [];
  for (const line of text.split("\n")) {
    const [name, message] = line.split(FS);
    const m = name?.match(/^stash@\{(\d+)\}$/);
    if (m) out.push({ index: int(m[1]), name, message: message ?? "" });
  }
  return out;
}

export function parseAutoResult(stdout: string): {
  outcome: "pulled" | "uptodate" | "skipped" | "failed";
  message: string;
} {
  const s = sections(stdout);
  for (const outcome of ["pulled", "uptodate", "skipped", "failed"] as const) {
    if (outcome in s) {
      const message = s[outcome].trim().split("\n").join(" | ");
      return { outcome, message: message.slice(0, 500) };
    }
  }
  return {
    outcome: "failed",
    message: stdout.trim().slice(0, 500) || "No answer from the host",
  };
}

export type { FileChange };
