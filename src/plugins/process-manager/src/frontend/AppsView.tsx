import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  Eraser,
  Play,
  RefreshCw,
  RotateCw,
  ScrollText,
  Square,
  Trash2,
} from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  AppRow,
  LogTarget,
  ManagersView,
  StatusView,
} from "../shared/types";
import {
  addWatch,
  appAction,
  errorMessage,
  getApps,
  supervisorRefresh,
} from "./api";
import { appTone, bytes, span } from "./format";

const POLL_MS = 10_000;

/** pm2 and supervisor apps with their controls. */
export function AppsView({
  hostId,
  status,
  isVisible,
  onLogs,
}: {
  hostId: number;
  status: StatusView;
  isVisible: boolean;
  onLogs: (target: LogTarget) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [view, setView] = useState<ManagersView | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setView(await getApps(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("apps.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const run = async (app: AppRow, action: string) => {
    if (action === "delete" || action === "stop") {
      const ok = await confirm({
        title: t(`apps.confirm.${action}`, { name: app.name }),
        description: t(`apps.confirmDesc.${action}`),
        confirmLabel: t(`apps.${action}`),
        destructive: true,
      });
      if (!ok) return;
    }
    const id = `${app.manager}:${app.key}`;
    setBusy(id);
    try {
      await appAction(hostId, app.manager, app.key, action);
      toast.success(
        t("apps.done", { action: t(`apps.${action}`), name: app.name }),
      );
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("apps.failed")));
    } finally {
      setBusy("");
    }
  };

  const watch = async (app: AppRow) => {
    try {
      await addWatch(hostId, {
        kind: app.manager,
        target: app.name,
        rule: "down",
      });
      toast.success(t("watches.added"));
    } catch (e) {
      toast.error(errorMessage(e, t("watches.addFailed")));
    }
  };

  const refresh = async () => {
    setBusy("refresh");
    try {
      await supervisorRefresh(hostId);
      toast.success(t("apps.refreshed"));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("apps.failed")));
    } finally {
      setBusy("");
    }
  };

  const logTarget = (app: AppRow): LogTarget =>
    app.manager === "pm2"
      ? { kind: "pm2", key: app.key }
      : { kind: "supervisor", key: app.key, stream: "stdout" };

  if (!view) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {failed || t("tab.loading")}
      </p>
    );
  }

  if (!view.pm2 && !view.supervisor) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("apps.none")}</p>
    );
  }

  return (
    <div className="flex min-h-0 flex-col">
      <ToolbarBand className="text-xs text-muted-foreground">
        <span>
          {[view.pm2 ? "pm2" : "", view.supervisor ? "supervisor" : ""]
            .filter(Boolean)
            .join(" | ")}
        </span>
        <span className="ml-auto flex gap-1">
          {view.supervisor && status.canEdit && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy === "refresh"}
              onClick={() => void refresh()}
            >
              {t("apps.reread")}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            title={t("tab.refresh")}
            onClick={() => void load()}
            className="text-accent-brand"
          >
            <RefreshCw className="size-4" />
          </Button>
        </span>
      </ToolbarBand>
      {failed && <p className="px-3 py-2 text-xs text-destructive">{failed}</p>}
      {view.supervisorError && (
        <p className="px-3 py-2 text-xs text-warning">
          {t("apps.supervisorError", { message: view.supervisorError })}
        </p>
      )}
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">{t("apps.empty")}</p>
        }
      >
        {view.apps.map((app, index) => {
          const id = `${app.manager}:${app.key}`;
          const up = app.health === "up";
          const disabled = busy === id;
          return (
            <ListRow
              key={id}
              stripe={index}
              tone={appTone(app)}
              icon={<Boxes className="size-3.5" />}
              title={<span className="font-mono text-xs">{app.name}</span>}
              badges={
                <>
                  <ListBadge tone={appTone(app)}>{app.status}</ListBadge>
                  <ListBadge tone="muted">{app.manager}</ListBadge>
                </>
              }
              meta={[
                app.pid ? `pid ${app.pid}` : "",
                app.cpu != null ? `${app.cpu}% CPU` : "",
                app.mem != null ? bytes(app.mem) : "",
                app.restarts != null
                  ? t("apps.restarts", { count: app.restarts })
                  : "",
                app.uptime != null ? span(app.uptime) : "",
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => onLogs(logTarget(app))}
              trailing={
                <span className="flex items-center">
                  <Button
                    variant="ghost"
                    size="icon"
                    title={t("apps.logs")}
                    onClick={(e) => {
                      e.stopPropagation();
                      onLogs(logTarget(app));
                    }}
                  >
                    <ScrollText className="size-4" />
                  </Button>
                  {status.canEdit && (
                    <>
                      {up ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("apps.stop")}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            void run(app, "stop");
                          }}
                        >
                          <Square className="size-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("apps.start")}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            void run(app, "start");
                          }}
                        >
                          <Play className="size-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("apps.restart")}
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          void run(app, "restart");
                        }}
                      >
                        <RotateCw className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("apps.flush")}
                        disabled={disabled}
                        onClick={(e) => {
                          e.stopPropagation();
                          void run(app, "flush");
                        }}
                      >
                        <Eraser className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("watches.watchThis")}
                        onClick={(e) => {
                          e.stopPropagation();
                          void watch(app);
                        }}
                      >
                        <Bell className="size-4" />
                      </Button>
                      {app.manager === "pm2" && (
                        <Button
                          variant="ghost"
                          size="icon"
                          title={t("apps.delete")}
                          disabled={disabled}
                          onClick={(e) => {
                            e.stopPropagation();
                            void run(app, "delete");
                          }}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      )}
                    </>
                  )}
                </span>
              }
            />
          );
        })}
      </PanelList>
    </div>
  );
}
