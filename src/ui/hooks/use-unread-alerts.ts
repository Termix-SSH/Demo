import { useEffect, useState } from "react";
import { getAlertFirings } from "@/api/alerts-api";

/**
 * Unacknowledged alert count, polled while the tab is visible.
 *
 * The rail owned this, then the mobile bar needed the same badge. Two copies
 * would mean two pollers, so it lives here and both read it.
 */
export function useUnreadAlerts(): number {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = () => {
      if (document.visibilityState === "hidden") return;
      getAlertFirings({ acknowledged: false, limit: 50 })
        .then((firings) => {
          if (!cancelled) setUnread(firings.length);
        })
        .catch(() => {});
    };

    const start = () => {
      if (intervalId !== null) return;
      intervalId = setInterval(poll, 30000);
    };
    const stop = () => {
      if (intervalId === null) return;
      clearInterval(intervalId);
      intervalId = null;
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        stop();
        return;
      }
      poll();
      start();
    };

    poll();
    if (document.visibilityState !== "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return unread;
}
