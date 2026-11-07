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

const KEY_CODES: Record<number, string> = {
  8: "Backspace",
  9: "Tab",
  13: "Enter",
  16: "Shift",
  17: "Control",
  18: "Alt",
  19: "Pause",
  20: "CapsLock",
  27: "Escape",
  32: "Space",
  33: "PageUp",
  34: "PageDown",
  35: "End",
  36: "Home",
  37: "ArrowLeft",
  38: "ArrowUp",
  39: "ArrowRight",
  40: "ArrowDown",
  44: "PrintScreen",
  45: "Insert",
  46: "Delete",
  91: "MetaLeft",
  92: "MetaRight",
  93: "ContextMenu",
  106: "NumpadMultiply",
  107: "NumpadAdd",
  109: "NumpadSubtract",
  110: "NumpadDecimal",
  111: "NumpadDivide",
  144: "NumLock",
  145: "ScrollLock",
  186: "Semicolon",
  187: "Equal",
  188: "Comma",
  189: "Minus",
  190: "Period",
  191: "Slash",
  192: "Backquote",
  219: "BracketLeft",
  220: "Backslash",
  221: "BracketRight",
  222: "Quote",
};

/**
 * The physical key name for a key event. Some embedded browsers (like the
 * one in JetBrains IDEs) leave `code` empty, so fall back to `keyCode`.
 */
export function keyName(event: {
  code: string;
  keyCode: number;
  location: number;
}): string {
  if (event.code && event.code !== "Unidentified") return event.code;
  const value = event.keyCode;
  if (value >= 65 && value <= 90) return `Key${String.fromCharCode(value)}`;
  if (value >= 48 && value <= 57) return `Digit${value - 48}`;
  if (value >= 96 && value <= 105) return `Numpad${value - 96}`;
  if (value >= 112 && value <= 123) return `F${value - 111}`;
  const name = KEY_CODES[value];
  if (!name) return "";
  if (name === "Shift" || name === "Control" || name === "Alt") {
    return `${name}${event.location === 2 ? "Right" : "Left"}`;
  }
  if (name === "Enter" && event.location === 3) return "NumpadEnter";
  return name;
}
