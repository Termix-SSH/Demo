import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { isValidSchedule, shortHash } from "../shared/schedule.js";
import type { CronJob, JobBody, SystemJob } from "../shared/types.js";

interface Located extends CronJob {
  line: number;
  /** Line index of the label comment, or -1. */
  labelLine: number;
}

const ENV_RE = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/;

/** Splits a job line into schedule and the rest. */
function split(
  line: string,
  fields: number,
): { schedule: string; rest: string } {
  const text = line.trim();
  if (text.startsWith("@")) {
    const [schedule, ...rest] = text.split(/\s+/);
    return { schedule, rest: rest.join(" ") };
  }
  const parts = text.split(/\s+/);
  if (parts.length <= fields) return { schedule: "", rest: "" };
  // Keep the command's own spacing: cut after the fifth field.
  let index = 0;
  for (let i = 0; i < 5; i++) {
    index = text.indexOf(parts[i], index) + parts[i].length;
  }
  return {
    schedule: parts.slice(0, 5).join(" "),
    rest: text.slice(index).trim(),
  };
}

function parseJobLine(
  raw: string,
): { enabled: boolean; schedule: string; command: string } | null {
  const line = raw.replace(/\s+$/, "");
  if (!line.trim()) return null;
  let enabled = true;
  let body = line;
  if (line.trimStart().startsWith("#")) {
    enabled = false;
    body = line.trimStart().replace(/^#\s?/, "");
  }
  if (ENV_RE.test(body) || body.trimStart().startsWith("#")) return null;
  const { schedule, rest } = split(body, 5);
  if (!rest || !isValidSchedule(schedule)) return null;
  return { enabled, schedule, command: rest };
}

function isComment(line: string | undefined): boolean {
  return (
    line !== undefined &&
    line.trimStart().startsWith("#") &&
    parseJobLine(line) === null
  );
}

function locate(text: string): Located[] {
  const lines = text.split("\n");
  const seen = new Map<string, number>();
  const out: Located[] = [];
  lines.forEach((line, index) => {
    const job = parseJobLine(line);
    if (!job) return;
    // A single comment line right above a job is its label.
    const above = lines[index - 1];
    const labelled =
      isComment(above) && !isComment(lines[index - 2]) && index > 0;
    const base = shortHash(`${job.schedule}\n${job.command}`);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    out.push({
      ...job,
      id: n ? `${base}-${n}` : base,
      label: labelled ? above.trimStart().replace(/^#\s?/, "").trim() : "",
      line: index,
      labelLine: labelled ? index - 1 : -1,
    });
  });
  return out;
}

/** The jobs in a crontab. Variables and other comments are not jobs. */
export function parseJobs(text: string): CronJob[] {
  return locate(text).map(({ line: _l, labelLine: _ll, ...job }) => job);
}

/** Checks a job from a request and returns it cleaned up. */
export function cleanJob(body: JobBody): Required<Omit<JobBody, "user">> {
  const schedule = String(body.schedule ?? "")
    .trim()
    .replace(/\s+/g, " ");
  const command = String(body.command ?? "").trim();
  const label = String(body.label ?? "").trim();
  if (!isValidSchedule(schedule)) {
    throw new HostScriptError("The schedule is not valid");
  }
  if (!command) throw new HostScriptError("Enter a command");
  if (/[\r\n]/.test(command) || /[\r\n]/.test(label)) {
    throw new HostScriptError("The command must be one line");
  }
  if (command.length > 4000 || label.length > 200) {
    throw new HostScriptError("The command is too long");
  }
  return { schedule, command, label, enabled: body.enabled !== false };
}

function jobLine(job: { schedule: string; command: string; enabled: boolean }) {
  const line = `${job.schedule} ${job.command}`;
  return job.enabled ? line : `# ${line}`;
}

function finish(lines: string[]): string {
  const text = lines.join("\n").replace(/\n+$/, "");
  return text ? `${text}\n` : "";
}

function find(text: string, id: string): Located {
  const job = locate(text).find((item) => item.id === id);
  if (!job) {
    throw new HostScriptError(
      "This job changed on the host. Refresh and try again.",
      409,
    );
  }
  return job;
}

export function addJob(text: string, job: ReturnType<typeof cleanJob>): string {
  const trimmed = text.replace(/\n+$/, "");
  const lines = trimmed ? trimmed.split("\n") : [];
  if (lines.length && lines[lines.length - 1].trim()) lines.push("");
  if (job.label) lines.push(`# ${job.label}`);
  lines.push(jobLine(job));
  return finish(lines);
}

export function updateJob(
  text: string,
  id: string,
  job: ReturnType<typeof cleanJob>,
): string {
  const found = find(text, id);
  const lines = text.split("\n");
  lines[found.line] = jobLine(job);
  if (found.labelLine >= 0) {
    if (job.label) lines[found.labelLine] = `# ${job.label}`;
    else lines.splice(found.labelLine, 1);
  } else if (job.label) {
    lines.splice(found.line, 0, `# ${job.label}`);
  }
  return finish(lines);
}

export function setJobEnabled(
  text: string,
  id: string,
  enabled: boolean,
): string {
  const found = find(text, id);
  const lines = text.split("\n");
  lines[found.line] = jobLine({ ...found, enabled });
  return finish(lines);
}

export function deleteJob(text: string, id: string): string {
  const found = find(text, id);
  const lines = text.split("\n");
  lines.splice(found.line, 1);
  if (found.labelLine >= 0) lines.splice(found.labelLine, 1);
  return finish(lines);
}

export function getJob(text: string, id: string): CronJob {
  const { line: _l, labelLine: _ll, ...job } = find(text, id);
  return job;
}

/**
 * The command cron would run and the text it would get on stdin. An
 * unescaped % ends the command; the rest is stdin with % as line breaks.
 */
export function splitPercent(command: string): { run: string; input: string } {
  let run = "";
  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (char === "\\" && command[i + 1] === "%") {
      run += "%";
      i++;
      continue;
    }
    if (char === "%") {
      return {
        run,
        input: command
          .slice(i + 1)
          .replace(/(?<!\\)%/g, "\n")
          .replace(/\\%/g, "%"),
      };
    }
    run += char;
  }
  return { run, input: "" };
}

/** Jobs in /etc/crontab or a /etc/cron.d file, which name a user. */
export function parseSystemJobs(text: string): SystemJob[] {
  const out: SystemJob[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (!line.trim()) continue;
    let enabled = true;
    let body = line;
    if (line.trimStart().startsWith("#")) {
      enabled = false;
      body = line.trimStart().replace(/^#\s?/, "");
    }
    if (ENV_RE.test(body) || body.trimStart().startsWith("#")) continue;
    const { schedule, rest } = split(body, 6);
    if (!isValidSchedule(schedule)) continue;
    const match = rest.match(/^(\S+)\s+(.+)$/);
    if (!match) continue;
    out.push({ enabled, schedule, user: match[1], command: match[2] });
  }
  return out;
}

/** Throws when a /etc/cron.d file has a line cron would not understand. */
export function checkSystemFile(text: string): void {
  text.split("\n").forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith("#") || ENV_RE.test(line)) return;
    const { schedule, rest } = split(line, 6);
    if (!isValidSchedule(schedule) || !/^\S+\s+\S/.test(rest)) {
      throw new HostScriptError(
        `Line ${index + 1} is not a valid job. Use: schedule user command`,
      );
    }
  });
}
