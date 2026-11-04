import { useCallback, useEffect, useState } from "react";
import { Network } from "lucide-react";
import {
  useCurrentUser,
  useHosts,
  useTabs,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ManagerCardShell,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { InterfaceView } from "../shared/types";
import { errorMessage, getStatus, listInterfaces, serviceAction } from "./api";
import { wireguardEnabled } from "./enabled";

/** The WireGuard card Host Metrics shows in its manager cards. */
export function WireguardCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const tabs = useTabs();
  const user = useCurrentUser();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && wireguardEnabled(host);
  const [items, setItems] = useState<InterfaceView[] | null>(null);
  const [installed, setInstalled] = useState(true);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!on || hostId == null) return;
    setLoading(true);
    try {
      const status = await getStatus(hostId);
      setInstalled(status.installed);
      setItems(status.installed ? await listInterfaces(hostId) : []);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    } finally {
      setLoading(false);
    }
  }, [on, hostId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!host || hostId == null) return null;

  const shared = host as { isShared?: boolean; permissionLevel?: string };
  const canEdit =
    !!user?.isAdmin ||
    !shared.isShared ||
    shared.permissionLevel === "edit" ||
    shared.permissionLevel === "manage";

  const toggle = async (item: InterfaceView) => {
    setBusy(item.name);
    try {
      await serviceAction(hostId, item.name, item.active ? "stop" : "start");
      toast.success(t("manager.done", { name: item.name }));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("service.failed")));
    } finally {
      setBusy("");
    }
  };

  const message = !on
    ? t("manager.disabled")
    : !installed
      ? t("tab.notInstalled")
      : t("interfaces.empty");

  return (
    <ManagerCardShell
      title={t("manager.title")}
      icon={<Network className="size-3.5" />}
      loading={loading}
      error={failed ? { message: failed } : null}
      onRefresh={() => void load()}
      empty={!on || items?.length === 0}
      emptyMessage={message}
    >
      <PanelList>
        {(items ?? []).map((item, index) => (
          <ListRow
            key={item.name}
            stripe={index}
            icon={<Network className="size-4" />}
            title={item.name}
            tone={item.active ? "brand" : undefined}
            onClick={() => tabs.openTab(host as never, "wireguard")}
            badges={
              <ListBadge>
                {t("interfaces.clients", { count: item.clients })}
              </ListBadge>
            }
            meta={<span className="font-mono">{item.address.join(", ")}</span>}
            trailing={
              canEdit ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy === item.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    void toggle(item);
                  }}
                >
                  {t(item.active ? "manager.stop" : "manager.start")}
                </Button>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </ManagerCardShell>
  );
}
