import { readButtonLayout, type ToolbarButtonLayout } from "./toolbar-settings";

export type PanelSide = "right" | "left" | "bottom";

/** How a host wants the panel bar beside its terminal. */
export interface PanelSettings {
  enabled: boolean;
  side: PanelSide;
  buttons: ToolbarButtonLayout;
}

export const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  enabled: true,
  side: "right",
  buttons: { order: [], hidden: [] },
};

/** Same as readPanelSettings, from this plugin's own host values. */
export function readPanelValues(
  values: Record<string, unknown>,
): PanelSettings {
  const side = values.terminalPanelSide;
  return {
    enabled: values.enableTerminalPanels !== false,
    side: side === "left" || side === "bottom" ? side : "right",
    buttons: readButtonLayout(values.terminalPanelButtons),
  };
}

/** The panel bar's host settings, as the host payload carries them. */
export function readPanelSettings(
  host: object | null | undefined,
): PanelSettings {
  const values =
    (
      host as {
        pluginSettings?: Record<string, Record<string, unknown>>;
      } | null
    )?.pluginSettings?.["ssh-terminal"] ?? {};
  return readPanelValues(values);
}
