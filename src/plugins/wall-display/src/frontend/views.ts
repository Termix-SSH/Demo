export const STATUS_TAB = "status-board";

export interface WallView {
  tabType: string;
  settingKey: string;
}

/** The order the views show in. Tab ids come from each plugin's manifest. */
export const WALL_VIEWS: WallView[] = [
  { tabType: "homepage", settingKey: "showHomepage" },
  { tabType: "uptime", settingKey: "showUptime" },
  { tabType: STATUS_TAB, settingKey: "showHostStatus" },
  { tabType: "network_graph", settingKey: "showTopology" },
];

export const DEFAULT_INTERVAL = 30;
const MIN_INTERVAL = 10;
const MAX_INTERVAL = 3600;

/** Views that are turned on and whose plugin is installed. */
export function activeViews(
  registered: ReadonlySet<string>,
  settings: Record<string, unknown>,
): WallView[] {
  return WALL_VIEWS.filter(
    (view) =>
      registered.has(view.tabType) && settings[view.settingKey] !== false,
  );
}

export function intervalSeconds(value: unknown): number {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds <= 0) return DEFAULT_INTERVAL;
  return Math.min(MAX_INTERVAL, Math.max(MIN_INTERVAL, Math.round(seconds)));
}

export function step(index: number, count: number, by: number): number {
  if (count <= 0) return 0;
  return (((index + by) % count) + count) % count;
}
