import { useCallback, useEffect, useState } from "react";
import { Ban, Undo2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Fail2banStatus } from "../shared/types";
import {
  ban,
  errorCode,
  errorMessage,
  getFail2ban,
  install,
  startFail2ban,
  unban,
} from "./api";

export function Fail2banView({
  hostId,
  canEdit,
  isVisible,
  packageManager,
  onChanged,
}: {
  hostId: number;
  canEdit: boolean;
  isVisible: boolean;
  packageManager: string;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [status, setStatus] = useState<Fail2banStatus | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setStatus(await getFail2ban(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("fail2ban.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const doBan = async (jail: string) => {
    const ip = (address[jail] ?? "").trim();
    if (!ip) return;
    setBusy(true);
    try {
      try {
        await ban(hostId, jail, ip);
      } catch (e) {
        if (errorCode(e) !== "SSH_LOCKOUT") throw e;
        const ok = await confirm({
          title: t("fail2ban.selfTitle"),
          description: t("fail2ban.selfDescription"),
          confirmLabel: t("fail2ban.ban"),
        });
        if (!ok) return;
        await ban(hostId, jail, ip, true);
      }
      toast.success(t("fail2ban.banned", { ip }));
      setAddress((prev) => ({ ...prev, [jail]: "" }));
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
      await load();
    }
  };

  if (failed) return <p className="p-2 text-sm text-destructive">{failed}</p>;
  if (!status)
    return (
      <p className="p-2 text-xs text-muted-foreground">{t("common.loading")}</p>
    );

  if (!status.installed) {
    return (
      <div className="flex flex-col items-start gap-2 p-2">
        <p className="text-sm text-muted-foreground">
          {t("fail2ban.notInstalled")}
        </p>
        {canEdit && packageManager && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(
                async () => {
                  await install(hostId, "fail2ban");
                  onChanged();
                },
                t("install.done", { name: "Fail2ban" }),
              )
            }
          >
            {busy
              ? t("install.working")
              : t("install.button", { name: "Fail2ban" })}
          </Button>
        )}
      </div>
    );
  }

  if (!status.running) {
    return (
      <div className="flex flex-col items-start gap-2 p-2">
        <p className="text-sm text-muted-foreground">{t("fail2ban.stopped")}</p>
        {canEdit && (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void run(() => startFail2ban(hostId), t("fail2ban.started"))
            }
          >
            {t("fail2ban.start")}
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">{status.version}</p>
      {status.jails.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("fail2ban.noJails")}</p>
      )}
      {status.jails.map((jail) => (
        <div
          key={jail.name}
          className="flex flex-col gap-1.5 border border-border p-2"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-medium">{jail.name}</span>
            <ListBadge tone={jail.currentlyBanned ? "warning" : "muted"}>
              {t("fail2ban.bannedCount", { count: jail.currentlyBanned })}
            </ListBadge>
            <span className="text-xs text-muted-foreground">
              {t("fail2ban.counts", {
                failed: jail.currentlyFailed,
                totalFailed: jail.totalFailed,
                totalBanned: jail.totalBanned,
              })}
            </span>
          </div>
          <PanelList
            empty={
              <p className="px-1 py-2 text-xs text-muted-foreground/60">
                {t("fail2ban.none")}
              </p>
            }
          >
            {jail.banned.map((ip, index) => (
              <ListRow
                key={ip}
                stripe={index}
                title={<span className="font-mono text-xs">{ip}</span>}
                actions={
                  canEdit ? (
                    <ListRowAction
                      label={t("fail2ban.unban")}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => unban(hostId, jail.name, ip),
                          t("fail2ban.unbanned", { ip }),
                        )
                      }
                    >
                      <Undo2 className="size-4" />
                    </ListRowAction>
                  ) : undefined
                }
              />
            ))}
          </PanelList>
          {canEdit && (
            <div className="flex items-end gap-2">
              <TextField
                label={t("fail2ban.banAddress")}
                value={address[jail.name] ?? ""}
                onChange={(v) =>
                  setAddress((prev) => ({ ...prev, [jail.name]: v }))
                }
                placeholder="203.0.113.7"
                mono
                className="flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy || !(address[jail.name] ?? "").trim()}
                onClick={() => void doBan(jail.name)}
              >
                <Ban className="size-4" />
                {t("fail2ban.ban")}
              </Button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
