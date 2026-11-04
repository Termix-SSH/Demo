import { useCallback, useLayoutEffect, useRef, useState } from "react";

export interface EmbedNodes {
  nodeFor: (type: string) => HTMLDivElement;
  park: (type: string, node: HTMLDivElement) => void;
  show: (type: string) => void;
  /** Types whose element is in a tile or a section right now. */
  shown: ReadonlySet<string>;
  /** Types asked for so far; each gets one live session. */
  wanted: ReadonlySet<string>;
  parking: React.RefObject<HTMLDivElement | null>;
}

/**
 * One live element per embedded session. The session renders into it once
 * through a portal and the element moves between a tile, the full section
 * and a hidden parking spot, so a terminal never reconnects when the page
 * switches views.
 */
export function useEmbedNodes(): EmbedNodes {
  const nodes = useRef(new Map<string, HTMLDivElement>());
  const parking = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const [wanted, setWanted] = useState<Set<string>>(() => new Set());

  const nodeFor = useCallback((type: string) => {
    let node = nodes.current.get(type);
    if (!node) {
      node = document.createElement("div");
      node.className = "flex h-full min-h-0 w-full flex-col";
      nodes.current.set(type, node);
      parking.current?.appendChild(node);
    }
    return node;
  }, []);

  const show = useCallback((type: string) => {
    setWanted((prev) => (prev.has(type) ? prev : new Set(prev).add(type)));
    setShown((prev) => (prev.has(type) ? prev : new Set(prev).add(type)));
  }, []);

  const park = useCallback((type: string, node: HTMLDivElement) => {
    parking.current?.appendChild(node);
    setShown((prev) => {
      if (!prev.has(type)) return prev;
      const next = new Set(prev);
      next.delete(type);
      return next;
    });
  }, []);

  return { nodeFor, park, show, shown, wanted, parking };
}

/** Where an embedded session shows right now. */
export function EmbedSlot({
  type,
  embed,
}: {
  type: string;
  embed: EmbedNodes;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { nodeFor, park, show } = embed;
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    const node = nodeFor(type);
    host.appendChild(node);
    show(type);
    return () => {
      // Another slot may already hold it.
      if (node.parentElement === host) park(type, node);
    };
  }, [type, nodeFor, park, show]);
  return <div ref={ref} className="flex h-full min-h-0 w-full flex-col" />;
}
