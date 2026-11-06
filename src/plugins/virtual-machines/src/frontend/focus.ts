import { useEffect, useState } from "react";
import type {
  PluginHostRecord,
  TabsApi,
} from "@termix-ssh/plugin-sdk/frontend";

const TAB_ID = "virtual-machines";
const wanted = new Map<number, string>();
const listeners = new Set<() => void>();

/** Opens a host's tab on one VM, reusing a tab that is already open. */
export function openVm(
  tabs: Pick<TabsApi, "openTab">,
  host: PluginHostRecord,
  uuid: string,
): void {
  wanted.set(Number(host.id), uuid);
  tabs.openTab(host, TAB_ID);
  for (const listener of listeners) listener();
}

/** Gives the tab the VM someone asked to see, once. */
export function useWantedVm(hostId: number, onVm: (uuid: string) => void) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick((n) => n + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  useEffect(() => {
    const uuid = wanted.get(hostId);
    if (!uuid) return;
    wanted.delete(hostId);
    onVm(uuid);
  }, [hostId, onVm, tick]);
}
