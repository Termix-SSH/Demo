import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Holds plugin buttons in the tab bar. A framed button sits at zero width
 * until it loads, so only children with width get a divider.
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
      className="flex h-full shrink-0 [&>[data-bar-shown]]:border-r [&>[data-bar-shown]]:border-r-border"
    >
      {children}
    </div>
  );
}
