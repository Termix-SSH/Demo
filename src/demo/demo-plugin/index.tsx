import { RotateCcw } from "lucide-react";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import { resetDemo } from "../backend/store";
import { LoginHint, ResetSetting } from "./components";

/**
 * The demo's own bits, added through the same plugin API the real plugins
 * use so nothing in the copied Termix code has to change.
 */

export function activate(app: TermixApp): void {
  app.registerLoginMethod({
    id: "demo-hint",
    titleKey: "loginHint",
    placement: "inline",
    component: LoginHint,
  });
  app.registerSettingsComponent("reset", ResetSetting);
  app.registerPaletteEntry({
    id: "reset-demo",
    titleKey: "paletteReset",
    icon: RotateCcw,
    keywords: ["reset", "demo", "start over"],
    scope: "global",
    run: async (shell) => {
      const ok = await shell.confirm?.({
        title: app.t("resetConfirmTitle"),
        description: app.t("resetConfirmDescription"),
        confirmLabel: app.t("resetButton"),
      });
      if (ok) resetDemo();
    },
  });
}
