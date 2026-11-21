/* eslint-disable react-refresh/only-export-components */
import { lazy, Suspense, useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  getPanel,
  getTabType,
  LoadingState,
  PluginViewPlaceholder,
  railItemLabel,
  requestManage,
  SurfaceScope,
  useRailItems,
  useShellController,
  type TabType,
} from "@termix-ssh/plugin-sdk/ui";

const QuickConnectPanel = lazy(() =>
  import("../sidebar/QuickConnectPanel").then((m) => ({
    default: m.QuickConnectPanel,
  })),
);
const HostsPanel = lazy(() =>
  import("../sidebar/HostsPanel").then((m) => ({
    default: m.HostsPanel,
  })),
);
const ConnectionsPanel = lazy(() =>
  import("../sidebar/ConnectionsPanel").then((m) => ({
    default: m.ConnectionsPanel,
  })),
);

// Pages the palette lists on its own.
const OWN = new Set(["dashboard", "host-manager", "settings"]);
// Core views that show in the panel dock.
const DOCK_VIEWS = new Set(["hosts", "quick-connect", "connections"]);

export interface ToolItem {
  id: string;
  label: string;
  labelKey: string;
  icon: LucideIcon;
  kind: "tab" | "panel";
  open: () => void;
}

/** Everything the rail would offer, minus tools that need a host. */
export function useToolItems(): ToolItem[] {
  const { t } = useTranslation();
  const shell = useShellController();
  const items = useRailItems();
  const { tabs, regions } = shell;
  return useMemo(() => {
    const out: ToolItem[] = [];
    for (const item of items) {
      if (item.hidden || OWN.has(item.id)) continue;
      if (item.electronOnly && !shell.isElectron) continue;
      const base = {
        id: item.id,
        label: railItemLabel(item.id, t),
        labelKey: item.labelKey,
        icon: item.icon,
      };
      if (item.id === "credentials") {
        out.push({
          ...base,
          kind: "tab",
          open: () => requestManage({ kind: "browse", mode: "credentials" }),
        });
      } else if (DOCK_VIEWS.has(item.id) || getPanel(item.id)) {
        out.push({
          ...base,
          kind: "panel",
          open: () => regions.right.setView(item.id),
        });
      } else {
        const type = getTabType(item.id);
        if (type?.requiresHost) continue;
        out.push({
          ...base,
          kind: "tab",
          open: () => tabs.openSingleton(item.id as TabType),
        });
      }
    }
    return out;
  }, [items, t, tabs, regions, shell.isElectron]);
}

/** One panel in the right dock: Hosts, a plugin panel, Quick Connect or Connections. */
export function PanelDock({ view }: { view: string }) {
  const shell = useShellController();
  const { tabs, hosts, regions } = shell;
  const close = () => regions.right.setView(null);

  let body;
  if (view === "hosts") {
    body = (
      <HostsPanel
        onOpenTab={(host, type, options) => {
          tabs.connectHost(host, type, options);
          close();
        }}
        onEditHost={hosts.edit}
        onCloseSidebar={close}
        hostTree={hosts.tree ?? undefined}
        loading={hosts.loading}
        active
      />
    );
  } else if (view === "quick-connect") {
    body = (
      <QuickConnectPanel
        onConnect={(host, type) => {
          tabs.open(host, type);
          close();
        }}
      />
    );
  } else if (view === "connections") {
    body = (
      <div className="flex-1 min-h-0 overflow-y-auto">
        <ConnectionsPanel
          tabs={tabs.list}
          activeTabId={tabs.activeId}
          allHosts={hosts.list}
          backgroundTabRecords={tabs.background}
          onSwitchToTab={tabs.setActive}
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
              tabs.open(host, record.tabType as TabType, {
                instanceId: record.id,
                restoredSessionId:
                  restoredSessionId ?? record.backendSessionId ?? null,
                savedLabel: record.label,
              });
            } else {
              tabs.openSingleton(record.tabType as TabType);
            }
          }}
          onForgetBackground={(recordId) =>
            tabs.setBackground((prev) => prev.filter((r) => r.id !== recordId))
          }
          onRenameTab={tabs.rename}
          onReorderTabs={tabs.setList}
        />
      </div>
    );
  } else {
    const panel = getPanel(view);
    if (!panel) {
      body = <PluginViewPlaceholder kind="panel" viewId={view} compact />;
    } else {
      const Panel = panel.component;
      body = (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <Panel
            targetTab={tabs.targetTerminal}
            active
            shell={shell.panelCallbacks}
            setEditing={() => undefined}
            activeTabType={tabs.active?.type ?? undefined}
            placement="right"
          />
        </div>
      );
    }
  }

  return (
    <SurfaceScope kind="panel" className="flex flex-col flex-1 min-h-0">
      <Suspense fallback={<LoadingState />}>{body}</Suspense>
    </SurfaceScope>
  );
}
