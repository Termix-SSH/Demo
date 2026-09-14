import { useCallback } from "react";
import {
  useAreaPreferences,
  useUiPreferencesContext,
} from "@/contexts/UiPreferencesContext";
import type { UiAreaKey, UiAreaPreferences } from "@/types/ui-preferences";
import type { PanelDensity, PanelViewMode } from "@/components/panel-layout";

/** Areas whose preferences are the shared viewMode + density pair. */
type PanelAreaKey = {
  [K in UiAreaKey]: UiAreaPreferences[K] extends {
    viewMode: PanelViewMode;
    density: PanelDensity;
  }
    ? K
    : never;
}[UiAreaKey];

/**
 * Grid or list and row height for one panel, read from the active preset and
 * written back as an override.
 *
 * Panels used to hold this in useState, which reset whenever a tab was closed
 * and ignored the Simple/Advanced presets entirely. Going through the
 * preferences context means one place debounces, caches and syncs it.
 */
export function usePanelView(area: PanelAreaKey) {
  const prefs = useAreaPreferences(area) as {
    viewMode: PanelViewMode;
    density: PanelDensity;
  };
  const ctx = useUiPreferencesContext();

  const setView = useCallback(
    (next: PanelViewMode) => {
      ctx?.setOverride(area, "viewMode" as never, next as never);
    },
    [ctx, area],
  );

  const setDensity = useCallback(
    (next: PanelDensity) => {
      ctx?.setOverride(area, "density" as never, next as never);
    },
    [ctx, area],
  );

  return {
    view: prefs.viewMode,
    density: prefs.density,
    compact: prefs.density === "compact",
    setView,
    setDensity,
  };
}
