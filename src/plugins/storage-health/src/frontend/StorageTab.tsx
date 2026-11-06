import { useState } from "react";
import { HardDrive } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { EmptyState, PanelFrame, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { StoragePanel } from "./StoragePanel";

/** Drives, pools, arrays and events for one host. */
export function StorageTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  if (!host) return <EmptyState title={t("tab.noHost")} />;
  return (
    <PanelFrame>
      <PanelShell
        icon={<HardDrive className="size-4" />}
        title={label || host.name || t("tab.title")}
        status={status}
      >
        <StoragePanel
          hostId={Number(host.id)}
          isVisible={isVisible}
          onStatus={setStatus}
        />
      </PanelShell>
    </PanelFrame>
  );
}
