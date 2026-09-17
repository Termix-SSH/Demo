import { useCallback, useEffect, useState } from "react";

/**
 * Drag-to-rearrange lock for a sidebar tree, kept per device in localStorage
 * rather than in the sidebar-preferences blob.
 *
 * It deliberately does not live in HostSidebarPreferences or
 * CredentialSidebarPreferences. Those are reloaded on every mount and the
 * result replaces local state wholesale, so a value they have never stored
 * gets clobbered back to its default as soon as the load resolves. That made
 * the toggle look like it did nothing.
 *
 * Locked is the default, so a fresh device never drags by accident.
 */
export function useArrangeLock(storageKey: string) {
  const syncEvent = `${storageKey}:changed`;

  const read = useCallback(() => {
    try {
      return localStorage.getItem(storageKey) === "false";
    } catch {
      return false;
    }
  }, [storageKey]);

  const [unlocked, setUnlocked] = useState(read);

  useEffect(() => {
    const handler = () => setUnlocked(read());
    window.addEventListener(syncEvent, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(syncEvent, handler);
      window.removeEventListener("storage", handler);
    };
  }, [syncEvent, read]);

  const toggle = useCallback(() => {
    const next = !read();
    try {
      localStorage.setItem(storageKey, next ? "false" : "true");
    } catch {
      /* ignore */
    }
    setUnlocked(next);
    window.dispatchEvent(new Event(syncEvent));
    return next;
  }, [storageKey, syncEvent, read]);

  return { arrangeLocked: !unlocked, toggleArrangeLock: toggle };
}
