import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Button,
  Input,
  ListRow,
  LoadingState,
  NoticePanel,
  PANEL,
  PanelFrame,
  PanelList,
  PanelShell,
  RefreshButton,
  StatusBadge,
  cancelAdminHold,
  getAdminHoldSettings,
  getAdminHolds,
  setAdminHoldMinutes,
  useConfirm,
  usePermissions,
  type AdminHold,
  type AdminHoldSettings,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

const DEFAULT_MINUTES = 60;

const TONE: Record<AdminHold["status"], "ok" | "warn" | "bad" | "idle"> = {
  pending: "warn",
  applying: "warn",
  applied: "ok",
  cancelled: "idle",
  failed: "bad",
};

/** The two-admin wait: its switch and the changes waiting or done. */
export function AdminWaitsTab() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { isAdmin, loaded } = usePermissions();
  const [settings, setSettings] = useState<AdminHoldSettings | null>(null);
  const [holds, setHolds] = useState<AdminHold[]>([]);
  const [minutes, setMinutes] = useState("");
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [next, list] = await Promise.all([
        getAdminHoldSettings(),
        getAdminHolds(),
      ]);
      setSettings(next);
      setHolds(list.holds);
      setMinutes(String(next.minutes || DEFAULT_MINUTES));
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => {
    if (loaded && isAdmin) void load();
  }, [load, loaded, isAdmin]);

  async function save(value: number) {
    setBusy(true);
    try {
      const result = await setAdminHoldMinutes(value);
      toast.success(result.held ? t("waits.savedHeld") : t("waits.saved"));
      await load();
    } catch {
      toast.error(t("waits.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(hold: AdminHold) {
    if (
      !(await confirm({
        title: t("waits.cancelConfirm"),
        description: hold.summary,
        confirmLabel: t("waits.cancel"),
      }))
    ) {
      return;
    }
    setBusy(true);
    try {
      await cancelAdminHold(hold.id);
      toast.success(t("waits.cancelled"));
      await load();
    } catch {
      toast.error(t("waits.failed"));
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (!loaded) {
    body = <LoadingState />;
  } else if (!isAdmin) {
    body = <NoticePanel title={t("waits.adminOnly")} />;
  } else if (failed) {
    body = <NoticePanel tone="destructive" title={t("waits.loadFailed")} />;
  } else if (!settings) {
    body = <LoadingState />;
  } else {
    const parsed = Number(minutes);
    const valid = Number.isInteger(parsed) && parsed >= 1 && parsed <= 10080;
    const on = settings.minutes > 0;
    body = (
      <div className="flex flex-col">
        <div
          className={`flex flex-col gap-3 border-b border-border ${PANEL.body}`}
        >
          <p className="text-sm text-muted-foreground">{t("waits.intro")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={settings.active ? "ok" : "idle"}>
              {settings.active
                ? t("waits.active", { minutes: settings.minutes })
                : on
                  ? t("waits.onOneAdmin")
                  : t("waits.off")}
            </StatusBadge>
            <span className="text-sm text-muted-foreground">
              {t("waits.admins", { count: settings.adminCount })}
            </span>
          </div>
          {settings.forcedByEnv ? (
            <NoticePanel
              title={t("waits.forced", { name: settings.envName })}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm" htmlFor="admin-wait-minutes">
                {t("waits.minutes")}
              </label>
              <Input
                id="admin-wait-minutes"
                className="w-24"
                inputMode="numeric"
                value={minutes}
                onChange={(event) => setMinutes(event.target.value)}
              />
              <Button
                disabled={busy || !valid || parsed === settings.minutes}
                onClick={() => void save(parsed)}
              >
                {on ? t("waits.change") : t("waits.turnOn")}
              </Button>
              {on && (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save(0)}
                >
                  {t("waits.turnOff")}
                </Button>
              )}
            </div>
          )}
        </div>
        <PanelList empty={t("waits.none")}>
          {holds.map((hold) => (
            <ListRow
              key={hold.id}
              title={hold.summary}
              badges={
                <StatusBadge tone={TONE[hold.status] ?? "idle"}>
                  {t(`waits.status.${hold.status}`)}
                </StatusBadge>
              }
              meta={t("waits.meta", {
                who: hold.requestedByName,
                runsAt: new Date(hold.runsAt).toLocaleString(),
              })}
              trailing={
                hold.status === "pending" ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void cancel(hold)}
                  >
                    {t("waits.cancel")}
                  </Button>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      </div>
    );
  }

  return (
    <PanelFrame>
      <PanelShell
        title={t("waits.title")}
        actions={
          loaded && isAdmin ? (
            <RefreshButton onClick={() => void load()} loading={busy} />
          ) : undefined
        }
      >
        {body}
      </PanelShell>
    </PanelFrame>
  );
}
