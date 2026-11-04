import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Network, RefreshCw } from "lucide-react";
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
  Segmented,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { WireguardStatus } from "../shared/types";
import { errorCode, errorMessage, getStatus, installWireguard } from "./api";
import { Loading } from "./Loading";
import { InterfaceCreate } from "./InterfaceCreate";
import { InterfaceDetail } from "./InterfaceDetail";
import { InterfacesView } from "./InterfacesView";
import { LogsView } from "./LogsView";

type View = "interfaces" | "logs";

// A fixed height box, so the panel body inside it can scroll.
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

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
    return (
      <p className="p-4 text-sm text-muted-foreground">{t("tab.noHost")}</p>
    );
  }

  const title = label || host.name || t("tab.title");

  if (!status) {
    return (
      <Frame>
        <PanelShell
          icon={<Network className="size-4" />}
          title={title}
          className="gap-2 p-2.5"
        >
          {error ? (
            <p className="p-2 text-sm text-destructive">{error}</p>
          ) : (
            <Loading />
          )}
        </PanelShell>
      </Frame>
    );
  }

  if (creating) {
    return (
      <Frame>
        <InterfaceCreate
          hostId={hostId}
          status={status}
          onClose={() => setCreating(false)}
          reload={refresh}
        />
      </Frame>
    );
  }

  if (open) {
    return (
      <Frame>
        <InterfaceDetail
          key={open}
          hostId={hostId}
          name={open}
          status={status}
          onClose={() => setOpen(null)}
          reload={refresh}
        />
      </Frame>
    );
  }

  return (
    <Frame>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={refresh}
              disabled={loading}
              title={t("tab.refresh")}
              className="text-accent-brand"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
            {status.installed && view === "interfaces" && (
              <AddButton
                label={t("interfaces.add")}
                onClick={() => setCreating(true)}
              />
            )}
          </>
        }
        toolbar={
          status.installed ? (
            <Segmented<View>
              value={view}
              onChange={setView}
              options={[
                { value: "interfaces", label: t("tab.viewInterfaces") },
                { value: "logs", label: t("tab.viewLogs") },
              ]}
            />
          ) : undefined
        }
        className="gap-2 p-2.5"
      >
        <div className="flex shrink-0 flex-col gap-2">
          {!status.root && (
            <Alert className="rounded-none text-xs">{t("tab.sudo")}</Alert>
          )}
          {!status.installed ? (
            <div className="flex flex-col items-start gap-3 border border-border p-4">
              <Network className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">{t("install.empty")}</p>
              <p className="text-xs text-muted-foreground">
                {status.packageManager === "none"
                  ? t("install.noManager")
                  : t("install.hint", {
                      os: status.os || t("install.thisHost"),
                    })}
              </p>
              <Button
                onClick={() => void install()}
                disabled={
                  installing || !status.root || status.packageManager === "none"
                }
              >
                {installing ? t("install.working") : t("install.button")}
              </Button>
            </div>
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
    </Frame>
  );
}
