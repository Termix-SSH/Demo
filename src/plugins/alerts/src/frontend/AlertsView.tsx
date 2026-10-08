import { useEffect, useMemo, useState } from "react";
import { Bell, Radio, Route } from "lucide-react";
import { usePluginApi, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { TabStrip } from "@termix-ssh/plugin-sdk/ui";
import { createAlertsApi } from "./api";
import { ChannelsView } from "./ChannelsView";
import { InboxView } from "./InboxView";
import { RulesView } from "./RulesView";
import type { AlertsStore } from "./store";

import type { Section, SectionRequests } from "./sections";

const SECTIONS: Array<{ id: Section; icon: typeof Bell; labelKey: string }> = [
  { id: "inbox", icon: Bell, labelKey: "sections.inbox" },
  { id: "channels", icon: Radio, labelKey: "sections.channels" },
  { id: "rules", icon: Route, labelKey: "sections.rules" },
];

export function AlertsView({
  store,
  sections,
}: {
  store: AlertsStore;
  sections: SectionRequests;
}) {
  const { t } = useTranslation();
  const client = usePluginApi();
  const api = useMemo(() => createAlertsApi(client), [client]);
  const [section, setSection] = useState<Section>(
    () => sections.take() ?? "inbox",
  );

  useEffect(
    () =>
      sections.subscribe((requested) => {
        sections.take();
        setSection(requested);
      }),
    [sections],
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 h-full bg-background">
      <div className="shrink-0 border-b border-border px-1">
        <TabStrip
          tabs={SECTIONS.map(({ id, icon: Icon, labelKey }) => ({
            id,
            label: t(labelKey),
            icon: <Icon className="size-3.5" />,
          }))}
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
        />
      </div>
      <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
        {section === "inbox" && <InboxView store={store} />}
        {section === "channels" && <ChannelsView api={api} />}
        {section === "rules" && <RulesView api={api} />}
      </div>
    </div>
  );
}
