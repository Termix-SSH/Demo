import type { InputEvent } from "../shared/types";
import { SHORTCUTS } from "../shared/types";

/** Where a pointer is on an element, as 0 to 1. */
export function pointerPosition(
  element: HTMLElement,
  event: { clientX: number; clientY: number },
): { x: number; y: number } {
  const box = element.getBoundingClientRect();
  const x = box.width ? (event.clientX - box.left) / box.width : 0;
  const y = box.height ? (event.clientY - box.top) / box.height : 0;
  return {
    x: Math.min(1, Math.max(0, x)),
    y: Math.min(1, Math.max(0, y)),
  };
}

/** The key events for a shortcut: all down in order, then all up in reverse. */
export function shortcutEvents(name: string): InputEvent[] {
  const keys = SHORTCUTS[name] ?? [];
  return [
    ...keys.map((code): InputEvent => ({ t: "key", code, down: true })),
    ...[...keys]
      .reverse()
      .map((code): InputEvent => ({ t: "key", code, down: false })),
  ];
}

export const BUTTONS: Record<number, 0 | 1 | 2> = { 0: 0, 1: 1, 2: 2 };
