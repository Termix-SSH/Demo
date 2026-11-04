import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Facts,
  SwitchRow,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { InterfaceView, WireguardStatus } from "../shared/types";
import { deleteInterface, errorMessage, serviceAction } from "./api";

export function ServiceView({
  hostId,
  item,
  status,
  onChanged,
  onDeleted,
}: {
  hostId: number;
  item: InterfaceView;
  status: WireguardStatus;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [busy, setBusy] = useState(false);

  const run = async (action: string) => {
    setBusy(true);
    try {
      await serviceAction(hostId, item.name, action);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("service.failed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("service.deleteTitle", { name: item.name }),
      description: t("service.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await deleteInterface(hostId, item.name);
      onDeleted();
    } catch (e) {
      toast.error(errorMessage(e, t("service.deleteFailed")));
      setBusy(false);
    }
  };

  const systemd = status.init === "systemd";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1 border border-border p-3 text-xs">
        <Facts>
          <span>{item.active ? t("interfaces.up") : t("interfaces.down")}</span>
          <span className="font-mono">wg-quick@{item.name}</span>
          <span>{status.init}</span>
          {status.version && <span>{status.version}</span>}
        </Facts>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || item.active}
          onClick={() => void run("start")}
        >
          {t("service.start")}
        </Button>
        <Button
          variant="outline"
          disabled={busy || !item.active}
          onClick={() => void run("stop")}
        >
          {t("service.stop")}
        </Button>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void run("restart")}
        >
          {t("service.restart")}
        </Button>
      </div>
      <SwitchRow
        label={t("service.autostart")}
        description={
          systemd ? t("service.autostartDesc") : t("service.needsSystemd")
        }
        checked={item.enabled}
        disabled={busy || !systemd}
        onChange={(value) => void run(value ? "enable" : "disable")}
      />
      {!status.ipForward && item.nat && (
        <p className="border border-border p-2 text-xs text-muted-foreground">
          {t("service.noForward")}
        </p>
      )}
      <div>
        <Button
          variant="outline"
          className="text-destructive"
          disabled={busy}
          onClick={() => void remove()}
        >
          {t("service.delete")}
        </Button>
      </div>
    </div>
  );
}
