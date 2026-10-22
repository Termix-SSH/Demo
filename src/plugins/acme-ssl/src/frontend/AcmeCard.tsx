import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import type { AcmeStatus } from "./AcmeStatusSetting";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days until a date, never below zero. */
export function daysLeft(iso: string, now = Date.now()): number {
  return Math.max(0, Math.floor((new Date(iso).getTime() - now) / DAY_MS));
}

/** Dashboard card: the HTTPS certificate and how long it has left. */
export function AcmeCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const allowed = usePermission("manage");
  const [status, setStatus] = useState<AcmeStatus | null>(null);
  const [failed, setFailed] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus((await api.get<AcmeStatus>("/status")).data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [api]);

  useEffect(() => {
    if (isVisible && allowed) void load();
  }, [isVisible, allowed, load]);

  async function request() {
    setRequesting(true);
    try {
      await api.post("/request");
      toast.success(t("status.issued"));
    } catch (error) {
      const data = (error as { response?: { data?: { error?: string } } })
        ?.response?.data;
      toast.error(data?.error ?? String(error));
    } finally {
      setRequesting(false);
      await load();
    }
  }

  if (!allowed) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.denied")}</p>
    );
  }
  if (failed || !status) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {failed ? t("card.failed") : t("card.loading")}
      </p>
    );
  }

  const cert = status.tls.certificate;
  const days = cert ? daysLeft(cert.notAfter) : null;
  const tone =
    days === null
      ? "text-muted-foreground"
      : days < 3
        ? "text-destructive"
        : days < 14
          ? "text-warning"
          : "text-accent-brand";

  return (
    <div className="flex flex-col gap-1.5 p-3 text-xs">
      <div className="flex items-center gap-2">
        <span className={`text-base font-bold ${tone}`}>
          {days === null
            ? t("status.none")
            : t("card.daysLeft", { count: days })}
        </span>
      </div>
      {cert && (
        <>
          <span className="truncate text-muted-foreground">
            {t("status.names", { names: cert.names.join(", ") || "-" })}
          </span>
          <span className="truncate text-muted-foreground">
            {t("status.issuer", { issuer: cert.issuer })}
          </span>
        </>
      )}
      {status.state.lastError && (
        <span className="text-destructive">
          {t("status.lastError", { error: status.state.lastError })}
        </span>
      )}
      {status.missing ? (
        <span className="text-muted-foreground">{t("status.missing")}</span>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start rounded-none"
          disabled={requesting}
          onClick={() => void request()}
        >
          {requesting ? t("status.requesting") : t("status.request")}
        </Button>
      )}
    </div>
  );
}
