import type { TileSlot } from "@termix-ssh/plugin-sdk/ui";
import type { Catalog, CatalogAction } from "../api";

/**
 * What a host page tile shows, from its id: "signal:<id>", "action:<id>",
 * "group:<pluginId>", "resource:<id>", "session:<tab type>",
 * "section:<id>", "plugin:<slot action id>", or one of the fixed ones.
 */
export type TileRef =
  | { kind: "signal"; id: string }
  | { kind: "action"; id: string }
  | { kind: "group"; id: string }
  | { kind: "resource"; id: string }
  | { kind: "session"; id: string }
  | { kind: "section"; id: string }
  | { kind: "plugin"; id: string }
  | { kind: "runs" }
  | { kind: "actions" }
  | { kind: "counts" };

const PREFIXED = [
  "signal",
  "action",
  "group",
  "resource",
  "session",
  "section",
  "plugin",
] as const;
const FIXED = ["runs", "actions", "counts"] as const;

export function parseTile(id: string): TileRef | null {
  if ((FIXED as readonly string[]).includes(id))
    return { kind: id as (typeof FIXED)[number] };
  const at = id.indexOf(":");
  if (at <= 0) return null;
  const kind = id.slice(0, at);
  const rest = id.slice(at + 1);
  if (!rest || !(PREFIXED as readonly string[]).includes(kind)) return null;
  return { kind: kind as (typeof PREFIXED)[number], id: rest };
}

/** What can go on one host's page right now. */
export interface HostTileSources {
  catalog: Catalog | null;
  /** Catalog actions that apply to this host. */
  actions: CatalogAction[];
  /** Signal ids with a reading for this host. */
  signals: string[];
  /** Tab types of sessions the host can open inside the page. */
  sessions: string[];
  sections: string[];
  plugins: string[];
}

/** Whether a tile has anything to show on this host. */
export function tileAvailable(id: string, sources: HostTileSources): boolean {
  const ref = parseTile(id);
  if (!ref) return false;
  switch (ref.kind) {
    case "runs":
    case "actions":
      return true;
    case "counts":
      return resourcesFor(sources).length > 0;
    case "signal":
      return sources.signals.includes(ref.id);
    case "action":
      return sources.actions.some((action) => action.id === ref.id);
    case "group":
      return sources.actions.some((action) => action.pluginId === ref.id);
    case "resource":
      return resourcesFor(sources).some((resource) => resource.id === ref.id);
    case "session":
      return sources.sessions.includes(ref.id);
    case "section":
      return sources.sections.includes(ref.id);
    case "plugin":
      return sources.plugins.includes(ref.id);
  }
}

export function resourcesFor(sources: HostTileSources) {
  const ids = new Set(sources.actions.map((action) => action.id));
  return (sources.catalog?.resources ?? []).filter((resource) =>
    ids.has(resource.list),
  );
}

/** Actions a tile can run in one click: nothing to fill in, not destructive. */
export function quickActions(actions: CatalogAction[]): CatalogAction[] {
  return actions.filter(
    (action) =>
      action.available &&
      action.scope === "host" &&
      action.risk !== "destructive" &&
      action.inputs.every((field) => !field.required),
  );
}

/**
 * The page a host gets before anyone arranged it: status across the top, the
 * terminal, plugin tiles such as metrics, counts, a few quick actions and
 * the recent runs.
 */
export function defaultHostTiles(sources: HostTileSources): TileSlot[] {
  const rows: { id: string; w: number; h: number }[] = [];
  for (const id of sources.signals.slice(0, 6))
    rows.push({ id: `signal:${id}`, w: 2, h: 110 });
  const first = sources.sessions[0];
  if (first) rows.push({ id: `session:${first}`, w: 8, h: 380 });
  rows.push({ id: "runs", w: first ? 4 : 6, h: first ? 380 : 260 });
  for (const id of sources.plugins.slice(0, 4))
    rows.push({ id: `plugin:${id}`, w: 6, h: 260 });
  if (resourcesFor(sources).length > 0)
    rows.push({ id: "counts", w: 6, h: 140 });
  for (const id of sources.sections)
    rows.push({ id: `section:${id}`, w: 6, h: 240 });
  const quick = quickActions(sources.actions).slice(0, 4);
  for (const action of quick)
    rows.push({ id: `action:${action.id}`, w: 3, h: 170 });
  const actions = { id: "actions", w: 12, h: 360 };

  // The grid pulls tiles up, so place them the same way. When the two halves
  // end at different heights, the last plugin tile on the short side grows to
  // close the gap above the full width actions tile.
  const place = () => {
    const sky = new Array<number>(12).fill(0);
    const out: TileSlot[] = [];
    let x = 0;
    for (const tile of rows) {
      if (x + tile.w > 12) x = 0;
      const y = Math.max(...sky.slice(x, x + tile.w));
      out.push({ id: tile.id, x, y, w: tile.w, h: tile.h });
      for (let c = x; c < x + tile.w; c++) sky[c] = y + tile.h;
      x += tile.w;
    }
    return { out, sky };
  };
  let { out, sky } = place();
  const left = Math.max(...sky.slice(0, 6));
  const right = Math.max(...sky.slice(6));
  if (left !== right) {
    const shortSide =
      left < right
        ? (s: TileSlot) => s.x + s.w <= 6
        : (s: TileSlot) => s.x >= 6;
    const grow = [...out]
      .reverse()
      .find((s) => s.id.startsWith("plugin:") && shortSide(s));
    if (grow) {
      const row = rows.find((r) => r.id === grow.id)!;
      row.h += Math.abs(left - right);
      ({ out, sky } = place());
    }
  }
  out.push({ ...actions, x: 0, y: Math.max(...sky) });
  return out;
}

/** The saved tiles that apply to this host, so the grid settles around the rest. */
export function tilesForHost(
  saved: TileSlot[],
  sources: HostTileSources,
): TileSlot[] {
  return saved.filter((slot) => tileAvailable(slot.id, sources));
}

/**
 * Writes back a host's edited tiles onto the shared layout, keeping tiles
 * that only other hosts have.
 */
export function mergeHostTiles(
  saved: TileSlot[],
  edited: TileSlot[],
  sources: HostTileSources,
): TileSlot[] {
  const hidden = saved.filter((slot) => !tileAvailable(slot.id, sources));
  return [...edited, ...hidden];
}
