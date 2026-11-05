import { useCallback, useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import {
  useCurrentUser,
  useHosts,
  useTabs,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ManagerCardShell,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { CertView } from "../shared/types";
import { errorMessage, getCertificates, renewCertificate } from "./api";
import { canEditHost, certificatesEnabled } from "./enabled";
import { ExpiryBadge, expiryTone } from "./expiry";

const WARN_DAYS = 14;

/** The Certificates card Host Metrics shows in its manager cards. */
export function CertificatesCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const tabs = useTabs();
  const user = useCurrentUser();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && certificatesEnabled(host);
  const [certs, setCerts] = useState<CertView[] | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    if (!on || hostId == null) return;
    setLoading(true);
    try {
      setCerts(await getCertificates(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("certs.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [on, hostId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!host || hostId == null) return null;
  const canEdit = canEditHost(host, !!user?.isAdmin);

  const renew = async (cert: CertView) => {
    setBusy(cert.key);
    try {
      await renewCertificate(hostId, cert.key);
      toast.success(t("certs.renewDone", { name: cert.name }));
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("actions.failed")));
    } finally {
      setBusy("");
    }
  };

  return (
    <ManagerCardShell
      title={t("manager.title")}
      icon={<ShieldCheck className="size-3.5" />}
      loading={loading}
      error={failed ? { message: failed } : null}
      onRefresh={() => void load()}
      empty={!on || certs?.length === 0}
      emptyMessage={on ? t("certs.empty") : t("manager.disabled")}
    >
      <PanelList>
        {(certs ?? []).map((cert, index) => (
          <ListRow
            key={cert.key}
            stripe={index}
            icon={<ShieldCheck className="size-4" />}
            tone={expiryTone(cert.daysLeft, WARN_DAYS)}
            title={<span className="font-mono">{cert.name}</span>}
            badges={
              <>
                <ExpiryBadge daysLeft={cert.daysLeft} warnDays={WARN_DAYS} />
                <ListBadge>{cert.client}</ListBadge>
              </>
            }
            onClick={() => tabs.openTab(host as never, "certificates")}
            trailing={
              canEdit ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={busy === cert.key}
                  onClick={(e) => {
                    e.stopPropagation();
                    void renew(cert);
                  }}
                >
                  {t("certs.renew")}
                </Button>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </ManagerCardShell>
  );
}
