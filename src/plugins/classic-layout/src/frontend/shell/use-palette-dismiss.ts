import { useCallback, useEffect, useRef } from "react";

/**
 * Closes the command palette on Escape while it is open, and puts focus back
 * where it was before it opened (usually a terminal) once it is dismissed, so
 * typing carries on without a click.
 *
 * Returns handleAction, which runs a picked item and closes the palette. A
 * picked item may move focus itself (opening a tab), so focus is left to it.
 */
export function usePaletteDismiss(
  isOpen: boolean,
  setIsOpen: (isOpen: boolean) => void,
): (action: () => void) => void {
  const leaveFocusRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setIsOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isOpen, setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;
    leaveFocusRef.current = false;
    const previous = document.activeElement;
    return () => {
      if (leaveFocusRef.current) return;
      if (!(previous instanceof HTMLElement) || !previous.isConnected) return;
      // Something else took focus on close; do not steal it back.
      const current = document.activeElement;
      if (current && current !== document.body) return;
      previous.focus({ preventScroll: true });
    };
  }, [isOpen]);

  return useCallback(
    (action: () => void) => {
      leaveFocusRef.current = true;
      action();
      setIsOpen(false);
    },
    [setIsOpen],
  );
}
