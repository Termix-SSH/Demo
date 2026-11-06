import { useCallback, useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import {
  useSettings,
  useTabs,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { VmRow } from "../shared/types";
import { errorMessage, getInventory } from "./api";
import { formatBytes, statusText } from "./format";
import { openVm } from "./focus";
import { PowerButtons, useStateLabel } from "./VmList";

const POLL_MS = 15_000;

/** Starting state of the panel, from the user's settings. */
export function useVmCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** The compact VM list the terminal panel and the host page share. */
export function VmPanel({
  host,
  isVisible,
}: {
  host: PluginHostRecord | null | undefined;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const stateLabel = useStateLabel();
  const hostId = host ? Number(host.id) : 0;
  const [vms, setVms] = useState<VmRow[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    if (!hostId) return;
    try {
      setVms((await getInventory(hostId)).vms);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!vms) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-auto">
        <PanelList
          empty={
            <p className="p-3 text-xs text-muted-foreground">{t("vm.none")}</p>
          }
        >
          {vms.map((vm) => (
            <ListRow
              key={vm.uuid}
              title={vm.name}
              badges={
                <ListBadge
                  tone={
                    vm.state === "running"
                      ? "success"
                      : vm.state === "crashed"
                        ? "destructive"
                        : "muted"
                  }
                >
                  {stateLabel(vm.state)}
                </ListBadge>
              }
              meta={statusText([
                t("vm.cpus", { count: vm.vcpus }),
                formatBytes(vm.maxMemoryKib * 1024),
                vm.ips[0],
              ])}
              trailing={
                <PowerButtons hostId={hostId} vm={vm} onChanged={load} />
              }
              onClick={() => {
                if (host) openVm(tabs, host, vm.uuid);
              }}
            />
          ))}
        </PanelList>
      </div>
      <div className="border-t border-border p-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (host) tabs.openTab(host, "virtual-machines");
          }}
        >
          <ExternalLink className="size-3.5" />
          {t("tab.open")}
        </Button>
      </div>
    </div>
  );
}

export function VmCompanion({ host, isVisible }: CompanionProps) {
  return <VmPanel host={host} isVisible={isVisible} />;
}

/** The same list as a tile on the host page. */
export function VmHostTile({
  host,
  isVisible = true,
}: {
  hostId: number;
  host?: PluginHostRecord;
  isVisible?: boolean;
}) {
  return <VmPanel host={host} isVisible={isVisible} />;
}
