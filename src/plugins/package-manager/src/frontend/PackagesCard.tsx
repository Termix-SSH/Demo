import { useCallback, useEffect, useState } from "react";
import { Package } from "lucide-react";
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
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { UpdateItem } from "../shared/types";
import { errorMessage, getUpdates, runAction } from "./api";
import { canEditHost, packagesEnabled } from "./enabled";

/** The Packages card Host Metrics shows in its manager cards. */
export function PackagesCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const tabs = useTabs();
  const user = useCurrentUser();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && packagesEnabled(host);
  const [items, setItems] = useState<UpdateItem[] | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!on || hostId == null) return;
    setLoading(true);
    try {
      setItems(await getUpdates(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("updates.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [on, hostId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!host || hostId == null) return null;
  const canEdit = on && canEditHost(host, !!user?.isAdmin);

  const upgradeAll = async () => {
    const ok = await confirm({
      title: t("actions.upgrade-all.confirm"),
      description: t("actions.upgrade-all.desc"),
      confirmLabel: t("actions.upgrade-all.label"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await runAction(hostId, "upgrade-all");
      toast.success(t("actions.upgrade-all.done"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("actions.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ManagerCardShell
      title={t("manager.title")}
      icon={<Package className="size-3.5" />}
      loading={loading || busy}
      error={failed ? { message: failed } : null}
      onRefresh={() => void load()}
      empty={!on || items?.length === 0}
      emptyMessage={on ? t("updates.empty") : t("manager.disabled")}
      headerExtra={
        canEdit && (items?.length ?? 0) > 0 ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => void upgradeAll()}
          >
            {t("actions.upgrade-all.label")}
          </Button>
        ) : undefined
      }
    >
      <PanelList>
        {(items ?? []).map((item, index) => (
          <ListRow
            key={item.name}
            stripe={index}
            icon={<Package className="size-4" />}
            tone={item.security ? "warning" : "brand"}
            title={<span className="font-mono">{item.name}</span>}
            badges={
              item.security ? (
                <ListBadge tone="warning">{t("updates.security")}</ListBadge>
              ) : undefined
            }
            meta={
              <span className="font-mono">
                {item.current
                  ? `${item.current} → ${item.available}`
                  : item.available}
              </span>
            }
            onClick={() => tabs.openTab(host as never, "package-manager")}
          />
        ))}
      </PanelList>
    </ManagerCardShell>
  );
}
