import type {
  PublicGroup,
  PublicMonitor,
  PublicPage,
  StatusNoteView,
} from "../shared/types.js";
import type { Entry } from "./engine.js";
import type { PageRow } from "./repository.js";
import type { RollupStore } from "./rollups.js";

const BAR_DAYS = 90;
const RECENT_NOTE_MS = 7 * 86_400_000;

function publicStatus(entry: Entry): PublicMonitor["status"] {
  switch (entry.state.status) {
    case "up":
      return "up";
    case "down":
      return "down";
    case "maintenance":
      return "maintenance";
    case "pending":
      // A retry is not an outage yet.
      return "up";
    default:
      return "unknown";
  }
}

/** Only names, states and percents. A target or an error text never leaves. */
export function buildPublicPage(
  page: PageRow,
  notes: StatusNoteView[],
  lookup: (key: string) => Entry | undefined,
  rollups: RollupStore,
  now: number,
): PublicPage {
  const groups: PublicGroup[] = page.groups
    .map((group) => ({
      name: group.name,
      monitors: group.monitorKeys
        .map(lookup)
        .filter((entry): entry is Entry => !!entry)
        .map((entry): PublicMonitor => {
          const monitor: PublicMonitor = {
            name: entry.row.name,
            status: publicStatus(entry),
            uptime: rollups.uptime(entry.row.id, now).month,
            days: rollups.days(entry.row.id, BAR_DAYS, now),
          };
          if (page.showLatency) monitor.latencyMs = entry.state.latencyMs;
          return monitor;
        }),
    }))
    .filter((group) => group.monitors.length > 0);

  const all = groups.flatMap((group) => group.monitors);
  const down = all.filter((monitor) => monitor.status === "down").length;
  let overall: PublicPage["overall"] = "operational";
  if (all.length === 0) overall = "unknown";
  else if (down === all.length) overall = "outage";
  else if (down > 0) overall = "degraded";
  else if (all.some((monitor) => monitor.status === "maintenance")) {
    overall = "maintenance";
  }

  return {
    title: page.title,
    description: page.description,
    overall,
    updatedAt: now,
    groups,
    notes: notes
      .filter(
        (note) =>
          note.resolvedAt === null || now - note.resolvedAt < RECENT_NOTE_MS,
      )
      .map(({ title, body, level, createdAt, resolvedAt }) => ({
        title,
        body,
        level,
        createdAt,
        resolvedAt,
      })),
  };
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const OVERALL_TEXT: Record<PublicPage["overall"], string> = {
  operational: "All systems operational",
  degraded: "Some systems are down",
  outage: "All systems are down",
  maintenance: "Maintenance in progress",
  unknown: "No status yet",
};

const STATUS_TEXT: Record<PublicMonitor["status"], string> = {
  up: "Up",
  down: "Down",
  maintenance: "Maintenance",
  unknown: "Unknown",
};

function dayClass(value: number | null): string {
  if (value === null) return "none";
  if (value >= 99.9) return "good";
  if (value >= 95) return "warn";
  return "bad";
}

function renderMonitor(monitor: PublicMonitor): string {
  const bars = monitor.days
    .map((value, index) => {
      const ago = monitor.days.length - 1 - index;
      const when = ago === 0 ? "Today" : `${ago} days ago`;
      const text = value === null ? "no data" : `${value}%`;
      return `<i class="${dayClass(value)}" title="${when}: ${text}"></i>`;
    })
    .join("");
  const uptime = monitor.uptime === null ? "" : `${monitor.uptime}% | `;
  const latency =
    monitor.latencyMs === null || monitor.latencyMs === undefined
      ? ""
      : `${monitor.latencyMs} ms | `;
  return `<div class="row"><div class="line"><span class="name">${escape(monitor.name)}</span><span class="meta">${uptime}${latency}<b class="${monitor.status}">${STATUS_TEXT[monitor.status]}</b></span></div><div class="bars">${bars}</div></div>`;
}

function renderNote(note: PublicPage["notes"][number]): string {
  const when = new Date(note.createdAt).toISOString().slice(0, 16);
  const state = note.resolvedAt ? " | Resolved" : "";
  const body = note.body ? `<p>${escape(note.body)}</p>` : "";
  return `<div class="note ${note.level}"><strong>${escape(note.title)}</strong><small>${when.replace("T", " ")} UTC${state}</small>${body}</div>`;
}

const CSS = `
:root{--bg:#fff;--fg:#18181b;--muted:#71717a;--line:#e4e4e7;--good:#16a34a;--warn:#d97706;--bad:#dc2626;--none:#e4e4e7;--blue:#2563eb}
@media (prefers-color-scheme:dark){:root{--bg:#09090b;--fg:#fafafa;--muted:#a1a1aa;--line:#27272a;--none:#27272a}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
main{max-width:760px;margin:0 auto;padding:32px 16px}
h1{font-size:22px;margin:0}
.lead{color:var(--muted);margin:4px 0 0}
.overall{border:1px solid var(--line);border-left:4px solid var(--good);padding:12px 14px;margin:24px 0;font-weight:600}
.overall.degraded{border-left-color:var(--warn)}
.overall.outage{border-left-color:var(--bad)}
.overall.maintenance{border-left-color:var(--blue)}
.overall.unknown{border-left-color:var(--muted)}
h2{font-size:13px;color:var(--muted);font-weight:600;margin:24px 0 8px}
.group{border:1px solid var(--line)}
.row{padding:10px 12px}
.row+.row{border-top:1px solid var(--line)}
.line{display:flex;justify-content:space-between;gap:12px}
.name{font-weight:500;overflow-wrap:anywhere}
.meta{color:var(--muted);white-space:nowrap;font-size:12px}
.meta b{font-weight:600}
b.up{color:var(--good)}b.down{color:var(--bad)}b.maintenance{color:var(--blue)}b.unknown{color:var(--muted)}
.bars{display:flex;gap:1px;margin-top:8px;height:22px}
.bars i{flex:1;min-width:1px;background:var(--none)}
.bars i.good{background:var(--good)}.bars i.warn{background:var(--warn)}.bars i.bad{background:var(--bad)}
.note{border:1px solid var(--line);border-left:4px solid var(--blue);padding:10px 12px;margin-bottom:8px}
.note.warning{border-left-color:var(--warn)}.note.critical{border-left-color:var(--bad)}
.note small{display:block;color:var(--muted)}
.note p{margin:6px 0 0;white-space:pre-wrap;overflow-wrap:anywhere}
footer{color:var(--muted);font-size:12px;margin-top:24px}
`;

/** No script at all: the page refreshes itself and the CSP allows only its style. */
export function renderStatusPage(data: PublicPage, nonce: string): string {
  const groups = data.groups
    .map(
      (group) =>
        `${group.name ? `<h2>${escape(group.name)}</h2>` : ""}<section class="group">${group.monitors.map(renderMonitor).join("")}</section>`,
    )
    .join("");
  const notes = data.notes.map(renderNote).join("");
  const description = data.description
    ? `<p class="lead">${escape(data.description)}</p>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="refresh" content="60">
<meta name="robots" content="noindex">
<title>${escape(data.title)}</title>
<style nonce="${nonce}">${CSS}</style>
</head>
<body>
<main>
<h1>${escape(data.title)}</h1>
${description}
<div class="overall ${data.overall}">${OVERALL_TEXT[data.overall]}</div>
${notes}
${groups}
<footer>Last 90 days | Updated ${new Date(data.updatedAt).toISOString().slice(0, 16).replace("T", " ")} UTC</footer>
</main>
</body>
</html>`;
}

export const pageCsp = (nonce: string) =>
  `default-src 'none'; style-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;
