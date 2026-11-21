import { useEffect, useState } from "react";
import {
  usePermission,
  type PluginHostRecord,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import type { VmRow, VmState } from "../shared/types";
import { errorMessage, getInventory } from "./api";

const POLL_MS = 30_000;
const TAB_ID = "virtual-machines";

interface TreeChild {
  id: string;
  label: string;
  detail?: string;
  kind: "vm";
  state: "running" | "stopped" | "paused" | "unknown";
  tabType: string;
  data: Record<string, unknown>;
}

interface TreeResult {
  items: TreeChild[];
  loading?: boolean;
  error?: string;
}

/** registerHostTreeChildren is in Termix 26.11.3 and newer. */
type TreeApp = TermixApp & {
  registerHostTreeChildren?: (provider: {
    id: string;
    titleKey?: string;
    when: (host: PluginHostRecord) => boolean;
    useChildren: (host: PluginHostRecord) => TreeResult | null;
    order?: number;
  }) => unknown;
};

export function treeState(state: VmState): TreeChild["state"] {
  if (state === "running" || state === "blocked") return "running";
  if (state === "paused" || state === "pmsuspended") return "paused";
  if (state === "shutoff" || state === "shutdown" || state === "crashed") {
    return "stopped";
  }
  return "unknown";
}

export function toTreeChildren(
  vms: Pick<VmRow, "uuid" | "name" | "state" | "ips">[],
): TreeChild[] {
  return [...vms]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((vm) => ({
      id: vm.uuid,
      label: vm.name,
      detail: vm.ips[0],
      kind: "vm",
      state: treeState(vm.state),
      tabType: TAB_ID,
      data: { focus: { uuid: vm.uuid } },
    }));
}

/** The host's VMs while a host tree shows the host open. */
export function useVmTreeChildren(host: PluginHostRecord): TreeResult {
  const allowed = usePermission("use");
  const [result, setResult] = useState<TreeResult>({
    items: [],
    loading: true,
  });
  const hostId = Number(host.id);

  useEffect(() => {
    if (!allowed || !hostId) return;
    let stopped = false;
    const load = async () => {
      try {
        const inventory = await getInventory(hostId);
        if (!stopped) setResult({ items: toTreeChildren(inventory.vms) });
      } catch (error) {
        if (!stopped) {
          setResult({ items: [], error: errorMessage(error, "") || undefined });
        }
      }
    };
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [hostId, allowed]);

  return allowed ? result : { items: [] };
}

export function registerTreeChildren(
  app: TermixApp,
  when: (host: PluginHostRecord) => boolean,
): void {
  (app as TreeApp).registerHostTreeChildren?.({
    id: "vms",
    titleKey: "tree.vms",
    order: 47,
    when,
    useChildren: useVmTreeChildren,
  });
}
