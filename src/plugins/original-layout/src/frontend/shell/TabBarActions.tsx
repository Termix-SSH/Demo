import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Holds plugin buttons in the tab bar. A framed button sits at zero width
 * until it loads, so only children with width get a box.
 */
export function TabBarActions({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    const mark = () => {
      for (const child of Array.from(box.children)) {
        child.toggleAttribute("data-bar-shown", child.clientWidth > 0);
      }
    };
    const sizes =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(mark);
    const watch = () => {
      if (sizes) {
        sizes.disconnect();
        for (const child of Array.from(box.children)) sizes.observe(child);
      }
      mark();
    };
    watch();
    const list = new MutationObserver(watch);
    list.observe(box, { childList: true });
    return () => {
      sizes?.disconnect();
      list.disconnect();
    };
  }, []);

  return (
    <div
      ref={ref}
      data-tabbar-actions=""
      className="flex shrink-0 items-center gap-2 empty:hidden [&>[data-bar-shown]]:!h-[30px] [&>[data-bar-shown]]:!w-[30px] [&>[data-bar-shown]]:overflow-hidden [&>[data-bar-shown]]:rounded-[0.5rem] [&>[data-bar-shown]]:border [&>[data-bar-shown]]:border-[color:var(--original-button-border,var(--input))] [&>[data-bar-shown]]:bg-[var(--original-button,var(--muted))]"
    >
      {children}
    </div>
  );
}
