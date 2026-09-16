/* eslint-disable react-refresh/only-export-components */
import {
  Activity,
  Boxes,
  Braces,
  Clock,
  Fingerprint,
  Hammer,
  LayoutPanelLeft,
  LayoutTemplate,
  MessagesSquare,
  Monitor,
  MousePointerClick,
  Network,
  Play,
  Plug,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  Usb,
  User,
  Workflow,
  Zap,
} from "lucide-react";
import type { Host, Tab, TabType } from "@/types/ui-types";
import { DemoTerminal } from "@/demo/DemoTerminal";
import { DemoFileManager } from "@/demo/file-manager/DemoFileManager";
import { DemoDashboard } from "@/demo/DemoDashboard";
import { DemoHostMetrics } from "@/demo/DemoHostMetrics";
import { DemoTunnels } from "@/demo/DemoTunnels";
import { DemoPanel } from "@/demo/DemoPanel";
import { DemoDocker } from "@/demo/panels/DemoDocker";
import { DemoProxmox } from "@/demo/panels/DemoProxmox";
import { DemoTmuxMonitor } from "@/demo/panels/DemoTmuxMonitor";
import { PluginsScreen } from "@/demo/plugins/PluginsScreen";
import { SettingsScreen } from "@/demo/settings/SettingsScreen";
import { HostWorkbench } from "@/demo/hosts/HostWorkbench";
import { PanelShell } from "@/components/panel-layout";
import { DemoConnectionGate } from "@/demo/DemoConnectionGate";

export function renderDemoTabContent(
  tab: Tab,
  ctx?: {
    hosts?: Host[];
    onOpenTab?: (host: Host, type: TabType) => void;
    onOpenSingletonTab?: (type: TabType) => void;
    /** False inside the sidebar, which draws its own header and background. */
    chrome?: boolean;
  },
) {
  const chrome = ctx?.chrome !== false;

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
          <DemoTerminal host={tab.host} />
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

    case "host-manager":
      return (
        <HostWorkbench
          onOpenPlugins={() => ctx?.onOpenSingletonTab?.("plugins")}
        />
      );

    case "rdp":
      return (
        <Placeholder
          chrome={chrome}
          icon={Monitor}
          title="Remote desktop"
          hint="A Windows desktop in a browser tab, with clipboard sharing and drive redirection. Credentials come from the host, so there is nothing extra to type."
        />
      );
    case "vnc":
      return (
        <Placeholder
          chrome={chrome}
          icon={MousePointerClick}
          title="VNC"
          hint="Any VNC desktop in a browser tab, including the console of a machine that has not finished booting."
        />
      );
    case "telnet":
      return (
        <Placeholder
          chrome={chrome}
          icon={MessagesSquare}
          title="Telnet"
          hint="For switches, PDUs and older gear that never learned SSH. Sessions are logged the same way, so the audit trail does not have a hole in it."
        />
      );
    case "serial":
      return (
        <Placeholder
          chrome={chrome}
          icon={Usb}
          title="Serial console"
          hint="A console over a USB or serial adapter, for a machine with no network yet. Pick the port and baud rate and it behaves like any other terminal."
        />
      );
    case "network_graph":
      return (
        <Placeholder
          chrome={chrome}
          icon={Network}
          title="Network graph"
          hint="A map of every host and the jump chains between them, so you can see what a bastion is fronting and what breaks if it goes down."
        />
      );
    // A blank canvas, which is what a start page looks like before you put
    // anything on it. No empty-state copy: the toolbar is the affordance.
    case "homepage":
      return (
        <div className={`h-full w-full ${chrome ? "bg-background" : ""}`} />
      );
    case "fleet-inventory":
      return (
        <Placeholder
          chrome={chrome}
          icon={Boxes}
          title="Fleet inventory"
          hint="Kernel, package versions, disk layout and uptime for every host in a fleet, in one table you can sort and compare."
        />
      );

    case "snippets":
      return (
        <PanelFrame chrome={chrome} title="Snippets">
          <DemoPanel
            icon={Play}
            emptyTitle="No snippets"
            emptyHint="Save a command once and run it on any host from here."
          />
        </PanelFrame>
      );
    case "history":
      return (
        <PanelFrame chrome={chrome} title="History">
          <DemoPanel
            icon={Clock}
            emptyTitle="No command history"
            emptyHint="Commands you run in a terminal are listed here so you can find and rerun them."
          />
        </PanelFrame>
      );
    case "session-logs":
      return (
        <PanelFrame chrome={chrome} title="Session logs">
          <DemoPanel
            icon={ScrollText}
            emptyTitle="No session logs"
            emptyHint="Recorded terminal sessions are listed here to replay or download."
          />
        </PanelFrame>
      );
    case "macros":
      return (
        <PanelFrame chrome={chrome} title="Macros">
          <DemoPanel
            icon={Braces}
            emptyTitle="No macros"
            emptyHint="Record a run of keystrokes and replay it in any terminal."
          />
        </PanelFrame>
      );
    case "ssh-tools":
      return (
        <PanelFrame chrome={chrome} title="SSH tools">
          <DemoPanel
            icon={Hammer}
            emptyTitle="SSH tools"
            emptyHint="Type into several terminals at once, and set paste and copy behaviour."
          />
        </PanelFrame>
      );
    case "automations":
      return (
        <PanelFrame chrome={chrome} title="Automations">
          <DemoPanel
            icon={Workflow}
            emptyTitle="No automations"
            emptyHint="Run snippets on a schedule and get told how they went."
          />
        </PanelFrame>
      );
    case "ai":
      return (
        <PanelFrame chrome={chrome} title="Assistant">
          <DemoPanel
            icon={Sparkles}
            emptyTitle="Assistant"
            emptyHint="Ask about a host, and review any command before it runs."
          />
        </PanelFrame>
      );
    case "alerts":
      return (
        <PanelFrame chrome={chrome} title="Alerts">
          <DemoPanel
            icon={Plug}
            emptyTitle="No unacknowledged alerts"
            emptyHint="Set rules on host metrics and pick where the notice goes."
          />
        </PanelFrame>
      );
    case "termix-id":
      return (
        <PanelFrame chrome={chrome} title="Termix ID">
          <DemoPanel
            icon={Fingerprint}
            emptyTitle="Termix ID"
            emptyHint="Publish your SSH public keys under a handle others can pull from."
          />
        </PanelFrame>
      );
    case "user-profile":
      return (
        <PanelFrame chrome={chrome} title="User profile">
          <DemoPanel
            icon={User}
            emptyTitle="Profile settings"
            emptyHint="Your account, two-factor, passkeys, theme and keyboard shortcuts."
          />
        </PanelFrame>
      );
    case "admin-settings":
      return (
        <PanelFrame chrome={chrome} title="Admin">
          <DemoPanel
            icon={Settings}
            emptyTitle="Admin settings"
            emptyHint="Users, roles, single sign-on, API keys, branding and the audit log."
          />
        </PanelFrame>
      );
    case "split-screen":
      return (
        <Placeholder
          chrome={chrome}
          icon={LayoutPanelLeft}
          title="Split screen"
          hint="Up to four panes in one tab, each running its own session. Drag the dividers to resize, and assign a tab to a pane from the tab bar."
        />
      );

    default:
      return null;
  }
}

// Rail destinations that only open in the sidebar, so they are not part of
// TabType and never reach the switch above.
function renderSidebarOnlyView(view: string) {
  switch (view) {
    case "connections":
      return (
        <SidebarBody>
          <DemoPanel
            icon={Plug}
            emptyTitle="No active connections"
            emptyHint="Sessions you open stay listed here while they run."
          />
        </SidebarBody>
      );
    case "quick-connect":
      return (
        <SidebarBody>
          <DemoPanel
            icon={Zap}
            emptyTitle="Quick Connect"
            emptyHint="Open a one-off session without saving the host first."
          />
        </SidebarBody>
      );
    case "fleets":
      return (
        <SidebarBody>
          <DemoPanel
            icon={Boxes}
            emptyTitle="No fleets"
            emptyHint="Group hosts so a command or a file goes to all of them at once."
          />
        </SidebarBody>
      );
    case "workspaces":
      return (
        <SidebarBody>
          <DemoPanel
            icon={LayoutTemplate}
            emptyTitle="No workspaces"
            emptyHint="Save a set of tabs and panes, then bring it back later."
          />
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
export function renderDemoPanelBody(tab: Tab) {
  const sidebarOnly = renderSidebarOnlyView(tab.type);
  if (sidebarOnly) return sidebarOnly;
  return (
    <SidebarBody>{renderDemoTabContent(tab, { chrome: false })}</SidebarBody>
  );
}

function SidebarBody({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col flex-1 min-h-0">{children}</div>;
}

function PanelFrame({
  title,
  chrome,
  children,
}: {
  title: string;
  chrome: boolean;
  children: React.ReactNode;
}) {
  return (
    <PanelShell chrome={chrome} title={title} scroll={false}>
      {children}
    </PanelShell>
  );
}

function Placeholder({
  icon,
  title,
  hint,
  chrome,
}: {
  icon?: React.ComponentProps<typeof DemoPanel>["icon"];
  title: string;
  hint?: string;
  chrome: boolean;
}) {
  return (
    <div
      className={`flex h-full w-full items-center justify-center ${chrome ? "bg-background" : ""}`}
    >
      <DemoPanel icon={icon} emptyTitle={title} emptyHint={hint} />
    </div>
  );
}
