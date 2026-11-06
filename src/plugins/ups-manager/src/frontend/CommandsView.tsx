import { useCallback, useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  AlertDescription,
  Button,
  ListBadge,
  ListRow,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { SourceView, UpsCommand } from "../shared/types";
import { errorCode, errorMessage, getCommands, sendCommand } from "./api";

/** The instant commands a NUT UPS supports. Anything that cuts power asks first. */
export function CommandsView({
  hostId,
  source,
  isVisible,
  canEdit,
}: {
  hostId: number;
  source: SourceView;
  isVisible: boolean;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [commands, setCommands] = useState<UpsCommand[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      setCommands(await getCommands(hostId, source.id));
      setError("");
    } catch (e) {
      setError(
        errorCode(e) === "unsupported"
          ? t("commands.unsupported")
          : errorMessage(e, t("commands.error")),
      );
    }
  }, [hostId, source.id, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const run = async (command: UpsCommand) => {
    if (command.risk === "destructive") {
      const ok = await confirm({
        title: t("commands.confirmTitle", { name: command.name }),
        description: t("commands.confirmText", { name: source.label }),
        confirmLabel: t("commands.run"),
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(command.name);
    try {
      await sendCommand(hostId, source.id, command.name);
      toast.success(t("commands.done", { name: command.name }));
    } catch (e) {
      toast.error(
        errorCode(e) === "nut-login"
          ? t("commands.needLogin")
          : errorMessage(e, t("common.failed")),
      );
    } finally {
      setBusy("");
    }
  };

  if (error) {
    return (
      <div className="p-3">
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!commands) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }
  return (
    <div className="flex flex-col">
      {!source.hasSecrets && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("commands.needLogin")}
        </p>
      )}
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">
            {t("commands.empty")}
          </p>
        }
      >
        {commands.map((command, index) => (
          <ListRow
            key={command.name}
            stripe={index}
            tone={command.risk === "destructive" ? "warning" : undefined}
            title={command.name}
            meta={command.description}
            badges={
              command.risk === "destructive" ? (
                <ListBadge tone="warning">{t("commands.risky")}</ListBadge>
              ) : undefined
            }
            trailing={
              <Button
                size="xs"
                variant="outline"
                disabled={!canEdit || !source.hasSecrets || busy !== ""}
                onClick={() => void run(command)}
              >
                <Play className="size-3" />
                {t("commands.run")}
              </Button>
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
