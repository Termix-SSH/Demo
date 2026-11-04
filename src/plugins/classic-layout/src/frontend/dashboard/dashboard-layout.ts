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
