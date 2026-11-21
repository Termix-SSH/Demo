import { useEffect, useState } from "react";
import {
  SettingRow,
  getHttpsSettings,
  updateHttpsSettings,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import { AdminToggle } from "./AdminSettingsShared";

/** Redirect plain HTTP to HTTPS and send HSTS. Only works while HTTPS is on. */
export function AdminHttpsSetting() {
  const { t } = useTranslation();
  const [forceHttps, setForceHttps] = useState(false);
  const [tlsEnabled, setTlsEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getHttpsSettings()
      .then((state) => {
        if (cancelled) return;
        setForceHttps(state.forceHttps);
        setTlsEnabled(state.tlsEnabled);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = async () => {
    setSaving(true);
    try {
      const state = await updateHttpsSettings(!forceHttps);
      setForceHttps(state.forceHttps);
    } catch {
      toast.error(t("admin.forceHttpsFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <SettingRow
        label={t("admin.forceHttps")}
        description={t("admin.forceHttpsDesc")}
      >
        <AdminToggle
          on={forceHttps}
          onToggle={() => void toggle()}
          disabled={!loaded || saving}
        />
      </SettingRow>
      {loaded && forceHttps && !tlsEnabled && (
        <p className="text-[10px] text-muted-foreground">
          {t("admin.forceHttpsNoTls")}
        </p>
      )}
    </>
  );
}
