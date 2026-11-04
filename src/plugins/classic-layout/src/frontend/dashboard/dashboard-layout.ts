/**
 * The dashboard layout as the user's saved UI preferences keep it, so it
 * follows them to every browser instead of living in one. Preferences hold
 * short strings, so each card is one "key|id|panel|order|height" line.
 */

export interface StoredSlot {
  key: string;
  id: string;
  panel: "main" | "side";
  order: number;
  height: number | null;
}

/** Plugin cards placed first on a dashboard nobody has arranged. */
export const AUTO_FIRST_CARDS = ["attention"];

export function encodeSlots(slots: StoredSlot[]): string[] {
  return slots
    .slice(0, 100)
    .map(
      (slot) =>
        `${slot.key}|${slot.id}|${slot.panel}|${slot.order}|${slot.height ?? ""}`,
    )
    .filter((line) => line.length <= 200);
}

export function decodeSlots(lines: unknown): StoredSlot[] | null {
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const slots: StoredSlot[] = [];
  for (const line of lines) {
    if (typeof line !== "string") return null;
    const [key, id, panel, order, height] = line.split("|");
    if (!key || !id || (panel !== "main" && panel !== "side")) return null;
    const orderValue = Number(order);
    if (!Number.isFinite(orderValue)) return null;
    slots.push({
      key,
      id,
      panel,
      order: orderValue,
      height: height ? Number(height) || null : null,
    });
  }
  return slots;
}

/**
 * The layout someone who never arranged their dashboard sees: the built in
 * cards, with any first cards a plugin offers moved to the top.
 */
export function autoSlots<T extends StoredSlot>(
  base: T[],
  registered: string[],
): T[] {
  const first = AUTO_FIRST_CARDS.filter((id) => registered.includes(id));
  if (first.length === 0) return base;
  const shifted = base.map((slot) =>
    slot.panel === "main"
      ? { ...slot, order: slot.order + first.length }
      : slot,
  );
  return [
    ...first.map(
      (id, order) =>
        ({ key: `${id}_auto`, id, panel: "main", order, height: null }) as T,
    ),
    ...shifted,
  ];
}

export function sameLayout(a: StoredSlot[], b: StoredSlot[]): boolean {
  return JSON.stringify(encodeSlots(a)) === JSON.stringify(encodeSlots(b));
}

/** A card on the dashboard's 12 column grid. */
export interface GridCard {
  key: string;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number | null;
  /** The add list's name for a card placed from one of its entries. */
  title?: string;
  config?: Record<string, unknown>;
}

const MAIN_WIDTH = 8;
/** Height given to old cards that filled the rest of their column. */
const FILL_HEIGHT = 360;

/**
 * One line per card, as preferences keep short strings:
 * "key|id|x|y|w|h|title|config" with title and config URI encoded.
 */
export function encodeGrid(cards: GridCard[]): string[] {
  return cards
    .slice(0, 100)
    .map((card) =>
      [
        card.key,
        card.id,
        card.x,
        Math.round(card.y),
        card.w,
        card.h ?? "",
        card.title ? encodeURIComponent(card.title) : "",
        card.config && Object.keys(card.config).length > 0
          ? encodeURIComponent(JSON.stringify(card.config))
          : "",
      ].join("|"),
    )
    .filter((line) => line.length <= 200);
}

export function decodeGrid(lines: unknown): GridCard[] | null {
  if (!Array.isArray(lines)) return null;
  const cards: GridCard[] = [];
  for (const line of lines) {
    if (typeof line !== "string") return null;
    const [key, id, x, y, w, h, title, config] = line.split("|");
    if (!key || !id) return null;
    const nums = [x, y, w].map(Number);
    if (nums.some((n) => !Number.isFinite(n))) return null;
    let parsed: Record<string, unknown> | undefined;
    if (config) {
      try {
        const value = JSON.parse(decodeURIComponent(config));
        if (value && typeof value === "object" && !Array.isArray(value))
          parsed = value as Record<string, unknown>;
      } catch {
        /* a broken config is dropped, the card stays */
      }
    }
    cards.push({
      key,
      id,
      x: nums[0],
      y: nums[1],
      w: nums[2],
      h: h ? Number(h) || null : null,
      ...(title ? { title: decodeURIComponent(title) } : {}),
      ...(parsed ? { config: parsed } : {}),
    });
  }
  return cards;
}

/**
 * Turns the old two column layout into grid cards: the main column on the
 * left two thirds, the side column on the right, in the same order.
 */
export function gridFromColumns(slots: StoredSlot[]): GridCard[] {
  const out: GridCard[] = [];
  for (const panel of ["main", "side"] as const) {
    let y = 0;
    for (const slot of slots
      .filter((entry) => entry.panel === panel)
      .sort((a, b) => a.order - b.order)) {
      const h = slot.height ?? FILL_HEIGHT;
      out.push({
        key: slot.key,
        id: slot.id,
        x: panel === "main" ? 0 : MAIN_WIDTH,
        y,
        w: panel === "main" ? MAIN_WIDTH : 12 - MAIN_WIDTH,
        h,
      });
      y += h;
    }
  }
  return out;
}

export function sameGrid(a: GridCard[], b: GridCard[]): boolean {
  return JSON.stringify(encodeGrid(a)) === JSON.stringify(encodeGrid(b));
}

/**
 * The grid someone who never arranged their dashboard sees. Strips across
 * the top, then rows of a wide and a narrow card that end on the same line.
 * Plugin first cards (Needs attention) get a row of their own with Quick
 * actions beside them. `room` is the height of the view: the last row grows
 * to fill it, so the dashboard reaches the bottom of the screen.
 */
export function defaultGrid(registered: string[], room = 0): GridCard[] {
  const first = AUTO_FIRST_CARDS.filter((id) => registered.includes(id));
  const cards: GridCard[] = [
    { key: "stats_bar_0", id: "stats_bar", x: 0, y: 0, w: 12, h: 76 },
    { key: "counters_bar_0", id: "counters_bar", x: 0, y: 76, w: 12, h: 52 },
  ];
  let y = 128;
  if (first.length > 0) {
    cards.push(
      { key: `${first[0]}_auto`, id: first[0], x: 0, y, w: 8, h: 260 },
      { key: "quick_actions_0", id: "quick_actions", x: 8, y, w: 4, h: 260 },
    );
    y += 260;
    for (const id of first.slice(1)) {
      cards.push({ key: `${id}_auto`, id, x: 0, y, w: 12, h: 260 });
      y += 260;
    }
    const h = Math.max(420, room - y);
    cards.push(
      { key: "host_status_0", id: "host_status", x: 0, y, w: 8, h },
      { key: "recent_activity_0", id: "recent_activity", x: 8, y, w: 4, h },
    );
    return cards;
  }
  const h = Math.max(440, room - y);
  cards.push(
    { key: "host_status_0", id: "host_status", x: 0, y, w: 8, h },
    { key: "quick_actions_0", id: "quick_actions", x: 8, y, w: 4, h: 180 },
    {
      key: "recent_activity_0",
      id: "recent_activity",
      x: 8,
      y: y + 180,
      w: 4,
      h: h - 180,
    },
  );
  return cards;
}
