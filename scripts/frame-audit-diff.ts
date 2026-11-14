/**
 * Compares two frame-audit reports, a baseline and a current run, view by
 * view: views that went missing, labels (headings, tabs, cards) that were
 * there before and are gone now, and problems only the current run has.
 *
 *   npx tsx scripts/frame-audit-diff.ts <baseline/report.json> <current/report.json> [out.md]
 */
import { readFileSync, writeFileSync } from "node:fs";

interface ViewRecord {
  section: string;
  name: string;
  shot: string;
  console: string[];
  refused: string[];
  emptyReads: string[];
  notReady: string[];
  zeroFrames: string[];
  blankFrames: string[];
  labels: string[];
}

const [basePath, currentPath, outPath] = process.argv.slice(2);
if (!basePath || !currentPath) {
  console.error(
    "Usage: tsx scripts/frame-audit-diff.ts <baseline.json> <current.json> [out.md]",
  );
  process.exit(1);
}

const load = (path: string) =>
  JSON.parse(readFileSync(path, "utf8")) as ViewRecord[];
// Rail and palette names can carry a badge count or hint; key on the name.
const key = (view: ViewRecord) =>
  `${view.section} | ${view.name.replace(/\s*\d+$/, "").split("\n")[0]}`;

const base = new Map(load(basePath).map((view) => [key(view), view]));
const current = new Map(load(currentPath).map((view) => [key(view), view]));

// Labels that show everywhere (rail, header) say nothing about a view.
const everywhere = (views: Map<string, ViewRecord>) => {
  const counts = new Map<string, number>();
  for (const view of views.values()) {
    for (const label of new Set(view.labels)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
  }
  return new Set(
    [...counts].filter(([, n]) => n > views.size * 0.6).map(([label]) => label),
  );
};
const common = new Set([...everywhere(base), ...everywhere(current)]);

const lines: string[] = ["# Frame audit diff", ""];
const missingViews = [...base.keys()].filter((name) => !current.has(name));
lines.push(`Views in baseline: ${base.size}. Views now: ${current.size}.`, "");
if (missingViews.length) {
  lines.push("## Views missing now", "");
  for (const name of missingViews) lines.push(`- ${name}`);
  lines.push("");
}

lines.push("## Per view", "");
let gone = 0;
for (const [name, now] of current) {
  const before = base.get(name);
  const lost = before
    ? before.labels.filter(
        (label) => !common.has(label) && !now.labels.includes(label),
      )
    : [];
  const problems = [
    ...now.console.map((p) => `console: ${p}`),
    ...now.refused.map((p) => `refused: ${p}`),
    ...now.emptyReads.map((p) => `empty read: ${p}`),
    ...now.notReady.map((p) => `not ready: ${p}`),
    ...now.zeroFrames.map((p) => `0 px frame: ${p}`),
    ...now.blankFrames.map((p) => `blank frame: ${p}`),
  ];
  if (!lost.length && !problems.length) continue;
  gone += lost.length;
  lines.push(`### ${name}`, "", `Shot: ${now.shot}`, "");
  if (!before) lines.push("- not in the baseline");
  for (const label of lost) lines.push(`- gone since baseline: ${label}`);
  for (const problem of [...new Set(problems)]) {
    lines.push(`- ${problem.slice(0, 240)}`);
  }
  lines.push("");
}
lines.splice(3, 0, `Labels gone since baseline: ${gone}.`, "");

const text = lines.join("\n");
if (outPath) writeFileSync(outPath, text);
else console.log(text);
