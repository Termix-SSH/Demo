import { ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { InfoGrid, ListBadge, SectionCard } from "@termix-ssh/plugin-sdk/ui";
import type { CertInfo } from "../shared/types";
import { ExpiryBadge, formatDate } from "./expiry";

/** One certificate of a chain, as a section of a TileStack. */
export function ChainCard({
  cert,
  index,
  warnDays,
}: {
  cert: CertInfo;
  index: number;
  warnDays: number;
}) {
  const { t, language } = useTranslation();
  const name = cert.subject.match(/CN\s*=\s*([^,/]+)/)?.[1]?.trim();
  return (
    <SectionCard
      title={
        index === 0 ? t("inspect.leaf") : t("inspect.intermediate", { index })
      }
      icon={<ShieldCheck />}
      action={
        <span className="flex items-center gap-1">
          {cert.selfSigned && (
            <ListBadge tone="warning">{t("inspect.selfSigned")}</ListBadge>
          )}
          <ExpiryBadge daysLeft={cert.daysLeft} warnDays={warnDays} />
        </span>
      }
    >
      <InfoGrid
        className="py-2"
        items={[
          { label: t("inspect.name"), value: name ?? cert.subject, mono: true },
          { label: t("inspect.issuer"), value: cert.issuer },
          {
            label: t("inspect.domains"),
            value: cert.sans.join(", "),
            mono: true,
          },
          {
            label: t("inspect.validFrom"),
            value: formatDate(cert.notBefore, language),
          },
          {
            label: t("inspect.validTo"),
            value: formatDate(cert.notAfter, language),
          },
          { label: t("inspect.keyType"), value: cert.keyType },
          { label: t("inspect.serial"), value: cert.serial, mono: true },
          {
            label: t("inspect.fingerprint"),
            value: cert.fingerprint,
            mono: true,
          },
        ]}
      />
    </SectionCard>
  );
}
