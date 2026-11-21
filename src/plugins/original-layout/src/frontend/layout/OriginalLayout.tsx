import { lazy, Suspense, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SurfaceScope,
  ComponentSlot,
  isCoreRailView,
  railItemLabel,
  getTabType,
  getPanel,
  usePanels,
  PluginViewPlaceholder,
  type TabType,
  type RailItemDef,
  ShellConfirmCapture,
  useShellController,
  TabStage,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ChevronRight } from "lucide-react";
import { MobileBar } from "../shell/MobileBar";
import { TabBar } from "../shell/TabBar";
import { FloatingSidebar } from "../original/FloatingSidebar";
import { HostsView } from "../original/HostsView";
import { ToolsSidebar } from "../original/ToolsSidebar";
import { applyLook } from "../original/look-css";
import { floatingPanel, pageStyle, reopenStrip } from "../original/styles";
import { OriginalPalette } from "./OriginalPalette";
const QuickConnectPanel = lazy(() =>
  import("../sidebar/QuickConnectPanel").then((m) => ({
    default: m.QuickConnectPanel,
  })),
);
const CredentialsPanel = lazy(() =>
  import("../sidebar/CredentialsPanel").then((m) => ({
    default: m.CredentialsPanel,
  })),
);
const ConnectionsPanel = lazy(() =>
  import("../sidebar/ConnectionsPanel").then((m) => ({
    default: m.ConnectionsPanel,
  })),
);

function SidebarPanelFallback() {
  return <LoadingState />;
}

/**
 * The Termix layout from before 2.3.0: a floating host sidebar, a floating
 * tab bar over a framed tab area, and a tools sidebar on the right.
 */
export function OriginalLayout() {
  const { t } = useTranslation();
  const shell = useShellController();
  const registeredPanels = usePanels();
  const { tabs, regions, hosts, isMobile } = shell;
  const { left, right } = regions;
  useEffect(() => applyLook(), []);
  const closeOnMobile = () => {
    if (isMobile) left.setOpen(false);
  };

  // Every panel gets its own surface, so its inline views and confirms stay
  // inside it. Only the left dock widens for them.
  const panelScope = (
    view: string,
    owned: boolean,
    shown: boolean,
    children: React.ReactNode,
    className = "",
  ) => (
    <SurfaceScope
      key={view}
      kind="panel"
      onEditingChange={owned ? regions.scopeEditingSetter(view) : undefined}
      className={`${shown ? "" : "hidden"} ${className}`}
    >
      {children}
    </SurfaceScope>
  );

  /**
   * Sidebar panel content, shared between the desktop sidebar, the mobile
   * sheet and the right dock. Takes the view rather than reading the left
   * dock's so both docks can render from the same code.
   *
   * `owned` marks the dock responsible for the panels that stay mounted while
   * hidden (hosts, credentials, fleets). Only one dock may own them, otherwise
   * two live instances fight over the shared editing state.
   */
  const renderSidebarPanels = (railView: string, owned = true) => (
    <Suspense fallback={<SidebarPanelFallback />}>
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        {owned && (
          <>
            {panelScope(
              "hosts",
              owned,
              railView === "hosts",
              <HostsView
                tree={hosts.tree}
                loading={hosts.loading}
                onOpen={(host, type, options) => {
                  tabs.connectHost(host, type, options);
                  closeOnMobile();
                }}
                onEdit={hosts.edit}
              />,
            )}
            {panelScope(
              "credentials",
              owned,
              railView === "credentials",
              <CredentialsPanel
                onEditingChange={regions.panelEditingSetter("credentials")}
                active={railView === "credentials"}
              />,
            )}
          </>
        )}

        {railView === "quick-connect" &&
          panelScope(
            "quick-connect",
            owned,
            true,
            <QuickConnectPanel
              onConnect={(host, type) => {
                tabs.open(host, type);
                closeOnMobile();
              }}
            />,
          )}

        {registeredPanels.map((panel) => {
          const shown = railView === panel.id;
          // A kept-mounted panel lives in the owning dock only, so two live
          // copies never fight over the same state.
          if (panel.keepMounted ? !owned : !shown) return null;
          const Panel = panel.component;
          return panelScope(
            panel.id,
            owned,
            shown,
            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
              <Panel
                targetTab={tabs.targetTerminal}
                active={shown}
                shell={shell.panelCallbacks}
                setEditing={
                  owned ? regions.panelEditingSetter(panel.id) : () => undefined
                }
                activeTabType={tabs.active?.type ?? undefined}
                placement={owned ? "left" : "right"}
              />
            </div>,
          );
        })}

        {!isCoreRailView(railView) && !getPanel(railView) && (
          <PluginViewPlaceholder kind="panel" viewId={railView} compact />
        )}

        {railView === "connections" &&
          panelScope(
            "connections",
            owned,
            true,
            <div className="flex-1 min-h-0 overflow-y-auto">
              <ConnectionsPanel
                tabs={tabs.list}
                activeTabId={tabs.activeId}
                allHosts={hosts.list}
                backgroundTabRecords={tabs.background}
                onSwitchToTab={(tabId) => {
                  tabs.setActive(tabId);
                  closeOnMobile();
                }}
                onCloseTab={tabs.close}
                onReopenTab={(record, restoredSessionId) => {
                  const host = record.hostId
                    ? hosts.list.find((h) => h.id === String(record.hostId))
                    : undefined;
                  if (!host && !getTabType(record.tabType)?.hostless) return;
                  tabs.setBackground((prev) =>
                    prev.filter((r) => r.id !== record.id),
                  );
                  if (host) {
                    const effectiveSessionId =
                      restoredSessionId ?? record.backendSessionId ?? null;
                    tabs.open(host, record.tabType as TabType, {
                      instanceId: record.id,
                      restoredSessionId: effectiveSessionId,
                      savedLabel: record.label,
                    });
                  } else {
                    tabs.openSingleton(record.tabType as TabType);
                  }
                  closeOnMobile();
                }}
                onForgetBackground={(recordId) => {
                  tabs.setBackground((prev) =>
                    prev.filter((r) => r.id !== recordId),
                  );
                }}
                onRenameTab={tabs.rename}
                onReorderTabs={tabs.setList}
              />
            </div>,
          )}
      </div>
    </Suspense>
  );

  const sidebarPanelContent = renderSidebarPanels(left.view);

  // Anything picked from the apps menu: a tab opens, a panel takes the sidebar.
  const openApp = (item: RailItemDef) => {
    if (item.kind === "tab") {
      tabs.openSingleton(item.id as TabType);
      closeOnMobile();
      return;
    }
    left.setView(item.id);
    left.setOpen(true);
  };
  const viewTitle =
    left.view === "hosts" ? undefined : railItemLabel(left.view, t);

  const sidebar = (fill: boolean) => (
    <FloatingSidebar
      width={left.width}
      editing={left.editing}
      dragging={left.dragging}
      fill={fill}
      viewTitle={viewTitle}
      onBack={() => left.setView("hosts")}
      onOpenApp={openApp}
      onCollapse={() => left.setOpen(false)}
      onResetWidth={fill ? undefined : left.resetWidth}
      onResizeStart={fill ? undefined : left.startResize}
    >
      {sidebarPanelContent}
    </FloatingSidebar>
  );

  return (
    <div
      className="flex flex-col w-screen"
      style={{
        ...pageStyle,
        height: "calc(100dvh - var(--termix-titlebar-height, 0px))",
      }}
    >
      {/* Isolated so inline views and prompts in the sidebars stay under
          dialogs on the body. */}
      <div
        className={`isolate flex flex-1 min-h-0 gap-2 ${isMobile ? "" : "p-2"}`}
      >
        {!isMobile &&
          (left.open ? (
            sidebar(false)
          ) : (
            <button
              type="button"
              onClick={() => left.setOpen(true)}
              title={t("nav.openSidebar")}
              aria-label={t("nav.openSidebar")}
              className={`${reopenStrip} -my-2 -ml-2 w-2.5 rounded-r-[0.5rem] border-l-0`}
            >
              <ChevronRight className="size-2.5" />
            </button>
          ))}

        {isMobile && (
          <Sheet open={left.open} onOpenChange={left.setOpen}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className={`flex min-h-0 max-w-full flex-col gap-0 border-0 bg-background p-2 ${left.editing ? "w-screen" : "w-[min(85vw,360px)]"}`}
              style={{
                height: "calc(100dvh - var(--termix-titlebar-height, 0px))",
              }}
            >
              {sidebar(true)}
            </SheetContent>
          </Sheet>
        )}

        <div className="isolate relative flex flex-col flex-1 min-w-0 overflow-hidden">
          <SurfaceScope kind="tab" className="overflow-hidden">
            <ShellConfirmCapture />
            <div
              className={`flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden ${isMobile ? "" : "gap-2"}`}
            >
              <TabBar
                tabs={tabs.topLevel}
                activeTabId={tabs.activeId}
                splits={shell.split.summaries}
                activeSplitFull={shell.split.activeFull}
                onSetActiveTab={tabs.setActive}
                onCloseTab={tabs.close}
                onRefreshTab={tabs.refresh}
                onReconnectDisconnected={tabs.reconnectAll}
                onReorderTabs={tabs.reorder}
                onSplitAction={shell.split.handleAction}
                onRenameTab={tabs.rename}
                hosts={hosts.list}
                onEditHost={hosts.edit}
                isAppFullscreen={shell.fullscreen.active}
                onToggleAppFullscreen={shell.fullscreen.toggle}
                rightDockOpen={right.view !== null}
                onToggleRightDock={
                  isMobile ? undefined : regions.toggleRightDock
                }
                toolsOpen={right.view !== null}
                onToggleTools={isMobile ? undefined : regions.toggleRightDock}
                onQuickConnect={() => {
                  left.setView("quick-connect");
                  left.setOpen(true);
                }}
                showTabNumbers={tabs.showNumbers}
                targetTab={tabs.targetTerminal}
              />
              <div
                className={`relative flex flex-col flex-1 min-w-0 min-h-0 ${isMobile ? "overflow-hidden" : floatingPanel}`}
              >
                <TabStage />
              </div>
            </div>
          </SurfaceScope>

          {/* Bottom nav bar, phones only. The desktop app keeps the sidebar. */}
          {!shell.isElectron && (
            <MobileBar
              railView={left.view}
              sidebarOpen={left.open}
              username={shell.username}
              onRailClick={regions.railClick}
              onOpenTab={(type) => tabs.openSingleton(type)}
              onOpenSettings={() => tabs.openSingleton("settings")}
              onOpenPalette={shell.palette.open}
              onLogout={() => shell.logout({ manual: true })}
            />
          )}
        </div>

        {!isMobile && right.view && (
          <ToolsSidebar
            view={right.view}
            width={right.width}
            dragging={right.dragging}
            onSelect={(id) => right.setView(id)}
            onClose={() => right.setView(null)}
            onResizeStart={right.startResize}
          >
            {renderSidebarPanels(right.view, false)}
          </ToolsSidebar>
        )}

        {/* Plugin panels pinned to the right edge, sized by the plugin */}
        <ComponentSlot slotId="shell.rightEdge" />
      </div>
      <OriginalPalette />
    </div>
  );
}
