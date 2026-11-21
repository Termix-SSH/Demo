import type { NavDirection } from "../shell/prefix-keys";

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * The pane next to `from` in a direction: the closest one that lies that way
 * and overlaps it on the other axis. Null at the edge.
 */
export function neighborPane(
  rects: Record<string, Rect>,
  from: string,
  direction: NavDirection,
): string | null {
  const origin = rects[from];
  if (!origin) return null;
  const horizontal = direction === "left" || direction === "right";
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const [id, rect] of Object.entries(rects)) {
    if (id === from) continue;
    const ahead =
      direction === "left"
        ? rect.right <= origin.left + 1
        : direction === "right"
          ? rect.left >= origin.right - 1
          : direction === "up"
            ? rect.bottom <= origin.top + 1
            : rect.top >= origin.bottom - 1;
    if (!ahead) continue;
    const overlaps = horizontal
      ? rect.top < origin.bottom && rect.bottom > origin.top
      : rect.left < origin.right && rect.right > origin.left;
    if (!overlaps) continue;
    const distance =
      direction === "left"
        ? origin.left - rect.right
        : direction === "right"
          ? rect.left - origin.right
          : direction === "up"
            ? origin.top - rect.bottom
            : rect.top - origin.bottom;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = id;
    }
  }
  return best;
}

/** The on-screen rects of every pane in a split view. */
export function paneRects(splitTabId: string): Record<string, Rect> {
  const view = document.querySelector(
    `[data-split-view="${CSS.escape(splitTabId)}"]`,
  );
  const rects: Record<string, Rect> = {};
  view?.querySelectorAll<HTMLElement>("[data-split-pane-id]").forEach((el) => {
    const id = el.dataset.splitPaneId;
    if (id) rects[id] = el.getBoundingClientRect();
  });
  return rects;
}
