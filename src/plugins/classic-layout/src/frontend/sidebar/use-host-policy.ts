import { useEffect, useState } from "react";
import { getHostPolicy, type HostPolicy } from "@termix-ssh/plugin-sdk/ui";

const OPEN: HostPolicy = { manualCreate: true };

let cached: HostPolicy | null = null;
let pending: Promise<HostPolicy> | null = null;

/** Loads once per page; a failed load leaves adding open, the server still checks. */
export function loadHostPolicy(): Promise<HostPolicy> {
  if (cached) return Promise.resolve(cached);
  pending ??= getHostPolicy()
    .then((policy) => (cached = policy ?? OPEN))
    .catch(() => OPEN)
    .finally(() => {
      pending = null;
    });
  return pending;
}

/** Test seam. */
export function resetHostPolicy(): void {
  cached = null;
  pending = null;
}

/** Whether hosts can be added by hand, and who manages them when not. */
export function useHostPolicy(): HostPolicy {
  const [policy, setPolicy] = useState<HostPolicy>(cached ?? OPEN);
  useEffect(() => {
    let live = true;
    void loadHostPolicy().then((next) => {
      if (live) setPolicy(next);
    });
    return () => {
      live = false;
    };
  }, []);
  return policy;
}
