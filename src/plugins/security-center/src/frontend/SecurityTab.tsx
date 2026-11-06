import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { EmptyState, PanelFrame, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { SecurityPanel } from "./SecurityPanel";

/** Keys, findings and vulnerabilities for one host. */
export function SecurityTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState("");
  if (!host) return <EmptyState title={t("tab.noHost")} />;
  return (
    <PanelFrame>
      <PanelShell
        icon={<ShieldCheck className="size-4" />}
        title={label || host.name || t("tab.title")}
        status={status}
      >
        <SecurityPanel
          hostId={Number(host.id)}
          isVisible={isVisible}
          onStatus={setStatus}
        />
      </PanelShell>
    </PanelFrame>
  );
}
