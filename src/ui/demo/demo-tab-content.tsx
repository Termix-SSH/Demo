/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense } from "react";
import { Activity, Puzzle, Server, type LucideIcon } from "lucide-react";
import type { Host, SplitMode, Tab, TabType } from "@/types/ui-types";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
// xterm is the single heaviest dependency here and only the terminal needs it,
// so it loads on demand. The connect screen in DemoConnectionGate already
// covers the wait, which makes the split invisible.
const DemoTerminal = lazy(() => import("@/demo/DemoTerminal"));
import { DemoFileManager } from "@/demo/file-manager/DemoFileManager";
import { DemoDashboard } from "@/demo/DemoDashboard";
import { DemoHostMetrics } from "@/demo/DemoHostMetrics";
import { DemoTunnels } from "@/demo/DemoTunnels";
import { DemoDocker } from "@/demo/panels/DemoDocker";
import { DemoProxmox } from "@/demo/panels/DemoProxmox";
import { DemoTmuxMonitor } from "@/demo/panels/DemoTmuxMonitor";
import { DemoSnippets } from "@/demo/panels/DemoSnippets";
import { DemoHistory } from "@/demo/panels/DemoHistory";
import { DemoSessionLogs } from "@/demo/panels/DemoSessionLogs";
import { DemoAlerts } from "@/demo/panels/DemoAlerts";
import { DemoSshTools } from "@/demo/panels/DemoSshTools";
import { DemoConnections } from "@/demo/panels/DemoConnections";
import { DemoQuickConnect } from "@/demo/panels/DemoQuickConnect";
import { DemoMacros } from "@/demo/panels/DemoMacros";
import { DemoFleets } from "@/demo/panels/DemoFleets";
import { DemoWorkspaces } from "@/demo/panels/DemoWorkspaces";
import { DemoTermixId } from "@/demo/panels/DemoTermixId";
import { DemoAutomations } from "@/demo/panels/DemoAutomations";
import { DemoSplitScreen } from "@/demo/panels/DemoSplitScreen";
import { PluginsScreen } from "@/demo/plugins/PluginsScreen";
import { SettingsScreen } from "@/demo/settings/SettingsScreen";
import { HostWorkbench } from "@/demo/hosts/HostWorkbench";
import { DemoConnectionGate } from "@/demo/DemoConnectionGate";
import { viewOwnership } from "@/demo/plugins/plugin-views";

/**
 * The tab router.
 *
 * Every view is asked who owns it before it is drawn. A view whose plugin has
 * been uninstalled does not fall back to a placeholder that looks like the
 * feature is merely empty. It says the plugin is gone and offers the store,
 * because "uninstalling withdraws the UI" is the thing this demo exists to
 * show. A view whose plugin is installed but stopped says that instead, which
 * is a different problem with a different fix.
 */

/** Live split state, passed through rather than read from a fixture. */
export interface SplitContext {
  splitMode?: SplitMode;
  onSplitMode?: (mode: SplitMode) => void;
  paneTabIds?: (string | null)[];
  onAssignPane?: (pane: number, tabId: string) => void;
  onClearPane?: (tabId: string) => void;
  tabs?: Tab[];
}

export function renderDemoTabContent(
  tab: Tab,
  ctx?: {
    hosts?: Host[];
    tabs?: Tab[];
    onOpenTab?: (host: Host, type: TabType) => void;
    onOpenSingletonTab?: (type: TabType) => void;
    onFocusTab?: (id: string) => void;
    onCloseTab?: (id: string) => void;
    split?: SplitContext;
    /** False inside the sidebar, which draws its own header and background. */
    chrome?: boolean;
  },
) {
  const chrome = ctx?.chrome !== false;
  const openPlugins = () => ctx?.onOpenSingletonTab?.("plugins");

  // Ownership first: a withdrawn view never reaches its component.
  const owner = viewOwnership(tab.type);
  if (owner.kind === "missing") {
    return (
      <PluginGone chrome={chrome} name={owner.name} onBrowse={openPlugins} />
    );
  }
  if (owner.kind === "stopped") {
    return <PluginStopped chrome={chrome} name={owner.name} />;
  }

  // user@host:port for the connection screen and its log lines.
  const target = tab.host
    ? `${tab.host.username}@${tab.host.ip}:${tab.host.port}`
    : "demo@termix";
  const offline = tab.host?.status === "offline";

  switch (tab.type) {
    case "dashboard":
      return (
        <DemoDashboard
          hosts={ctx?.hosts ?? []}
          onOpenTab={ctx?.onOpenTab}
          onOpenSingletonTab={ctx?.onOpenSingletonTab}
        />
      );

    case "terminal":
    case "local-terminal":
      return tab.host ? (
        <DemoConnectionGate kind="terminal" target={target} offline={offline}>
          <Suspense fallback={<div className="h-full w-full bg-background" />}>
            <DemoTerminal host={tab.host} />
          </Suspense>
        </DemoConnectionGate>
      ) : (
        <Placeholder
          chrome={chrome}
          icon={Server}
          title="Pick a host to open a terminal"
        />
      );

    case "files":
      return tab.host ? (
        <DemoConnectionGate kind="files" target={target} offline={offline}>
          <DemoFileManager host={tab.host} initialPath={tab.initialPath} />
        </DemoConnectionGate>
      ) : (
        <Placeholder
          chrome={chrome}
          icon={Server}
          title="Pick a host to browse its files"
        />
      );

    case "host-metrics":
      return tab.host ? (
        <DemoConnectionGate
          kind="host-metrics"
          target={target}
          offline={offline}
        >
          <DemoHostMetrics host={tab.host} />
        </DemoConnectionGate>
      ) : (
        <Placeholder
          chrome={chrome}
          icon={Activity}
          title="Pick a host to see its metrics"
        />
      );

    case "tunnel":
      return (
        <DemoConnectionGate kind="tunnel" target={target}>
          <DemoTunnels />
        </DemoConnectionGate>
      );

    case "docker":
      return (
        <DemoConnectionGate kind="docker" target={target}>
          <DemoDocker />
        </DemoConnectionGate>
      );

    case "proxmox-stats":
      return (
        <DemoConnectionGate kind="proxmox" target={target}>
          <DemoProxmox />
        </DemoConnectionGate>
      );

    case "tmux_monitor":
      return (
        <DemoConnectionGate kind="tmux" target={target}>
          <DemoTmuxMonitor />
        </DemoConnectionGate>
      );

    case "plugins":
      return <PluginsScreen />;

    case "settings":
      return <SettingsScreen />;

    // Profile and admin were folded into the settings screen, so they open it
    // on their own page rather than being destinations of their own.
    case "user-profile":
      return <SettingsScreen initialSection="account" />;
    case "admin-settings":
      return <SettingsScreen initialSection="admin" />;

    case "host-manager":
      return <HostWorkbench onOpenPlugins={openPlugins} />;

    // Panels, which render the same in a tab and in the sidebar.
    case "snippets":
      return <DemoSnippets chrome={chrome} />;
    case "history":
      return <DemoHistory chrome={chrome} />;
    case "session-logs":
      return <DemoSessionLogs chrome={chrome} />;
    case "alerts":
      return <DemoAlerts chrome={chrome} />;
    case "macros":
      return <DemoMacros chrome={chrome} />;
    case "automations":
      return <DemoAutomations chrome={chrome} />;
    case "termix-id":
      return <DemoTermixId chrome={chrome} />;
    case "split-screen":
      return <DemoSplitScreen chrome={chrome} {...ctx?.split} />;
    case "ssh-tools":
      return (
        <DemoSshTools
          chrome={chrome}
          terminalTabs={(ctx?.tabs ?? []).filter((t) => t.type === "terminal")}
        />
      );

    // A start page is a blank canvas until you put something on it. The
    // canvas itself is not built here, so say that rather than showing an
    // empty tab, which reads as broken.
    case "homepage":
      return <NotInDemo chrome={chrome} title="Homepage" />;

    // Installable from the store, but the demo does not build the screen. Say
    // so rather than rendering an empty tab, which reads as broken.
    case "rdp":
      return <NotInDemo chrome={chrome} title="Remote desktop" />;
    case "vnc":
      return <NotInDemo chrome={chrome} title="VNC" />;
    case "telnet":
      return <NotInDemo chrome={chrome} title="Telnet" />;
    case "serial":
      return <NotInDemo chrome={chrome} title="Serial console" />;
    case "network_graph":
      return <NotInDemo chrome={chrome} title="Network graph" />;
    case "fleet-inventory":
      return <NotInDemo chrome={chrome} title="Fleet inventory" />;
    case "ai":
      return <NotInDemo chrome={chrome} title="Assistant" />;

    default:
      return null;
  }
}

/**
 * Installed, running, and genuinely not built here.
 *
 * The demo ships screens for what is installed by default. A plugin you add
 * from the store contributes its destination for real (the rail entry and the
 * tab both appear) but the screen behind it is out of scope, and saying that
 * plainly beats an empty panel.
 */
function NotInDemo({ chrome, title }: { chrome: boolean; title: string }) {
  return (
    <div
      className={`flex h-full w-full flex-1 items-center justify-center ${chrome ? "bg-background" : ""}`}
    >
      <EmptyState
        icon={Puzzle}
        title={title}
        hint="The plugin is installed and its destination is real. This screen is not part of the demo."
      />
    </div>
  );
}

/**
 * Rail destinations that only open in the sidebar, so they are not part of
 * TabType and never reach the switch above.
 */
function renderSidebarOnlyView(
  view: string,
  ctx?: {
    tabs?: Tab[];
    onFocusTab?: (id: string) => void;
    onCloseTab?: (id: string) => void;
    onOpenSingletonTab?: (type: TabType) => void;
  },
) {
  const owner = viewOwnership(view);
  if (owner.kind === "missing") {
    return (
      <SidebarBody>
        <PluginGone
          chrome={false}
          name={owner.name}
          onBrowse={() => ctx?.onOpenSingletonTab?.("plugins")}
        />
      </SidebarBody>
    );
  }
  if (owner.kind === "stopped") {
    return (
      <SidebarBody>
        <PluginStopped chrome={false} name={owner.name} />
      </SidebarBody>
    );
  }

  switch (view) {
    case "connections":
      return (
        <SidebarBody>
          <DemoConnections
            chrome={false}
            tabs={ctx?.tabs}
            onFocusTab={ctx?.onFocusTab}
            onCloseTab={ctx?.onCloseTab}
          />
        </SidebarBody>
      );
    case "quick-connect":
      return (
        <SidebarBody>
          <DemoQuickConnect chrome={false} />
        </SidebarBody>
      );
    case "fleets":
      return (
        <SidebarBody>
          <DemoFleets chrome={false} />
        </SidebarBody>
      );
    case "workspaces":
      return (
        <SidebarBody>
          <DemoWorkspaces chrome={false} />
        </SidebarBody>
      );
    default:
      return null;
  }
}

/**
 * Renders a rail panel's body only. The sidebar draws the header and owns the
 * background, so panels must add neither.
 */
export function renderDemoPanelBody(
  tab: Tab,
  ctx?: {
    tabs?: Tab[];
    onFocusTab?: (id: string) => void;
    onCloseTab?: (id: string) => void;
    onOpenSingletonTab?: (type: TabType) => void;
    split?: SplitContext;
  },
) {
  const sidebarOnly = renderSidebarOnlyView(tab.type, ctx);
  if (sidebarOnly) return sidebarOnly;
  return (
    <SidebarBody>
      {renderDemoTabContent(tab, { ...ctx, chrome: false })}
    </SidebarBody>
  );
}

function SidebarBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0">{children}</div>;
}

/**
 * What is left when a plugin is removed.
 *
 * Deliberately not an empty state: "no snippets" and "Snippets is not
 * installed" are different facts, and showing the first for the second is what
 * made the old placeholders misleading.
 */
function PluginGone({
  name,
  chrome,
  onBrowse,
}: {
  name: string;
  chrome: boolean;
  onBrowse?: () => void;
}) {
  return (
    <div
      className={`flex h-full w-full flex-1 items-center justify-center ${chrome ? "bg-background" : ""}`}
    >
      <EmptyState
        icon={Puzzle}
        title={`${name} is not installed`}
        hint="This came from a plugin that has been removed. Install it again to bring the screen back."
        action={
          onBrowse && (
            <Button variant="outline" size="sm" onClick={onBrowse}>
              Browse plugins
            </Button>
          )
        }
      />
    </div>
  );
}

/** Installed, but its worker is not running. */
function PluginStopped({ name, chrome }: { name: string; chrome: boolean }) {
  return (
    <div
      className={`flex h-full w-full flex-1 items-center justify-center ${chrome ? "bg-background" : ""}`}
    >
      <EmptyState
        icon={Puzzle}
        title={`${name} is not running`}
        hint="Enable the plugin to see this again."
      />
    </div>
  );
}

function Placeholder({
  icon,
  title,
  hint,
  chrome,
}: {
  icon?: LucideIcon;
  title: string;
  hint?: string;
  chrome: boolean;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${chrome ? "bg-background" : ""}`}
    >
      <EmptyState icon={icon} title={title} hint={hint} />
    </div>
  );
}
