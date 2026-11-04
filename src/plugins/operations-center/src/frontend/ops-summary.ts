import { useCallback, useEffect, useState } from "react";
import { getAttention, listApprovals, listRuns } from "./api";

export interface OpsSummary {
  approvals: number;
  failed: number;
  rollouts: number;
  drifted: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Counts for the Operations nav badges, read every 30 seconds while shown. */
export function useOpsSummary(isVisible: boolean) {
  const [summary, setSummary] = useState<OpsSummary | null>(null);
  const load = useCallback(async () => {
    const [approvals, failed, own] = await Promise.all([
      listApprovals().catch(() => null),
      listRuns({ status: "failed", limit: 50 }).catch(() => null),
      getAttention().catch(() => null),
    ]);
    const since = Date.now() - DAY_MS;
    setSummary({
      approvals: approvals?.length ?? 0,
      failed: (failed ?? []).filter((run) => Date.parse(run.createdAt) >= since)
        .length,
      rollouts: (own?.rollouts.length ?? 0) + (own?.running ?? 0),
      drifted: own?.drifted ?? 0,
    });
  }, []);
  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => {
      if (document.visibilityState !== "hidden") void load();
    }, 30000);
    return () => clearInterval(timer);
  }, [isVisible, load]);
  return { summary, reload: load };
}
