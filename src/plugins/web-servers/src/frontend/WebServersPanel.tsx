import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import {
  useSettings,
  useTabs,
  useToast,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, ListBadge, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import type { WebStatus } from "../shared/types";
import { errorCode, errorMessage, getStatus, serviceAction } from "./api";
import { SERVER_LABEL, badgeTone, isUp } from "./format";
import { SitesView } from "./SitesView";
import type { Runner } from "./WebServersTab";

/** Starting state of the panel, from the user's settings. */
export function useCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

export function WebServersCompanion({ host, isVisible }: CompanionProps) {
  return <WebServersPanel host={host} isVisible={isVisible} />;
}

/** Server states and sites, small enough for a side panel or a card. */
export function WebServersPanel({
  host,
  isVisible,
}: {
  host: CompanionProps["host"];
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const toast = useToast();
  const hostId = host ? Number(host.id) : 0;
  const [status, setStatus] = useState<WebStatus | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!hostId) return;
    try {
      setStatus(await getStatus(hostId));
      setFailed("");
    } catch (e) {
      setFailed(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
          : errorMessage(e, t("tab.error")),
      );
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const runner: Runner = {
    busy,
    run: async (_title, work, done) => {
      setBusy(true);
      try {
        await work();
        toast.success(done);
        return true;
      } catch (e) {
        toast.error(errorMessage(e, t("actions.failed")));
        return false;
      } finally {
        setBusy(false);
        void load();
      }
    },
    show: (title, ok, output) =>
      ok ? toast.success(title) : toast.error(output || title),
  };

  const openTab = () => {
    if (host) tabs.openTab(host, "web-servers");
  };

  const installed = status?.servers.filter((s) => s.installed) ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      <div className="flex items-center gap-1 p-1.5">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 text-xs">
          {installed.map((s) => (
            <ListBadge key={s.kind} tone={badgeTone(s.state)}>
              {SERVER_LABEL[s.kind]} {s.state}
            </ListBadge>
          ))}
          {status && installed.length === 0 && (
            <span className="text-muted-foreground">{t("tab.noServer")}</span>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            void load();
            setTick((n) => n + 1);
          }}
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
        <LoadingState compact label={t("common.loading")} />
      ) : (
        <>
          {status.canEdit && installed.some((s) => isUp(s.state)) && (
            <div className="flex flex-wrap gap-1 px-1.5 pb-1.5">
              {installed
                .filter((s) => isUp(s.state))
                .map((s) => (
                  <Button
                    key={s.kind}
                    variant="outline"
                    size="xs"
                    disabled={busy}
                    onClick={() =>
                      void runner.run(
                        t("server.reload"),
                        () => serviceAction(hostId, s.kind, "reload"),
                        t("server.done", { server: SERVER_LABEL[s.kind] }),
                      )
                    }
                  >
                    {t("companion.reload", { server: SERVER_LABEL[s.kind] })}
                  </Button>
                ))}
            </div>
          )}
          {installed.length > 0 && (
            <SitesView
              key={tick}
              hostId={hostId}
              status={status}
              runner={runner}
              isVisible={isVisible}
              onOpen={openTab}
              compact
            />
          )}
        </>
      )}
    </div>
  );
}
