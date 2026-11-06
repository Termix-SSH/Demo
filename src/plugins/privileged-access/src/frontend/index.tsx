import { KeyRound } from "lucide-react";
import type { TabProps, TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { AccessTab } from "./AccessTab";
import { PendingCard } from "./PendingCard";

function hostIdOf(props: TabProps): number | undefined {
  const fromData = Number(props.tab.data?.hostId);
  if (Number.isSafeInteger(fromData) && fromData > 0) return fromData;
  const fromHost = Number(props.host?.id);
  return Number.isSafeInteger(fromHost) && fromHost > 0 ? fromHost : undefined;
}

export function activate(app: TermixApp): void {
  app.registerRailItem({
    id: "access",
    icon: KeyRound,
    titleKey: "tab.title",
    kind: "tab",
    permission: "request",
  });

  app.registerTab(
    "access",
    (props: TabProps) => (
      <AccessTab key={hostIdOf(props) ?? "none"} hostId={hostIdOf(props)} />
    ),
    {
      icon: KeyRound,
      titleKey: "tab.title",
      hostless: true,
    },
  );

  app.registerDashboardCard({
    id: "pending-access",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 220,
    frame: "framed",
    component: PendingCard,
  });
}

export function deactivate(): void {}
