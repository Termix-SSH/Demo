import { usePluginUiPreferences } from "@termix-ssh/plugin-sdk/frontend";
import { useInterfaceDefaults } from "./interface-defaults";

interface RailPinPrefs extends Record<string, unknown> {
  /** Plugin apps live in All apps unless pinned. Off in Advanced. */
  railAppsMenu?: boolean;
  railPins?: string[];
  /** The user has picked their own pins, so defaults no longer apply. */
  railPinsSet?: boolean;
}

interface PinnableItem {
  id: string;
  pluginId?: string;
  alwaysVisible?: boolean;
  hideable?: boolean;
  simplePreset?: boolean;
}

/**
 * Which plugin apps sit on the rail. Core items always do. Until the user
 * pins something, the admin's defaults apply, else apps that ask to stay in
 * Simple. A locked admin template wins over the user.
 */
export function useRailPins() {
  const { values, set } = usePluginUiPreferences<RailPinPrefs>();
  const { template } = useInterfaceDefaults();
  const locked = !!template?.locked;
  const appsMenu = locked
    ? template!.preset !== "advanced"
    : values.railAppsMenu !== false;
  const chosen: string[] | null = locked
    ? template!.pins
    : values.railPinsSet
      ? (values.railPins ?? [])
      : (template?.pins ?? null);

  const isPinned = (item: PinnableItem) =>
    !appsMenu ||
    !item.pluginId ||
    !!item.alwaysVisible ||
    item.hideable === false ||
    (chosen ? chosen.includes(item.id) : !!item.simplePreset);

  return {
    appsMenu,
    locked,
    isPinned,
    /** Pins or unpins one item, keeping the rest as they show now. */
    toggle: (item: PinnableItem, items: PinnableItem[]) => {
      if (locked) return;
      const current = items
        .filter((entry) => entry.pluginId && isPinned(entry))
        .map((entry) => entry.id);
      const next = current.includes(item.id)
        ? current.filter((id) => id !== item.id)
        : [...current, item.id];
      set("railPins", next);
      set("railPinsSet", true);
    },
  };
}
