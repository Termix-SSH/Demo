import { useEffect, useState, type RefObject } from "react";

/** Longest the page waits on a slow part before showing anyway. */
export const SETTLE_CAP_MS = 6000;

/** True once every part from another plugin in the box has painted. */
export function partsShown(box: Element): boolean {
  return [...box.querySelectorAll("[data-foreign-id]")].every((part) =>
    part.hasAttribute("data-foreign-shown"),
  );
}

/** True after ms, counted from the first render. */
export function useElapsed(ms: number): boolean {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(timer);
  }, [ms]);
  return done;
}

/**
 * Calls onSettled once the page has its data and every part from other
 * plugins in the box has painted, or after SETTLE_CAP_MS.
 */
export function useSettled(
  box: RefObject<HTMLElement | null>,
  ready: boolean,
  onSettled: (() => void) | undefined,
): void {
  const capped = useElapsed(SETTLE_CAP_MS);
  useEffect(() => {
    if (onSettled && capped) onSettled();
  }, [capped, onSettled]);

  useEffect(() => {
    const element = box.current;
    if (!onSettled || !ready || !element) return;
    let frame = 0;
    const check = () => {
      cancelAnimationFrame(frame);
      // A frame later, so placeholders added in the same pass are seen.
      frame = requestAnimationFrame(() => {
        if (partsShown(element)) onSettled();
      });
    };
    const observer = new MutationObserver(check);
    observer.observe(element, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-foreign-shown", "data-foreign-id"],
    });
    check();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [box, ready, onSettled]);
}
