import type { ShellApi, TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  requestFromLegacyEvent,
  requestManage,
  useShellController,
  type Host,
  type TabType,
} from "@termix-ssh/plugin-sdk/ui";
import { DashboardTab } from "./dashboard/DashboardTab";
import { ManageTab } from "./manage/ManageTab";
import { SettingsTab } from "./settings/SettingsTab";

/** The Dashboard, wired to the shell's tab callbacks. */
export function DashboardView({
  isVisible,
  shell,
}: {
  isVisible: boolean;
  shell: ShellApi;
}) {
  return (
    <DashboardTab
      onOpenSingletonTab={(type: TabType, pendingEvent?: string) => {
        // "Add host" and friends say what to open in the Manage tab.
        const request = pendingEvent
          ? requestFromLegacyEvent(pendingEvent)
          : null;
        if (request) requestManage(request);
        else shell.openSingletonTab(type);
      }}
      onOpenTab={(host: Host, type: TabType) =>
        shell.openTab(host as never, type)
      }
      isVisible={isVisible}
    />
  );
}

export function DashboardTabType({ isVisible, shell }: TabProps) {
  return <DashboardView isVisible={isVisible} shell={shell} />;
}

export function ManageTabType() {
  return <ManageTab />;
}

/** The Settings tab. Which page opens comes from the tab's data. */
export function SettingsTabType({ tab }: TabProps) {
  const { settings } = useShellController();
  const data = tab.data;
  return (
    <SettingsTab
      {...settings}
      section={typeof data?.section === "string" ? data.section : undefined}
      sectionAt={
        typeof data?.revealAt === "number" || typeof data?.revealAt === "string"
          ? data.revealAt
          : undefined
      }
      reveal={
        typeof data?.reveal === "string"
          ? `${data.reveal}@${String(data.revealAt ?? "")}`
          : undefined
      }
    />
  );
}
