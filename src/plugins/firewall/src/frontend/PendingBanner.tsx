import { useEffect, useState } from "react";
import { Timer } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Alert, AlertDescription, Button } from "@termix-ssh/plugin-sdk/ui";
import type { PendingChange } from "../shared/types";
import { errorCode, errorMessage, keepPending, undoPending } from "./api";
import { pendingLabel } from "./format";

/** The change waiting for Keep, with the time left before the host undoes it. */
export function PendingBanner({
  hostId,
  pending,
  canEdit,
  onDone,
  compact,
}: {
  hostId: number;
  pending: PendingChange;
  canEdit: boolean;
  onDone: () => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const left = Math.max(0, Math.ceil((pending.expiresAt - now) / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (left === 0) {
      const timer = setTimeout(onDone, 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [left, onDone]);

  const act = async (keep: boolean) => {
    setBusy(true);
    try {
      if (keep) await keepPending(hostId);
      else await undoPending(hostId);
      toast.success(keep ? t("pending.kept") : t("pending.undone"));
    } catch (e) {
      toast.error(
        errorCode(e) === "gone"
          ? t("pending.gone")
          : errorMessage(e, t("common.failed")),
      );
    } finally {
      setBusy(false);
      onDone();
    }
  };

  const reach =
    pending.reachable === true
      ? t("pending.reachable")
      : pending.reachable === false
        ? t("pending.unreachable")
        : t("pending.unknown");

  return (
    <Alert
      className={`rounded-none border-warning/40 ${compact ? "p-2 text-xs" : "text-sm"}`}
    >
      <AlertDescription className="block text-inherit">
        <div className="flex flex-wrap items-center gap-2">
          <Timer className="size-4 shrink-0 text-warning" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{pendingLabel(pending.label, t)}</div>
            <div className="text-xs text-muted-foreground">
              {left > 0
                ? t("pending.left", { seconds: left })
                : t("pending.expired")}{" "}
              | {reach}
            </div>
          </div>
          {canEdit && left > 0 && (
            <div className="flex gap-1.5">
              <Button size="sm" disabled={busy} onClick={() => void act(true)}>
                {t("pending.keep")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() => void act(false)}
              >
                {t("pending.undo")}
              </Button>
            </div>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
