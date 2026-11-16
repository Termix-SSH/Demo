import type { TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { HomeTab } from "./dashboard/HomeTab";
import { HostsTab } from "./manage/HostsTab";
import { SettingsTab } from "./settings/SettingsTab";

export function HomeTabType() {
  return <HomeTab />;
}

export function HostsTabType() {
  return <HostsTab />;
}

/** Which page opens comes from the tab's data. */
export function SettingsTabType({ tab }: TabProps) {
  const section = tab.data?.section;
  const at = tab.data?.revealAt;
  return (
    <SettingsTab
      section={typeof section === "string" ? section : undefined}
      sectionAt={
        typeof at === "number" || typeof at === "string" ? at : undefined
      }
    />
  );
}
