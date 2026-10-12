import type { TerminalBehavior } from "../../shared/terminal-settings";

type WheelKeys = Pick<
  WheelEvent,
  "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

/** What a wheel event over the terminal does: zoom, fast scroll or a normal scroll. */
export function terminalWheelAction(
  ev: WheelKeys,
  cfg: Pick<TerminalBehavior, "wheelZoom" | "fastScrollModifier">,
): "zoom" | "fast" | "default" {
  if ((ev.ctrlKey || ev.metaKey) && cfg.wheelZoom !== false) return "zoom";
  const mod = cfg.fastScrollModifier;
  const modHeld =
    (mod === "alt" && ev.altKey) ||
    (mod === "ctrl" && ev.ctrlKey) ||
    (mod === "shift" && ev.shiftKey);
  return modHeld ? "fast" : "default";
}

type WheelBuffer = { type: "normal" | "alternate"; baseY: number };

/**
 * A plain wheel on a normal buffer with nothing scrolled off yet. xterm turns
 * that into an arrow key, which walks shell history, so it is dropped. The
 * alternate screen keeps the arrow keys: that is how less and vim scroll.
 */
export function wheelHasNothingToScroll(buffer: WheelBuffer): boolean {
  return buffer.type === "normal" && buffer.baseY === 0;
}
