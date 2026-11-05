import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  NoticePanel,
  PanelList,
  PanelSearch,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { CertStatus, CertView } from "../shared/types";
import {
  errorMessage,
  getCertificates,
  installCertbot,
  renewAll,
  renewCertificate,
} from "./api";
import type { Runner } from "./CertificatesTab";
import { ExpiryBadge, expiryTone, formatDate } from "./expiry";
import { Loading } from "./Loading";

export function CertsView({
  hostId,
  status,
  runner,
  isVisible,
  onOpen,
}: {
  hostId: number;
  status: CertStatus;
  runner: Runner;
  isVisible: boolean;
  onOpen: (cert: CertView) => void;
}) {
  const { t, language } = useTranslation();
  const confirm = useConfirm();
  const [certs, setCerts] = useState<CertView[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setCerts(await getCertificates(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("certs.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const canEdit = status.canEdit;

  if (!status.certbot && !status.acmesh) {
    const manager = status.manager !== "none";
    return (
      <NoticePanel
        icon={ShieldCheck}
        title={t("install.title")}
        action={
          canEdit && status.root && manager ? (
            <Button
              disabled={runner.busy}
              onClick={async () => {
                const ok = await confirm({
                  title: t("install.confirm"),
                  description: t("install.desc"),
                  confirmLabel: t("install.button"),
                });
                if (!ok) return;
                await runner.run(
                  t("install.button"),
                  () => installCertbot(hostId),
                  t("install.done"),
                );
              }}
            >
              {runner.busy ? t("install.working") : t("install.button")}
            </Button>
          ) : undefined
        }
      >
        {manager ? t("install.hint") : t("install.noManager")}
      </NoticePanel>
    );
  }

  const needle = search.trim().toLowerCase();
  const visible = (certs ?? []).filter(
    (cert) =>
      !needle ||
      cert.name.toLowerCase().includes(needle) ||
      cert.domains.some((d) => d.toLowerCase().includes(needle)),
  );

  const renewEverything = async (dryRun: boolean) => {
    const clients = [
      status.certbot ? ("certbot" as const) : null,
      status.acmesh && !dryRun ? ("acme.sh" as const) : null,
    ].filter((client) => client !== null);
    await runner.run(
      dryRun ? t("certs.dryRun") : t("certs.renewAll"),
      async () => {
        const outputs: string[] = [];
        for (const client of clients) {
          outputs.push((await renewAll(hostId, client, dryRun)).output);
        }
        return { ok: true, output: outputs.join("\n\n") };
      },
      dryRun ? t("certs.dryRunDone") : t("certs.renewAllDone"),
    );
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("certs.search")}
          className="min-w-40 flex-1"
        />
        {canEdit && (
          <>
            {status.certbot && (
              <Button
                size="sm"
                variant="outline"
                disabled={runner.busy}
                onClick={() => void renewEverything(true)}
              >
                {t("certs.dryRun")}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              disabled={runner.busy || (certs?.length ?? 0) === 0}
              onClick={() => void renewEverything(false)}
            >
              <RefreshCw className="size-4" />
              {t("certs.renewAll")}
            </Button>
          </>
        )}
      </div>
      {runner.busy && (
        <p className="border-b border-border bg-accent-brand/5 px-3 py-2 text-xs">
          {t("actions.working")}
        </p>
      )}
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !certs ? (
        <Loading />
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {certs.length === 0 ? t("certs.empty") : t("certs.noMatch")}
        </p>
      ) : (
        <PanelList>
          {visible.map((cert, index) => (
            <ListRow
              key={cert.key}
              stripe={index}
              icon={<ShieldCheck className="size-4" />}
              tone={expiryTone(cert.daysLeft, status.warnDays)}
              title={<span className="font-mono">{cert.name}</span>}
              badges={
                <>
                  <ExpiryBadge
                    daysLeft={cert.daysLeft}
                    warnDays={status.warnDays}
                  />
                  <ListBadge>{cert.client}</ListBadge>
                  {cert.staging && (
                    <ListBadge tone="warning">{t("certs.staging")}</ListBadge>
                  )}
                </>
              }
              meta={[
                cert.expiry
                  ? t("certs.expires", {
                      date: formatDate(cert.expiry, language),
                    })
                  : "",
                cert.domains.join(", "),
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => onOpen(cert)}
              actions={
                canEdit ? (
                  <ListRowAction
                    label={t("certs.renew")}
                    tone="brand"
                    disabled={runner.busy}
                    onClick={() =>
                      void runner.run(
                        t("certs.renew"),
                        () => renewCertificate(hostId, cert.key),
                        t("certs.renewDone", { name: cert.name }),
                      )
                    }
                  >
                    <RefreshCw className="size-4" />
                  </ListRowAction>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
