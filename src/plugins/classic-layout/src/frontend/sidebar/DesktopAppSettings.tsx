import { useEffect, useState } from "react";
import { FakeSwitch, SettingRow, isElectron } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";

type DesktopBridge = {
  invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>;
};

function bridge(): DesktopBridge | undefined {
  return (window as { electronAPI?: DesktopBridge }).electronAPI;
}

/** Desktop only: what closing the window does. */
export function DesktopAppSettings() {
  const { t } = useTranslation();
  const [closeToTray, setCloseToTray] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isElectron()) return;
    bridge()
      ?.invoke?.("get-desktop-settings")
      .then((settings) => {
        const value = (settings as { closeToTray?: boolean } | null)
          ?.closeToTray;
        setCloseToTray(value !== false);
      })
      .catch(() => setCloseToTray(null));
  }, []);

  if (!isElectron() || closeToTray === null) return null;

  const change = async (next: boolean) => {
    setCloseToTray(next);
    try {
      await bridge()?.invoke?.("save-desktop-settings", { closeToTray: next });
    } catch {
      setCloseToTray(!next);
      toast.error(t("newUi.sidebar.userProfile.closeToTraySaveFailed"));
    }
  };

  return (
    <SettingRow
      label={t("newUi.sidebar.userProfile.closeToTray")}
      description={t("newUi.sidebar.userProfile.closeToTrayDesc")}
    >
      <FakeSwitch
        checked={closeToTray}
        onChange={(next) => void change(next)}
      />
    </SettingRow>
  );
}
