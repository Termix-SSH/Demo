import type { KeyCombo } from "@termix-ssh/plugin-sdk/frontend";

/**
 * tmux style prefix: press the prefix, then one key for a command. The
 * prefix is a keybinding action, so people can rebind it, and terminals hand
 * a bound key on to it instead of sending it to the server.
 */

export const PREFIX_ACTION = "terminal-layout.prefix";

/** How long the prefix waits for the next key. */
export const PREFIX_TIMEOUT_MS = 2000;

export type NavDirection = "left" | "right" | "up" | "down";

export type PrefixCommand =
  | { kind: "split"; edge: "right" | "bottom" }
  | { kind: "focus"; direction: NavDirection }
  | { kind: "zoom" }
  | { kind: "closePane" }
  | { kind: "equalize" }
  | { kind: "palette" }
  | { kind: "nextTab" }
  | { kind: "prevTab" }
  | { kind: "lastTab" }
  | { kind: "jump"; index: number }
  | { kind: "rename" }
  | { kind: "statusBar" }
  | { kind: "help" };

export function defaultPrefixCombo(): KeyCombo {
  return {
    key: "Space",
    isCode: true,
    ctrl: true,
    alt: false,
    shift: false,
    meta: false,
  };
}

/** Plain Ctrl+Space, the key the layout handles until it is rebound. */
export function isDefaultPrefix(event: KeyboardEvent): boolean {
  return (
    event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    !event.metaKey &&
    event.code === "Space"
  );
}

const ARROWS: Record<string, NavDirection> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

const VIM: Record<string, NavDirection> = {
  h: "left",
  l: "right",
  k: "up",
  j: "down",
};

const MODIFIER_KEYS = new Set(["Control", "Shift", "Alt", "Meta", "AltGraph"]);

/** A key pressed on its own, like Shift on the way to %. Not a command. */
export function isModifierOnly(event: Pick<KeyboardEvent, "key">): boolean {
  return MODIFIER_KEYS.has(event.key);
}

/** The command a key after the prefix runs, or null for an unknown key. */
export function commandForKey(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "altKey">,
): PrefixCommand | null {
  if (event.ctrlKey || event.metaKey || event.altKey) {
    return ARROWS[event.key]
      ? { kind: "focus", direction: ARROWS[event.key] }
      : null;
  }
  const key = event.key;
  if (ARROWS[key]) return { kind: "focus", direction: ARROWS[key] };
  if (VIM[key]) return { kind: "focus", direction: VIM[key] };
  if (/^[1-9]$/.test(key)) return { kind: "jump", index: Number(key) - 1 };
  switch (key) {
    case "%":
    case "|":
      return { kind: "split", edge: "right" };
    case '"':
    case "-":
      return { kind: "split", edge: "bottom" };
    case "z":
      return { kind: "zoom" };
    case "x":
      return { kind: "closePane" };
    case "=":
      return { kind: "equalize" };
    case "c":
    case ":":
    case " ":
      return { kind: "palette" };
    case "n":
      return { kind: "nextTab" };
    case "p":
      return { kind: "prevTab" };
    case "Tab":
      return { kind: "lastTab" };
    case ",":
      return { kind: "rename" };
    case "s":
      return { kind: "statusBar" };
    case "?":
      return { kind: "help" };
    default:
      return null;
  }
}

/** The key list shown in the help panel and the docs, in display order. */
export const PREFIX_KEY_HELP: { keys: string; labelKey: string }[] = [
  { keys: "% |", labelKey: "terminalLayout.keys.splitRight" },
  { keys: '" -', labelKey: "terminalLayout.keys.splitDown" },
  { keys: "← ↑ → ↓ / h j k l", labelKey: "terminalLayout.keys.focus" },
  { keys: "z", labelKey: "terminalLayout.keys.zoom" },
  { keys: "x", labelKey: "terminalLayout.keys.closePane" },
  { keys: "=", labelKey: "terminalLayout.keys.equalize" },
  { keys: "c : Space", labelKey: "terminalLayout.keys.palette" },
  { keys: "n p", labelKey: "terminalLayout.keys.nextPrev" },
  { keys: "Tab", labelKey: "terminalLayout.keys.lastTab" },
  { keys: "1-9", labelKey: "terminalLayout.keys.jump" },
  { keys: ",", labelKey: "terminalLayout.keys.rename" },
  { keys: "s", labelKey: "terminalLayout.keys.statusBar" },
  { keys: "?", labelKey: "terminalLayout.keys.help" },
];

type Listener = () => void;
type Runner = (command: PrefixCommand) => void;

/**
 * The armed state, shared by the keybinding action (which can fire from a
 * terminal frame) and the layout (which draws it and runs the commands).
 */
class PrefixStore {
  private armed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private listeners = new Set<Listener>();
  private runner: Runner | null = null;
  private sink: HTMLElement | null = null;
  private returnFocus: HTMLElement | null = null;

  isArmed = () => this.armed;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Set by the layout while it is on screen. Nothing arms without it. */
  setRunner(runner: Runner | null) {
    this.runner = runner;
    if (!runner) this.cancel();
  }

  /**
   * Somewhere in the page to hold focus while armed, so the next key comes
   * here and not to a terminal frame.
   */
  setSink(element: HTMLElement | null) {
    this.sink = element;
  }

  arm() {
    if (!this.runner) return false;
    if (!this.armed) {
      const active = document.activeElement;
      this.returnFocus =
        active instanceof HTMLElement && active !== document.body
          ? active
          : null;
      this.sink?.focus({ preventScroll: true });
      this.set(true);
    }
    this.restartTimer();
    return true;
  }

  /** Disarms and puts focus back where it was. */
  cancel() {
    if (!this.armed) return;
    this.set(false);
    this.restoreFocus();
  }

  /** Runs a command for a key pressed while armed. */
  press(command: PrefixCommand | null) {
    if (!this.armed) return;
    this.set(false);
    // Focus goes back first, so a command that moves it wins.
    this.restoreFocus();
    if (command) this.runner?.(command);
  }

  private restoreFocus() {
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected && document.activeElement === this.sink) {
      target.focus({ preventScroll: true });
    }
  }

  private restartTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.cancel(), PREFIX_TIMEOUT_MS);
  }

  private set(armed: boolean) {
    if (!armed && this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.armed === armed) return;
    this.armed = armed;
    for (const listener of this.listeners) listener();
  }
}

export const prefix = new PrefixStore();

/**
 * Handles keys in the page: the default prefix until it is rebound, and the
 * key after the prefix. Returns the remover.
 */
export function installPrefixKeys(isOverridden: () => boolean): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest("[data-keybinding-recorder]")
    ) {
      return;
    }
    if (prefix.isArmed()) {
      if (isModifierOnly(event) || event.isComposing) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (isDefaultPrefix(event)) return;
      if (event.key === "Escape") {
        prefix.cancel();
        return;
      }
      prefix.press(commandForKey(event));
      return;
    }
    if (!isOverridden() && isDefaultPrefix(event) && prefix.arm()) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  };
  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
