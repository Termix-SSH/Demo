import { useEffect, useState } from "react";
import { Info, Settings2, ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  InfoGrid,
  PanelShell,
  SectionCard,
  TileStack,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { CertStatus, CertView, InspectResult } from "../shared/types";
import {
  deleteCertificate,
  errorMessage,
  inspectFile,
  renewCertificate,
  revokeCertificate,
} from "./api";
import type { Runner } from "./CertificatesTab";
import { ChainCard } from "./ChainView";
import { ExpiryBadge, formatDate } from "./expiry";

export function CertDetail({
  hostId,
  cert,
  status,
  runner,
  onBack,
}: {
  hostId: number;
  cert: CertView;
  status: CertStatus;
  runner: Runner;
  onBack: () => void;
}) {
  const { t, language } = useTranslation();
  const confirm = useConfirm();
  const [chain, setChain] = useState<InspectResult | null>(null);
  const [failed, setFailed] = useState("");
  const canEdit = status.canEdit;

  useEffect(() => {
    if (!cert.path) return;
    inspectFile(hostId, cert.path)
      .then(setChain)
      .catch((e) => setFailed(errorMessage(e, t("inspect.failed"))));
  }, [hostId, cert.path, t]);

  const revoke = async () => {
    const ok = await confirm({
      title: t("certs.revokeTitle", { name: cert.name }),
      description: t("certs.revokeDesc"),
      confirmLabel: t("certs.revoke"),
      destructive: true,
    });
    if (!ok) return;
    const done = await runner.run(
      t("certs.revoke"),
      () => revokeCertificate(hostId, cert.key),
      t("certs.revokeDone", { name: cert.name }),
    );
    if (done) onBack();
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("certs.deleteTitle", { name: cert.name }),
      description: t("certs.deleteDesc"),
      confirmLabel: t("certs.delete"),
      destructive: true,
    });
    if (!ok) return;
    const done = await runner.run(
      t("certs.delete"),
      () => deleteCertificate(hostId, cert.key),
      t("certs.deleteDone", { name: cert.name }),
    );
    if (done) onBack();
  };

  return (
    <PanelShell
      icon={<ShieldCheck className="size-4" />}
      leading={<BackButton onClick={onBack} label={t("common.back")} />}
      title={<span className="font-mono">{cert.name}</span>}
      status={
        <ExpiryBadge daysLeft={cert.daysLeft} warnDays={status.warnDays} />
      }
    >
      <TileStack>
        <SectionCard title={t("certs.details")} icon={<Info />}>
          <InfoGrid
            className="py-2"
            items={[
              { label: t("certs.client"), value: cert.client },
              {
                label: t("inspect.domains"),
                value: cert.domains.join(", "),
                mono: true,
              },
              {
                label: t("inspect.validTo"),
                value: formatDate(cert.expiry, language),
              },
              { label: t("inspect.keyType"), value: cert.keyType },
              { label: t("certs.path"), value: cert.path, mono: true },
              {
                label: t("certs.authority"),
                value: cert.staging ? t("certs.staging") : "",
              },
            ]}
          />
        </SectionCard>

        {canEdit && (
          <SectionCard title={t("certs.manage")} icon={<Settings2 />}>
            <div className="flex flex-wrap gap-2 py-2">
              <Button
                size="sm"
                disabled={runner.busy}
                onClick={() =>
                  void runner.run(
                    t("certs.renew"),
                    () => renewCertificate(hostId, cert.key),
                    t("certs.renewDone", { name: cert.name }),
                  )
                }
              >
                {t("certs.renew")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={runner.busy}
                onClick={() =>
                  void runner.run(
                    t("certs.forceRenew"),
                    () => renewCertificate(hostId, cert.key, { force: true }),
                    t("certs.renewDone", { name: cert.name }),
                  )
                }
              >
                {t("certs.forceRenew")}
              </Button>
              {cert.client === "certbot" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={runner.busy}
                  onClick={() =>
                    void runner.run(
                      t("certs.dryRun"),
                      () =>
                        renewCertificate(hostId, cert.key, { dryRun: true }),
                      t("certs.dryRunDone"),
                    )
                  }
                >
                  {t("certs.dryRun")}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={runner.busy}
                onClick={() => void revoke()}
              >
                {t("certs.revoke")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                disabled={runner.busy}
                onClick={() => void remove()}
              >
                {t("certs.delete")}
              </Button>
            </div>
          </SectionCard>
        )}

        {cert.path && !chain && (
          <div className="px-3 py-2">
            {failed ? (
              <p className="text-xs text-destructive">{failed}</p>
            ) : (
              <LoadingState />
            )}
          </div>
        )}
        {chain?.chain.map((item, index) => (
          <ChainCard
            key={item.fingerprint || index}
            cert={item}
            index={index}
            warnDays={status.warnDays}
          />
        ))}
      </TileStack>
    </PanelShell>
  );
}
