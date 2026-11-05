import { PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { useCallback, useEffect, useRef } from "react";
import { Network } from "lucide-react";
import {
  useTranslation,
  type DashboardCardProps,
  type TabProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { NetworkGraphCard } from "./NetworkGraphCard";

const VIEW_ID = "network_graph";

function GraphTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  return (
    <PanelShell
      icon={<Network className="size-4" />}
      title={t("dashboard.networkGraph")}
      scroll={false}
    >
      <NetworkGraphCard embedded={false} isVisible={isVisible} />
    </PanelShell>
  );
}

function GraphCard({ isVisible, shell }: DashboardCardProps) {
  // A stable callback lets the memoized graph skip dashboard re-renders.
  const shellRef = useRef(shell);
  useEffect(() => {
    shellRef.current = shell;
  });
  const openInNewTab = useCallback(
    () => shellRef.current.openSingletonTab(VIEW_ID),
    [],
  );
  return (
    <NetworkGraphCard
      embedded={true}
      isVisible={isVisible}
      onOpenInNewTab={openInNewTab}
    />
  );
}

export function activate(app: TermixApp): void {
  app.registerTab(VIEW_ID, GraphTab, {
    icon: Network,
    titleKey: "nav.networkGraph",
    singleton: true,
    hostless: true,
  });

  app.registerRailItem({
    id: VIEW_ID,
    icon: Network,
    titleKey: "nav.networkGraph",
    kind: "tab",
    after: "local-terminal",
    permission: "use",
  });

  app.registerDashboardCard({
    id: VIEW_ID,
    titleKey: "dashboard.networkGraph",
    defaultHeight: 350,
    component: GraphCard,
  });
}
