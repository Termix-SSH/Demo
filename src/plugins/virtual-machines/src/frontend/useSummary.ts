import { useCallback, useEffect, useState } from "react";
import { usePermission } from "@termix-ssh/plugin-sdk/frontend";
import type { HostSummary } from "../shared/types";
import { errorMessage, getSummary } from "./api";

const POLL_MS = 60_000;

/** Every host's VMs, read while something on screen shows them. */
export function useSummary(isVisible: boolean, fallbackError: string) {
  const allowed = usePermission("use");
  const [rows, setRows] = useState<HostSummary[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(
    async (refresh = false) => {
      try {
        setRows(await getSummary(refresh));
        setFailed("");
      } catch (e) {
        setFailed(errorMessage(e, fallbackError));
      }
    },
    [fallbackError],
  );

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  return { rows, failed, load, allowed };
}
