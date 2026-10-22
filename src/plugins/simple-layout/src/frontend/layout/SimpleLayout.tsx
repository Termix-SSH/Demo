import {
  ComponentSlot,
  ShellConfirmCapture,
  SurfaceScope,
  TabStage,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";
import { BottomBar } from "../shell/BottomBar";
import { SimplePalette } from "../shell/SimplePalette";
import { TopBar } from "../shell/TopBar";

/**
 * A layout for small setups: a top bar over the tab area, and a bottom bar
 * on phones. No sidebar, docks or split view.
 */
export function SimpleLayout() {
  const shell = useShellController();
  const mobile = shell.isMobile && !shell.isElectron;

  return (
    <div
      className="flex flex-col w-screen bg-background"
      style={{ height: "calc(100dvh - var(--termix-titlebar-height, 0px))" }}
    >
      <div className="flex flex-1 min-h-0">
        <div className="relative flex flex-col flex-1 min-w-0 overflow-hidden">
          <SurfaceScope kind="tab" className="overflow-hidden">
            <ShellConfirmCapture />
            <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
              <TopBar />
              <TabStage />
            </div>
          </SurfaceScope>
          {mobile && <BottomBar />}
        </div>
        <ComponentSlot slotId="shell.rightEdge" />
      </div>
      <SimplePalette />
    </div>
  );
}
