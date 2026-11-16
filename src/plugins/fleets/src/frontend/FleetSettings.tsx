import { usePluginId, useTabs } from "@termix-ssh/plugin-sdk/frontend";

export function readFleetSettings(values: Record<string, unknown>) {
  return { alwaysShowActions: values.alwaysShowActions === true };
}

/** Opens this plugin's page in Settings. */
export function useOpenSettingsPage() {
  const tabs = useTabs();
  const pluginId = usePluginId();
  return () =>
    tabs.openSingletonTab("settings", {
      data: { section: `plugin:${pluginId}` },
    });
}
