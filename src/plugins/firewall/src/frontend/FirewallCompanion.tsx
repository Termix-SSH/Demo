import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Plus, RefreshCw } from "lucide-react";
import {
  useSettings,
  useTabs,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, ListBadge, TextField } from "@termix-ssh/plugin-sdk/ui";
import type { FirewallStatus } from "../shared/types";
import { addRule, errorMessage, getStatus } from "./api";
import { PendingBanner } from "./PendingBanner";
import { RulesView } from "./RulesView";
import { useChange } from "./useChange";

/** Starting state of the panel, from the user's settings. */
export function useFirewallCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** The firewall state and rules beside a terminal, with a quick allow. */
export function FirewallCompanion({ host, isVisible }: CompanionProps) {
  return <FirewallPanel host={host} isVisible={isVisible} />;
}

/** The compact firewall view the panel and the Host Metrics card share. */
export function FirewallPanel({
  host,
  isVisible,
}: {
  host: CompanionProps["host"];
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const hostId = host ? Number(host.id) : 0;
  const [status, setStatus] = useState<FirewallStatus | null>(null);
  const [failed, setFailed] = useState("");
  const [port, setPort] = useState("");

  const load = useCallback(async () => {
    if (!hostId) return;
    try {
      setStatus(await getStatus(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
  }, [hostId, t]);
  const change = useChange(load);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const openTab = () => {
    if (host) tabs.openTab(host, "firewall");
  };

  const allow = async () => {
    const value = port.trim();
    if (!value) return;
    const ok = await change.run(
      (force) =>
        addRule(hostId, {
          action: "allow",
          direction: "in",
          protocol: "tcp",
          port: value,
          source: "",
          destination: "",
          iface: "",
          family: "any",
          comment: "",
          force,
        }),
      t("rules.added"),
    );
    if (ok) setPort("");
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 overflow-auto p-1.5">
      <div className="flex items-center gap-1">
        <div className="min-w-0 flex-1 truncate text-xs">
          {status?.backend ? (
            <ListBadge tone={status.active ? "success" : "warning"}>
              {status.backend} {status.active ? t("tab.on") : t("tab.off")}
            </ListBadge>
          ) : status ? (
            <span className="text-muted-foreground">{t("tab.noFirewall")}</span>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => void load()}
          title={t("tab.refresh")}
          aria-label={t("tab.refresh")}
          className="text-accent-brand"
        >
          <RefreshCw className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={openTab}
          title={t("companion.openTab")}
          aria-label={t("companion.openTab")}
        >
          <ExternalLink className="size-4" />
        </Button>
      </div>
      {failed ? (
        <p className="p-2 text-xs text-destructive">{failed}</p>
      ) : !status ? (
        <p className="p-2 text-xs text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : (
        <>
          {status.pending && (
            <PendingBanner
              hostId={hostId}
              pending={status.pending}
              canEdit={status.canEdit}
              onDone={() => void load()}
              compact
            />
          )}
          {status.backend && status.canEdit && !status.pending && (
            <div className="flex items-end gap-1">
              <TextField
                label={t("companion.allowPort")}
                value={port}
                onChange={setPort}
                placeholder="8080"
                mono
                className="flex-1"
              />
              <Button
                size="sm"
                disabled={!port.trim() || change.busy}
                onClick={() => void allow()}
              >
                <Plus className="size-4" />
                {t("actions.allow")}
              </Button>
            </div>
          )}
          {status.backend && (
            <RulesView
              hostId={hostId}
              status={status}
              change={change}
              onEdit={openTab}
              compact
            />
          )}
        </>
      )}
    </div>
  );
}
