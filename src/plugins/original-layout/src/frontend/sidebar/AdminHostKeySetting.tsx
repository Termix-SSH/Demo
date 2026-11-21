import { useEffect, useState } from "react";
import * as sdkUi from "@termix-ssh/plugin-sdk/ui";
import { SettingRow } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import { AdminToggle } from "./AdminSettingsShared";

type HostKeyPolicyApi = {
  getHostKeyPolicy: () => Promise<{ trustOnFirstUse: boolean }>;
  updateHostKeyPolicy: (
    trustOnFirstUse: boolean,
  ) => Promise<{ trustOnFirstUse: boolean }>;
};

/**
 * Needs Termix 26.11.2. Read through the namespace so an older core, which
 * lacks it, just hides the switch.
 */
export function hostKeyPolicyApi(): HostKeyPolicyApi | null {
  try {
    const api = sdkUi as unknown as Partial<HostKeyPolicyApi>;
    return typeof api.getHostKeyPolicy === "function" &&
      typeof api.updateHostKeyPolicy === "function"
      ? (api as HostKeyPolicyApi)
      : null;
  } catch {
    return null;
  }
}

/** Lets connections with nobody to ask trust a host's first key. */
export function AdminHostKeySetting() {
  const { t } = useTranslation();
  const api = hostKeyPolicyApi();
  const [trust, setTrust] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    api
      .getHostKeyPolicy()
      .then((state) => {
        if (cancelled) return;
        setTrust(state.trustOnFirstUse);
        setLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!api) return null;

  const toggle = async () => {
    setSaving(true);
    try {
      const state = await api.updateHostKeyPolicy(!trust);
      setTrust(state.trustOnFirstUse);
    } catch {
      toast.error(t("admin.hostKeyTrustFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <SettingRow
      label={t("admin.hostKeyTrust")}
      description={t("admin.hostKeyTrustDesc")}
    >
      <AdminToggle
        on={trust}
        onToggle={() => void toggle()}
        disabled={!loaded || saving}
      />
    </SettingRow>
  );
}
