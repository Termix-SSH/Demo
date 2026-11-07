import { useCallback, useEffect, useState, type RefObject } from "react";

/** Full screen for an element, plus a way out that does not need Esc. */
export function useFullscreen(
  target: RefObject<HTMLElement | null>,
): [boolean, () => void] {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const update = () =>
      setActive(
        !!target.current && document.fullscreenElement === target.current,
      );
    document.addEventListener("fullscreenchange", update);
    return () => document.removeEventListener("fullscreenchange", update);
  }, [target]);

  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void target.current?.requestFullscreen?.();
  }, [target]);

  return [active, toggle];
}
