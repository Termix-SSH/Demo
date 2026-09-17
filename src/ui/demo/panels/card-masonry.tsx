import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useMemo,
  useState,
} from "react";
import { PANEL } from "@/components/panel-layout";

/**
 * Gap-filling card columns, shared by the metric panels.
 *
 * The columns are dealt in JS rather than with CSS multi-column or a plain
 * grid, because both of those were wrong in opposite ways. Multi-column packs
 * tightly but rebalances its children on every layout pass, so a live tick made
 * the later cards hop between columns once a second. A plain grid is stable but
 * puts each row on a shared track, leaving every card as tall as the tallest in
 * its row. Dealing each card to a fixed column and letting that column stack
 * tight gives the gap-filling look with none of the movement: the assignment
 * depends only on the child order and the column count, so a re-render cannot
 * reshuffle it.
 */

/**
 * How many columns to pack into, per breakpoint, for each column preference.
 *
 * The count has to be a real number rather than a CSS class, because the cards
 * are dealt into columns in JS.
 */
const COLUMN_STEPS: Record<
  number,
  [base: number, md: number, lg: number, xl: number]
> = {
  1: [1, 1, 1, 1],
  2: [1, 2, 2, 2],
  3: [1, 2, 3, 3],
  4: [1, 2, 3, 4],
};

/** Tailwind's default breakpoints, which is what the COLUMN_STEPS tiers mean. */
const BREAKPOINTS = { md: 768, lg: 1024, xl: 1280 };

/** The tier that applies at a given width, for one preference's four steps. */
function pickColumnCount(
  steps: readonly [number, number, number, number],
): number {
  if (typeof window === "undefined") return steps[2];
  const w = window.innerWidth;
  if (w >= BREAKPOINTS.xl) return steps[3];
  if (w >= BREAKPOINTS.lg) return steps[2];
  if (w >= BREAKPOINTS.md) return steps[1];
  return steps[0];
}

/** Which of a preference's four column tiers applies at this viewport. */
function useColumnCount(columns: number): number {
  const steps = COLUMN_STEPS[columns] ?? COLUMN_STEPS[3];
  const [count, setCount] = useState(() => pickColumnCount(steps));

  useEffect(() => {
    const onResize = () => setCount(pickColumnCount(steps));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [steps]);

  return count;
}

/**
 * Children.toArray keys a fragment as one node rather than flattening it, and
 * a caller may well hand us a group of cards inside one. Unwrapping keeps a
 * fragment from dropping all of its cards into a single column.
 */
function flattenChildren(children: React.ReactNode): React.ReactNode[] {
  return Children.toArray(children).flatMap((child) =>
    isValidElement(child) && child.type === Fragment
      ? flattenChildren(
          (child.props as { children?: React.ReactNode }).children,
        )
      : [child],
  );
}

export function CardMasonry({
  columns,
  /** Force a single full-width column, e.g. when the cards hold wide tables. */
  stack = false,
  children,
}: {
  columns: number;
  stack?: boolean;
  children: React.ReactNode;
}) {
  const count = useColumnCount(columns);
  const items = useMemo(() => flattenChildren(children), [children]);

  const buckets = useMemo(() => {
    const next: React.ReactNode[][] = Array.from({ length: count }, () => []);
    items.forEach((child, i) => next[i % count].push(child));
    return next;
  }, [items, count]);

  if (stack || count === 1) {
    return <div className={`flex flex-col ${PANEL.gap}`}>{children}</div>;
  }

  return (
    <div className={`flex items-start ${PANEL.gap}`}>
      {buckets.map((bucket, i) => (
        <div key={i} className={`flex min-w-0 flex-1 flex-col ${PANEL.gap}`}>
          {bucket}
        </div>
      ))}
    </div>
  );
}
