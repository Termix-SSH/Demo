import type {
  FactsHost,
  ProjectFile,
  RecapLine,
  RunMeta,
  RunState,
  RunSummary,
} from "../shared/types.js";
import { MARK } from "./scripts.js";

const START_GRACE_S = 20;

export function parseFiles(output: string): ProjectFile[] {
  const files: ProjectFile[] = [];
  for (const line of output.split("\n")) {
    if (!line.startsWith("F\t")) continue;
    const [, path, size, modified, playbook] = line.split("\t");
    if (!path) continue;
    files.push({
      path,
      size: Number(size) || 0,
      modified: (Number(modified) || 0) * 1000,
      playbook: playbook?.trim() === "1",
    });
  }
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

interface RawRun {
  meta: RunMeta | null;
  alive: boolean;
  cancelled: boolean;
  result: string;
  size: number;
  log: string;
}

/** Splits the marker based output of the run scripts into raw runs. */
export function parseRawRuns(output: string): RawRun[] {
  const runs: RawRun[] = [];
  let current: RawRun | null = null;
  let mode = "";
  const logLines: string[] = [];
  const flush = () => {
    if (current) {
      current.log = logLines.join("\n");
      runs.push(current);
    }
    logLines.length = 0;
  };
  for (const line of output.split("\n")) {
    if (mode !== "log" && line.startsWith(MARK)) {
      const key = line.slice(MARK.length).trim();
      if (key === "run") {
        flush();
        current = {
          meta: null,
          alive: false,
          cancelled: false,
          result: "",
          size: 0,
          log: "",
        };
        mode = "meta";
      } else if (key === "alive" && current) current.alive = true;
      else if (key === "cancelled" && current) current.cancelled = true;
      else if (key === "result" || key === "size" || key === "log") mode = key;
      continue;
    }
    if (!current) continue;
    if (mode === "meta") {
      try {
        current.meta = JSON.parse(line) as RunMeta;
      } catch {
        current.meta = null;
      }
      mode = "";
    } else if (mode === "result") {
      current.result = line.trim();
      mode = "";
    } else if (mode === "size") {
      current.size = Number(line.trim()) || 0;
      mode = "";
    } else if (mode === "log") {
      logLines.push(line);
    }
  }
  flush();
  return runs.filter((run) => run.meta);
}

export function summarize(raw: RawRun, nowS: number): RunSummary | null {
  const meta = raw.meta;
  if (!meta) return null;
  const [codeText, endText] = raw.result.split(" ");
  const hasResult = raw.result !== "" && codeText !== undefined;
  const exitCode = hasResult ? Number(codeText) : null;
  const endedAt = hasResult && endText ? Number(endText) * 1000 : null;
  let state: RunState;
  if (raw.alive) state = "running";
  else if (raw.cancelled) state = "cancelled";
  else if (hasResult) state = exitCode === 0 ? "ok" : "failed";
  else if (nowS - meta.startedAt / 1000 < START_GRACE_S) state = "running";
  else state = "lost";
  return { ...meta, state, exitCode, endedAt };
}

const RECAP_RE =
  /^(\S+)\s*:\s*ok=(\d+)\s+changed=(\d+)\s+unreachable=(\d+)\s+failed=(\d+)(?:\s+skipped=(\d+))?/;

export function parseRecap(log: string): RecapLine[] {
  const at = log.lastIndexOf("PLAY RECAP");
  if (at < 0) return [];
  const lines: RecapLine[] = [];
  for (const line of log.slice(at).split("\n").slice(1)) {
    const m = RECAP_RE.exec(line.trim());
    if (!m) continue;
    lines.push({
      host: m[1]!,
      ok: Number(m[2]),
      changed: Number(m[3]),
      unreachable: Number(m[4]),
      failed: Number(m[5]),
      skipped: Number(m[6] ?? 0),
    });
  }
  return lines;
}

const FACTS_HEAD =
  /^(\S+) \| (SUCCESS|FAILED|UNREACHABLE!|CHANGED)(?: \| rc=\d+)? => \{$/;

/** Reads the `host | SUCCESS => {json}` blocks an ad-hoc setup run prints. */
export function parseFacts(log: string): FactsHost[] {
  const out: FactsHost[] = [];
  const lines = log.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const head = FACTS_HEAD.exec(lines[i]!);
    if (!head) continue;
    const body = ["{"];
    let j = i + 1;
    for (; j < lines.length && lines[j] !== "}"; j++) body.push(lines[j]!);
    body.push("}");
    i = j;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(body.join("\n")) as Record<string, unknown>;
    } catch {
      data = {};
    }
    const ok = head[2] === "SUCCESS" || head[2] === "CHANGED";
    const facts = (data.ansible_facts ?? {}) as Record<string, unknown>;
    out.push({
      host: head[1]!,
      ok,
      message: ok ? "" : String(data.msg ?? data.stderr ?? "").slice(0, 500),
      facts,
    });
  }
  return out;
}
