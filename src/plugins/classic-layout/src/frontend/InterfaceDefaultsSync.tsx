import { useEffect, useRef } from "react";
import {
  applyPresetSideEffects,
  useUiPreferencesContext,
} from "@termix-ssh/plugin-sdk/ui";
import { usePluginUiPreferences } from "@termix-ssh/plugin-sdk/frontend";
import { useInterfaceDefaults } from "./interface-defaults";

/**
 * Applies the admin's interface defaults once per session: a locked template
 * always sets the look, an unlocked one only for someone who has not set up
 * their own view yet. Rail pins follow the template in useRailPins.
 */
export function InterfaceDefaultsSync() {
  const ctx = useUiPreferencesContext();
  const { template, loaded } = useInterfaceDefaults();
  const { values } = usePluginUiPreferences<{ railPinsSet?: boolean }>();
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !loaded || !ctx?.loaded) return;
    done.current = true;
    if (!template) return;
    const { onboarding, preset } = ctx.preferences;
    const fresh =
      !onboarding.completedAt && !onboarding.skipped && !values.railPinsSet;
    if ((template.locked || fresh) && preset !== template.preset) {
      ctx.setPreset(template.preset);
      void applyPresetSideEffects(template.preset);
    }
  }, [ctx, loaded, template, values.railPinsSet]);

  return null;
}

/** Whether the admin locked this user's look, for pickers to disable themselves. */
export function useInterfaceLocked() {
  const { template } = useInterfaceDefaults();
  return !!template?.locked;
}
