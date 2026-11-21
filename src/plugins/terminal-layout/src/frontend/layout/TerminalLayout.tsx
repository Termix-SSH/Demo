import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  cn,
  ComponentSlot,
  ShellConfirmCapture,
  SurfaceScope,
  TabStage,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";
import { DockPanel } from "../shell/DockPanel";
import { prefix } from "../shell/prefix-keys";
import { seedPrefixBinding } from "../shell/prefix-binding";
import { EmptyState } from "./EmptyState";
import { KeyHelp } from "./KeyHelp";
import { PanelDock, useToolItems } from "./panels";
import { StatusBar } from "./StatusBar";
import { useStatusBarShown } from "./status-bar-store";
import { TerminalPalette } from "./TerminalPalette";
import { barTabs, useLayoutCommands } from "./use-layout-commands";

/**
 * Terminal first: the sessions fill the screen, split into panes like tmux,
 * with one status line at the bottom. Everything else is in the palette.
 */
export function TerminalLayout() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs, regions } = shell;
  const mobile = shell.isMobile && !shell.isElectron;
  const toolItems = useToolItems();
  const statusBarShown = useStatusBarShown();
  const armed = useSyncExternalStore(prefix.subscribe, prefix.isArmed);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [homeRequested, setHomeRequested] = useState(false);
  const sinkRef = useRef<HTMLSpanElement>(null);
  const floatingSinkRef = useRef<HTMLSpanElement>(null);

  const run = useLayoutCommands({
    startRename: setRenamingId,
    toggleHelp: () => setHelp((open) => !open),
  });

  useEffect(() => {
    void seedPrefixBinding().catch(() => undefined);
  }, []);

  useEffect(() => {
    prefix.setRunner(run);
    return () => prefix.setRunner(null);
  }, [run]);

  useEffect(() => {
    prefix.setSink(statusBarShown ? sinkRef.current : floatingSinkRef.current);
    return () => prefix.setSink(null);
  }, [statusBarShown]);

  useEffect(() => {
    if (!help) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !prefix.isArmed()) setHelp(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [help]);

  const finishRename = useCallback(
    (tabId: string, label: string | null) => {
      setRenamingId(null);
      if (label) tabs.rename(tabId, label);
    },
    [tabs],
  );

  const open = barTabs(tabs.topLevel);
  useEffect(() => {
    if (open.length > 0) setHomeRequested(false);
  }, [open.length]);
  const showEmpty =
    open.length === 0 &&
    (!tabs.active || tabs.active.type === "dashboard") &&
    !homeRequested;

  const showBack = mobile && !!tabs.active && tabs.active.type !== "dashboard";

  return (
    <div
      className="flex w-screen flex-col bg-background"
      style={{ height: "calc(100dvh - var(--termix-titlebar-height, 0px))" }}
    >
      <div className="isolate flex min-h-0 flex-1">
        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <SurfaceScope kind="tab" className="overflow-hidden">
            <ShellConfirmCapture />
            <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
              {showBack && (
                <div className="flex h-10 shrink-0 items-center border-b border-border">
                  <BackButton
                    onClick={() => tabs.openSingleton("dashboard")}
                    label={t("terminalLayout.back")}
                    className="border-r border-border"
                  />
                </div>
              )}
              <TabStage />
              {showEmpty && <EmptyState />}
            </div>
          </SurfaceScope>
          {help && <KeyHelp onClose={() => setHelp(false)} />}
          {!statusBarShown && (
            <span
              ref={floatingSinkRef}
              tabIndex={-1}
              aria-live="polite"
              className={cn(
                "pointer-events-none absolute right-2 bottom-2 z-20 bg-accent-brand px-2 py-1 font-mono text-[11px] text-background outline-none",
                !armed && "sr-only",
              )}
            >
              {armed ? t("terminalLayout.prefix") : ""}
            </span>
          )}
        </div>
        {!mobile && regions.right.view && (
          <DockPanel
            side="right"
            title={t(
              toolItems.find((item) => item.id === regions.right.view)
                ?.labelKey ?? "terminalLayout.panel",
            )}
            open
            width={regions.right.width}
            dragging={regions.right.dragging}
            onResizeStart={regions.right.startResize}
            onClose={() => regions.right.setView(null)}
            onResetWidth={regions.right.resetWidth}
          >
            <PanelDock view={regions.right.view} />
          </DockPanel>
        )}
        <ComponentSlot slotId="shell.rightEdge" />
      </div>
      {mobile && regions.right.view && (
        <div className="fixed inset-0 z-40 flex flex-col bg-background">
          <div className="flex h-11 items-center gap-2 border-b border-border px-3">
            <BackButton
              onClick={() => regions.right.setView(null)}
              label={t("terminalLayout.back")}
              className="-ml-3 border-r border-border"
            />
          </div>
          <div className="flex min-h-0 flex-1 flex-col">
            <PanelDock view={regions.right.view} />
          </div>
        </div>
      )}
      {(statusBarShown || mobile) && (
        <StatusBar
          armed={armed}
          renamingId={renamingId}
          onRenameDone={finishRename}
          onStartRename={setRenamingId}
          sinkRef={sinkRef}
          compact={mobile}
        />
      )}
      <TerminalPalette run={run} onHome={() => setHomeRequested(true)} />
    </div>
  );
}
