import {
  appendTile,
  sanitizeTiles,
  type TileSlot,
} from "@termix-ssh/plugin-sdk/ui";
import type { HomepageLayoutData, HomepageLayoutEntry } from "./types.js";

/** Canvas width that fills all 12 columns when an old layout is moved over. */
const CANVAS_WIDTH = 1200;
const COLUMN_PX = CANVAS_WIDTH / 12;
/** A folder was a box behind other widgets. On the grid it is a heading. */
export const FOLDER_HEIGHT = 36;

export function columnsFor(pixels: number): number {
  return Math.max(2, Math.min(12, Math.round(pixels / COLUMN_PX)));
}

export function isGridLayout(layout: HomepageLayoutData | null | undefined) {
  return layout?.version === 2;
}

/** Turns free canvas positions in pixels into columns, top row first. */
export function gridFromCanvas(
  entries: HomepageLayoutEntry[],
  isFolder: (itemId: number) => boolean,
): TileSlot[] {
  if (entries.length === 0) return [];
  const left = Math.min(...entries.map((entry) => entry.x));
  const top = Math.min(...entries.map((entry) => entry.y));
  const right = Math.max(...entries.map((entry) => entry.x + entry.w));
  const scale = 12 / Math.max(right - left, CANVAS_WIDTH);
  const ordered = [...entries].sort((a, b) => a.y - b.y || a.x - b.x);
  return ordered.map((entry) => {
    const w = Math.max(2, Math.min(12, Math.round(entry.w * scale)));
    return {
      id: String(entry.itemId),
      x: Math.min(12 - w, Math.round((entry.x - left) * scale)),
      y: entry.y - top,
      w,
      h: isFolder(entry.itemId) ? FOLDER_HEIGHT : (entry.h ?? null),
    };
  });
}

/** The saved slots for these items. New items go at the bottom. */
export function slotsForItems(
  layout: HomepageLayoutData | null | undefined,
  itemIds: number[],
  sizeOf: (itemId: number) => { w: number; h: number },
  isFolder: (itemId: number) => boolean,
): TileSlot[] {
  const entries = layout?.entries ?? [];
  const known = new Set(itemIds);
  const saved = entries.filter((entry) => known.has(entry.itemId));
  let slots = isGridLayout(layout)
    ? sanitizeTiles(
        saved.map((entry) => ({ ...entry, id: String(entry.itemId) })),
      )
    : gridFromCanvas(saved, isFolder);
  for (const id of itemIds) {
    const size = sizeOf(id);
    slots = appendTile(slots, {
      id: String(id),
      w: columnsFor(size.w),
      h: size.h,
    });
  }
  return slots;
}

export function layoutFromSlots(slots: TileSlot[]): HomepageLayoutData {
  return {
    version: 2,
    entries: slots.map((slot) => ({
      itemId: Number(slot.id),
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h ?? null,
    })),
  };
}
