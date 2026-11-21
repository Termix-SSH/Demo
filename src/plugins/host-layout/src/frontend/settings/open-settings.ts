import { useShellController } from "@termix-ssh/plugin-sdk/ui";

/** Opens the Settings tab on one page. */
export function useOpenSettingsPage() {
  const { tabs } = useShellController();
  return (section: string) =>
    tabs.openSingleton("settings", undefined, undefined, { section });
}
