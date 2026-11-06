import { useState } from "react";
import { BatteryCharging } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { EmptyState, PanelFrame, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { UpsPanel } from "./UpsPanel";

/** UPS status, history, events and commands for one host. */
export function UpsTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  if (!host) return <EmptyState title={t("tab.noHost")} />;
  return (
    <PanelFrame>
      <PanelShell
        icon={<BatteryCharging className="size-4" />}
        title={label || host.name || t("tab.title")}
        status={status}
      >
        <UpsPanel
          hostId={Number(host.id)}
          isVisible={isVisible}
          onStatus={setStatus}
        />
      </PanelShell>
    </PanelFrame>
  );
}
