import { useEffect, useState } from "react";
import { getAlertFirings } from "@/api/alerts-api";
import { getPlugins, subscribePlugins } from "@/demo/plugins/plugin-store";

/**
 * Unacknowledged alert count, polled while the tab is visible.
 *
 * The rail owned this, then the mobile bar needed the same badge. Two copies
 * would mean two pollers, so it lives here and both read it.
 */
/** Alerting is a plugin, so its badge has to come and go with it. */
function alertingRunning(): boolean {
  const plugin = getPlugins().find((p) => p.id === "alerting");
  return plugin?.installed === true && plugin.state === "enabled";
}

export function useUnreadAlerts(): number {
  const [unread, setUnread] = useState(0);
  const [running, setRunning] = useState(alertingRunning);

  useEffect(() => subscribePlugins(() => setRunning(alertingRunning())), []);

  useEffect(() => {
    // No plugin, no poller and no badge. Without this the mobile bar kept a
    // count for a feature that had been removed.
    if (!running) {
      setUnread(0);
      return;
    }
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
  }, [running]);

  return unread;
}
