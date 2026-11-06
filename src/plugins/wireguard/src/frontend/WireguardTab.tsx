import { useCallback, useEffect, useState } from "react";
import { Network } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  Button,
  PanelShell,
  useConfirm,
  EmptyState,
  PanelFrame,
  RefreshButton,
  TabStrip,
  NoticePanel,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { WireguardStatus } from "../shared/types";
import { errorCode, errorMessage, getStatus, installWireguard } from "./api";
import { InterfaceCreate } from "./InterfaceCreate";
import { InterfaceDetail } from "./InterfaceDetail";
import { InterfacesView } from "./InterfacesView";
import { LogsView } from "./LogsView";

type View = "interfaces" | "logs";

// A fixed height box, so the panel body inside it can scroll.
/** WireGuard for one host: interfaces, clients, config and logs. */
export function WireguardTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<WireguardStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("interfaces");
  const [open, setOpen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      setError(
        errorCode(e) === "sudo"
          ? t("tab.sudo")
          : errorMessage(e, t("tab.error")),
      );
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
  }, [isVisible, load]);

  const refresh = () => {
    void load();
    setTick((n) => n + 1);
  };

  const install = async () => {
    const ok = await confirm({
      title: t("install.title"),
      description: t("install.desc"),
      confirmLabel: t("install.confirm"),
    });
    if (!ok) return;
    setInstalling(true);
    try {
      await installWireguard(hostId);
      toast.success(t("install.done"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("install.failed")));
    } finally {
      setInstalling(false);
    }
  };

  if (!host) {
    return <EmptyState title={t("tab.noHost")} />;
  }

  const title = label || host.name || t("tab.title");

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={<Network className="size-4" />} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <LoadingState />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  if (creating) {
    return (
      <PanelFrame>
        <InterfaceCreate
          hostId={hostId}
          status={status}
          onClose={() => setCreating(false)}
          reload={refresh}
        />
      </PanelFrame>
    );
  }

  if (open) {
    return (
      <PanelFrame>
        <InterfaceDetail
          key={open}
          hostId={hostId}
          name={open}
          status={status}
          onClose={() => setOpen(null)}
          reload={refresh}
        />
      </PanelFrame>
    );
  }

  return (
    <PanelFrame>
      <PanelShell
        icon={<Network className="size-4" />}
        title={title}
        status={
          status.installed
            ? status.version || t("tab.installed")
            : t("tab.notInstalled")
        }
        actions={
          <>
            <RefreshButton
              onClick={refresh}
              loading={loading}
              label={t("tab.refresh")}
            />
            {status.installed && view === "interfaces" && (
              <AddButton
                label={t("interfaces.add")}
                onClick={() => setCreating(true)}
              />
            )}
          </>
        }
        tabs={
          status.installed ? (
            <TabStrip
              tabs={[
                { id: "interfaces", label: t("tab.viewInterfaces") },
                { id: "logs", label: t("tab.viewLogs") },
              ]}
              activeTab={view}
              onTabChange={(id) => setView(id as View)}
            />
          ) : undefined
        }
        scroll={view !== "logs"}
      >
        <div
          className={`flex flex-col ${view === "logs" ? "min-h-0 flex-1" : "shrink-0"}`}
        >
          {!status.root && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.sudo")}
            </Alert>
          )}
          {!status.installed ? (
            <NoticePanel
              icon={Network}
              title={t("install.empty")}
              action={
                <Button
                  onClick={() => void install()}
                  disabled={
                    installing ||
                    !status.root ||
                    status.packageManager === "none"
                  }
                >
                  {installing ? t("install.working") : t("install.button")}
                </Button>
              }
            >
              {status.packageManager === "none"
                ? t("install.noManager")
                : t("install.hint", {
                    os: status.os || t("install.thisHost"),
                  })}
            </NoticePanel>
          ) : view === "interfaces" ? (
            <InterfacesView
              key={tick}
              hostId={hostId}
              onOpen={setOpen}
              isVisible={isVisible}
            />
          ) : (
            <LogsView key={tick} hostId={hostId} />
          )}
        </div>
      </PanelShell>
    </PanelFrame>
  );
}
