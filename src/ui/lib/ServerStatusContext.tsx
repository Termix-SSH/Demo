import React, { createContext, useContext } from "react";
import { DEMO_HOSTS } from "@/demo/demo-data";

/**
 * Host statuses are fixed in the fixtures rather than polled, so this serves
 * them directly and reports the initial load as already finished.
 */

export type StatusValue = "online" | "reachable" | "offline" | "unknown";

/**
 * Callers pass Number(host.id), but demo host ids are strings like "h-web-01",
 * so that arrives as NaN. Statuses are looked up by the original string id and
 * NaN simply falls through to null.
 */
const STATUS_BY_ID = new Map<string, StatusValue>(
  DEMO_HOSTS.map((h) => [h.id, (h.status ?? "unknown") as StatusValue]),
);

function lookup(hostId: number | string): StatusValue | null {
  if (typeof hostId === "string") return STATUS_BY_ID.get(hostId) ?? null;
  if (!Number.isFinite(hostId)) return null;
  return STATUS_BY_ID.get(String(hostId)) ?? null;
}

interface ServerStatusContextValue {
  getStatus: (hostId: number | string) => StatusValue | null;
  initialLoadComplete: boolean;
  isLoading: boolean;
  refresh: () => void;
}

const value: ServerStatusContextValue = {
  getStatus: lookup,
  initialLoadComplete: true,
  isLoading: false,
  refresh: () => {},
};

const ServerStatusContext = createContext<ServerStatusContextValue>(value);

export function ServerStatusProvider({
  children,
}: {
  children: React.ReactNode;
  isAuthenticated?: boolean;
}) {
  return (
    <ServerStatusContext.Provider value={value}>
      {children}
    </ServerStatusContext.Provider>
  );
}

export function useServerStatus(): ServerStatusContextValue {
  return useContext(ServerStatusContext);
}

/** Subscribe to one host's status. Status is fixed, so this never fires. */
export function useHostStatus(
  hostId: number | string,
  statusCheckEnabled: boolean = true,
): StatusValue | null {
  if (!statusCheckEnabled) return null;
  return lookup(hostId);
}

export function useServerStatusMeta(): {
  initialLoadComplete: boolean;
  isLoading: boolean;
} {
  return { initialLoadComplete: true, isLoading: false };
}
