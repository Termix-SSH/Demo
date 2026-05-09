import { useState, useRef, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Database, GripHorizontal, GripVertical, KeyRound, LayoutDashboard, Network,
  Plus, RefreshCw, Server, Settings, Terminal, Trash2, User, Zap,
} from "lucide-react";
import CytoscapeComponent from "react-cytoscapejs";
import { Kbd } from "@/components/ui/kbd";
import { DASHBOARD_CARDS, DEMO_GRAPH_ELEMENTS, hostStatuses, recentActivity, hosts } from "@/ui/utils/data";
import type { DashboardCardId, TabType, Host } from "@/ui/utils/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelId = "main" | "side";

type CardSlot = {
  id: DashboardCardId;
  panel: PanelId;
  order: number;
  /** Height in px. null = flex-fill (take remaining space). */
  height: number | null;
};

type DragState = {
  id: DashboardCardId;
  sourcePanel: PanelId;
  sourceOrder: number;
} | null;

// ─── Default layout ───────────────────────────────────────────────────────────

const DEFAULT_SLOTS: CardSlot[] = [
  { id: "stats_bar",       panel: "main", order: 0, height: 96   },
  { id: "counters_bar",    panel: "main", order: 1, height: 48   },
  { id: "quick_actions",   panel: "main", order: 2, height: 160  },
  { id: "host_status",     panel: "main", order: 3, height: null },
  { id: "recent_activity", panel: "side", order: 0, height: null },
];

// ─── Card label/icon map ──────────────────────────────────────────────────────

const CARD_META: Record<DashboardCardId, { label: string }> = {
  stats_bar:       { label: "Status Bar"     },
  counters_bar:    { label: "Counters"       },
  quick_actions:   { label: "Quick Actions"  },
  host_status:     { label: "Host Status"    },
  recent_activity: { label: "Recent Activity"},
  network_graph:   { label: "Network Graph"  },
};

// ─── useDividerResize ─────────────────────────────────────────────────────────
// Returns a ref to attach to the container and a mousedown handler for a divider.
// `onResize(delta)` is called with pixel delta during drag.

function useColumnResize(
  containerRef: React.RefObject<HTMLDivElement | null>,
  mainWidthPct: number,
  setMainWidthPct: (v: number) => void,
) {
  const dragging = useRef(false);
  const startX = useRef(0);
  const startPct = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    startX.current = e.clientX;
    startPct.current = mainWidthPct;

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const totalW = containerRef.current.getBoundingClientRect().width;
      const delta = ev.clientX - startX.current;
      const newPct = Math.min(85, Math.max(30, startPct.current + (delta / totalW) * 100));
      setMainWidthPct(newPct);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [containerRef, mainWidthPct, setMainWidthPct]);

  return onMouseDown;
}

// ─── useCardHeightResize ──────────────────────────────────────────────────────

function useCardHeightResize(
  slotId: DashboardCardId,
  onHeightChange: (id: DashboardCardId, newHeight: number) => void,
) {
  const startY = useRef(0);
  const startH = useRef(0);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startY.current = e.clientY;
    startH.current = cardRef.current?.getBoundingClientRect().height ?? 100;

    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY.current;
      const newH = Math.max(50, startH.current + delta);
      onHeightChange(slotId, newH);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [slotId, onHeightChange]);

  return { cardRef, onMouseDown };
}

// ─── Individual card content ──────────────────────────────────────────────────

function StatsBarCard() {
  return (
    <Card className="grid grid-cols-4 divide-x divide-border overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
        <span className="text-xl font-bold text-accent-brand leading-none">v1.0.0</span>
        <span className="text-[10px] bg-accent-brand/20 text-accent-brand px-1.5 py-0.5 w-fit font-semibold leading-none">STABLE</span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Uptime</span>
        <span className="text-xl font-bold leading-none">6d 3h</span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
        <span className="text-xl font-bold text-accent-brand leading-none">Healthy</span>
      </div>
      <div className="flex flex-col justify-center px-4 py-2 gap-1">
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Hosts Online</span>
        <div className="flex items-baseline gap-1">
          <span className="text-xl font-bold leading-none">{hostStatuses.filter(h => h.online).length}</span>
          <span className="text-base text-muted-foreground leading-none">/{hostStatuses.length}</span>
        </div>
      </div>
    </Card>
  );
}

function CountersBarCard() {
  return (
    <Card className="grid grid-cols-3 divide-x divide-border overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <Server className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">{hostStatuses.length}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Total Hosts</span>
      </div>
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <KeyRound className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">2</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Credentials</span>
      </div>
      <div className="flex items-center gap-2.5 px-4 py-2.5">
        <Network className="size-3.5 text-muted-foreground shrink-0" />
        <span className="text-base font-bold">5</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Tunnels</span>
      </div>
    </Card>
  );
}

function QuickActionsCard({ onOpenSingletonTab }: { onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void }) {
  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border shrink-0">
        <Zap className="size-3.5 text-muted-foreground" />
        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Quick Actions</span>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex flex-col flex-1 border-r border-border">
          <button onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-host")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
            <div className="size-7 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
              <Plus className="size-3 text-accent-brand" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">Add Host</span>
              <span className="text-[10px] text-muted-foreground">Register a new host</span>
            </div>
          </button>
          <button onClick={() => onOpenSingletonTab("admin-settings")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer flex-1">
            <div className="size-7 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
              <Settings className="size-3 text-accent-brand" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">Admin Settings</span>
              <span className="text-[10px] text-muted-foreground">Configure the application</span>
            </div>
          </button>
        </div>
        <div className="flex flex-col flex-1">
          <button onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-credential")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
            <div className="size-7 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
              <KeyRound className="size-3 text-accent-brand" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">Add Credential</span>
              <span className="text-[10px] text-muted-foreground">Store SSH key or password</span>
            </div>
          </button>
          <button onClick={() => onOpenSingletonTab("user-profile")}
            className="group/btn flex items-center gap-2.5 px-4 py-2.5 hover:bg-muted transition-colors cursor-pointer flex-1">
            <div className="size-7 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
              <User className="size-3 text-accent-brand" />
            </div>
            <div className="flex flex-col items-start text-left">
              <span className="text-xs font-semibold">User Profile</span>
              <span className="text-[10px] text-muted-foreground">Manage your account</span>
            </div>
          </button>
        </div>
      </div>
    </Card>
  );
}

function HostStatusCard({ onOpenTab }: { onOpenTab: (host: Host, type: TabType) => void }) {
  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Database className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Host Status</span>
        </div>
        <span className="text-xs text-muted-foreground">{hostStatuses.filter(h => h.online).length}/{hostStatuses.length} online</span>
      </div>
      <div className="flex flex-col overflow-auto flex-1">
        {hostStatuses.map((host, i) => (
          <div key={i} onClick={() => onOpenTab(host, "stats")} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-2.5">
              <span className={`size-1.5 rounded-full shrink-0 ${host.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`} />
              <div className="flex flex-col">
                <span className="text-xs font-semibold">{host.name}</span>
                <span className="text-[10px] text-muted-foreground font-mono">{host.address}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {host.online ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col gap-0.5 w-16">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">CPU</span>
                      <span className="text-[10px] font-bold text-accent-brand">{host.cpu}%</span>
                    </div>
                    <div className="h-0.5 bg-muted w-full">
                      <div className="h-full bg-accent-brand" style={{ width: `${host.cpu}%` }} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-0.5 w-16">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">RAM</span>
                      <span className="text-[10px] font-bold text-accent-brand">{host.ram}%</span>
                    </div>
                    <div className="h-0.5 bg-muted w-full">
                      <div className="h-full bg-accent-brand" style={{ width: `${host.ram}%` }} />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-[10px] text-muted-foreground w-16 text-center">—</span>
                  <span className="text-[10px] text-muted-foreground w-16 text-center">—</span>
                </div>
              )}
              <span className={`text-[10px] px-2 py-0.5 font-semibold border ${host.online ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10" : "border-border text-muted-foreground"}`}>
                {host.online ? "ONLINE" : "OFFLINE"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function RecentActivityCard({ onOpenTab }: { onOpenTab: (host: Host, type: TabType) => void }) {
  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Activity className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Recent Activity</span>
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-accent-brand h-auto py-0.5 px-2">Clear</Button>
      </div>
      <div className="flex flex-col overflow-auto flex-1">
        {recentActivity.map((item, i) => (
          <div key={i} onClick={() => { const h = hosts.find(x => x.name === item.host); if (h) onOpenTab(h, "terminal"); }}
            className="flex items-center justify-between px-4 py-2 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
            <div className="flex items-center gap-2">
              <span className={`size-1.5 rounded-full shrink-0 ${item.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`} />
              <div className="flex flex-col">
                <span className="text-xs font-semibold truncate max-w-24">{item.host}</span>
                <div className="flex items-center gap-1 text-muted-foreground">
                  <Terminal className="size-2.5" />
                  <span className="text-[10px]">{item.action}</span>
                </div>
              </div>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{item.time}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function NetworkGraphCard() {
  const cyRef = useRef<any>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean; x: number; y: number; node: any } | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  const buildNodeStyle = useCallback((ele: any) => {
    const isGateway = ele.data("id") === "gw";
    const isOnline = ele.data("status") === "online";
    const name = ele.data("label") || "";
    const ip = ele.data("ip") || "";
    const statusColor = isOnline ? "rgb(251,146,60)" : "rgb(100,116,139)";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72">
      <defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%">
        <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
      </filter></defs>
      <rect x="2" y="2" width="156" height="68" rx="4" fill="#09090b"
        stroke="${isGateway ? "rgba(251,146,60,0.8)" : statusColor}"
        stroke-width="${isGateway ? "2" : "1.5"}" filter="url(#sh)"/>
      ${isGateway ? `<rect x="2" y="2" width="156" height="68" rx="4" fill="rgba(251,146,60,0.04)"/>` : ""}
      <circle cx="18" cy="36" r="4" fill="${statusColor}" opacity="0.9"/>
      <text x="32" y="30" font-family="monospace" font-size="12" font-weight="700" fill="#f1f5f9">${name}</text>
      <text x="32" y="48" font-family="monospace" font-size="10" fill="#64748b">${ip}</text>
    </svg>`;
    return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  }, []);

  const handleCyInit = useCallback((cy: any) => {
    cyRef.current = cy;
    cy.style()
      .selector("node").style({
        label: "", width: "160px", height: "72px", shape: "round-rectangle",
        "border-width": "0px", "background-opacity": 0,
        "background-image": buildNodeStyle, "background-fit": "contain",
      })
      .selector("edge").style({ width: "1.5px", "line-color": "#2a2a2c", "curve-style": "bezier", "target-arrow-shape": "none" })
      .selector("node:selected").style({ "overlay-color": "#fb923c", "overlay-opacity": 0.08, "overlay-padding": "4px" })
      .update();
    cy.nodes().ungrabify();
    cy.on("tap", (evt: any) => { if (evt.target === cy) setContextMenu(null); });
    cy.on("cxttap tap", "node", (evt: any) => {
      evt.stopPropagation();
      const node = evt.target;
      setContextMenu({ visible: true, x: evt.originalEvent.clientX, y: evt.originalEvent.clientY, node: node.data() });
    });
    cy.on("zoom pan", () => setContextMenu(null));
  }, [buildNodeStyle]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  return (
    <Card className="flex flex-col overflow-hidden w-full h-full py-0 gap-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Network className="size-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Network Graph</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{DEMO_GRAPH_ELEMENTS.filter(e => !e.data.source).length} nodes</span>
          <Button variant="ghost" size="sm" className="text-xs h-auto py-0.5 px-2" onClick={() => cyRef.current?.fit()}>
            <RefreshCw className="size-3" />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {contextMenu?.visible && (
          <div ref={contextMenuRef} className="fixed z-[200] min-w-[160px] shadow-2xl p-1 flex flex-col gap-0.5 bg-card border border-border"
            style={{ top: contextMenu.y, left: contextMenu.x }}>
            <div className="px-3 py-1.5 border-b border-border mb-0.5">
              <span className="text-xs font-bold font-mono">{contextMenu.node.label}</span>
              <span className="text-[10px] text-muted-foreground block">{contextMenu.node.ip}</span>
            </div>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left w-full">
              <Terminal className="size-3" />Terminal
            </button>
            <button className="flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-muted transition-colors text-left w-full">
              <Server className="size-3" />Server Stats
            </button>
          </div>
        )}
        <CytoscapeComponent
          elements={DEMO_GRAPH_ELEMENTS}
          style={{ width: "100%", height: "100%" }}
          layout={{ name: "preset" }}
          cy={handleCyInit}
          wheelSensitivity={1.5}
          minZoom={0.3}
          maxZoom={2.5}
        />
        <div className="absolute bottom-2 left-3 flex items-center gap-3 pointer-events-none">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-accent-brand inline-block" />
            <span className="text-[10px] text-muted-foreground font-mono">Online</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-muted-foreground/50 inline-block" />
            <span className="text-[10px] text-muted-foreground font-mono">Offline</span>
          </div>
        </div>
        <div className="absolute top-2 right-3 pointer-events-none">
          <span className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest">Demo</span>
        </div>
      </div>
    </Card>
  );
}

// ─── CardItem ─────────────────────────────────────────────────────────────────
// Renders one card slot. If height is a number it uses that px height (and shows
// a bottom resize handle). If null it flex-fills remaining panel space.

function CardItem({
  slot,
  editMode,
  isDragging,
  onDragStart,
  onDrop,
  onDragOver,
  onRemove,
  onHeightChange,
  onOpenSingletonTab,
  onOpenTab,
}: {
  slot: CardSlot;
  editMode: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemove: () => void;
  onHeightChange: (id: DashboardCardId, h: number) => void;
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Vertical resize
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = cardRef.current?.getBoundingClientRect().height ?? 100;

    const onMove = (ev: MouseEvent) => {
      const newH = Math.max(50, startH + (ev.clientY - startY));
      onHeightChange(slot.id, newH);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [slot.id, onHeightChange]);

  const isFlex = slot.height === null;

  return (
    <div
      ref={cardRef}
      className={`relative flex flex-col transition-opacity select-none ${
        isDragging ? "opacity-40" : "opacity-100"
      } ${isFlex ? "flex-1 min-h-0" : "shrink-0"}`}
      style={!isFlex ? { height: slot.height } : undefined}
      draggable={editMode}
      onDragStart={onDragStart}
      onDrop={onDrop}
      onDragOver={onDragOver}
    >
      {/* Edit-mode overlay */}
      {editMode && (
        <div className="absolute inset-0 z-10 pointer-events-none border-2 border-dashed border-accent-brand/30" />
      )}

      {/* Edit controls */}
      {editMode && (
        <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
          <div className="size-6 bg-card border border-border flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto">
            <GripVertical className="size-3 text-muted-foreground" />
          </div>
          <button
            onClick={onRemove}
            className="size-6 bg-card border border-border flex items-center justify-center hover:bg-destructive/10 hover:border-destructive/40 transition-colors pointer-events-auto"
          >
            <Trash2 className="size-3 text-muted-foreground" />
          </button>
        </div>
      )}

      {/* Card content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {slot.id === "stats_bar"       && <StatsBarCard />}
        {slot.id === "counters_bar"    && <CountersBarCard />}
        {slot.id === "quick_actions"   && <QuickActionsCard onOpenSingletonTab={onOpenSingletonTab} />}
        {slot.id === "host_status"     && <HostStatusCard onOpenTab={onOpenTab} />}
        {slot.id === "recent_activity" && <RecentActivityCard onOpenTab={onOpenTab} />}
        {slot.id === "network_graph"   && <NetworkGraphCard />}
      </div>

      {/* Vertical resize handle — only in edit mode */}
      {editMode && !isFlex && (
        <div
          onMouseDown={onResizeMouseDown}
          className="absolute bottom-0 left-0 right-0 h-2 z-20 flex items-center justify-center cursor-row-resize group/resize"
          title="Drag to resize"
        >
          <div className="w-12 h-0.5 bg-border group-hover/resize:bg-accent-brand/60 transition-colors rounded-full" />
        </div>
      )}
    </div>
  );
}

// ─── DropZone ─────────────────────────────────────────────────────────────────

function DropZone({ panel, order, onDrop, onDragOver, active }: {
  panel: PanelId;
  order: number;
  onDrop: (panel: PanelId, order: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  active: boolean;
}) {
  const [over, setOver] = useState(false);
  if (!active) return null;
  return (
    <div
      className={`shrink-0 transition-all duration-150 ${over ? "h-10 border-2 border-dashed border-accent-brand/60 bg-accent-brand/5" : "h-2"}`}
      onDragOver={(e) => { onDragOver(e); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={() => { setOver(false); onDrop(panel, order); }}
    />
  );
}

// ─── AddCardTray ──────────────────────────────────────────────────────────────

function AddCardTray({ activeIds, onAdd }: { activeIds: DashboardCardId[]; onAdd: (id: DashboardCardId) => void }) {
  const available = DASHBOARD_CARDS.filter(c => !activeIds.includes(c.id));
  if (available.length === 0) return null;
  return (
    <div className="flex items-center gap-2 px-1 py-2 flex-wrap shrink-0">
      <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold shrink-0">Add:</span>
      {available.map(card => (
        <button
          key={card.id}
          onClick={() => onAdd(card.id)}
          className="flex items-center gap-1.5 px-2.5 py-1 border border-dashed border-border text-xs text-muted-foreground hover:text-foreground hover:border-accent-brand/60 hover:bg-accent-brand/5 transition-colors"
        >
          <Plus className="size-3 text-accent-brand" />
          {CARD_META[card.id].label}
        </button>
      ))}
    </div>
  );
}

// ─── PanelColumn ─────────────────────────────────────────────────────────────

function PanelColumn({
  panel, slots, editMode, dragState,
  onDragStart, onDrop, onDragOver, onRemove, onAdd, onHeightChange,
  onOpenSingletonTab, onOpenTab,
}: {
  panel: PanelId;
  slots: CardSlot[];
  editMode: boolean;
  dragState: DragState;
  onDragStart: (slot: CardSlot) => void;
  onDrop: (targetPanel: PanelId, targetOrder: number) => void;
  onDragOver: (e: React.DragEvent) => void;
  onRemove: (id: DashboardCardId) => void;
  onAdd: (id: DashboardCardId, panel: PanelId) => void;
  onHeightChange: (id: DashboardCardId, h: number) => void;
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const sorted = [...slots].sort((a, b) => a.order - b.order);
  const allIds = slots.map(s => s.id);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <DropZone panel={panel} order={-1} onDrop={onDrop} onDragOver={onDragOver} active={!!dragState} />

      {sorted.map((slot, idx) => (
        <div key={slot.id} className={`flex flex-col min-h-0 ${slot.height === null ? "flex-1" : "shrink-0"}`}>
          {idx > 0 && (
            <div className={editMode ? "" : "h-4 shrink-0"}>
              <DropZone panel={panel} order={slot.order - 0.5} onDrop={onDrop} onDragOver={onDragOver} active={!!dragState} />
            </div>
          )}
          <CardItem
            slot={slot}
            editMode={editMode}
            isDragging={dragState?.id === slot.id}
            onDragStart={() => onDragStart(slot)}
            onDrop={() => onDrop(slot.panel, slot.order)}
            onDragOver={onDragOver}
            onRemove={() => onRemove(slot.id)}
            onHeightChange={onHeightChange}
            onOpenSingletonTab={onOpenSingletonTab}
            onOpenTab={onOpenTab}
          />
        </div>
      ))}

      <DropZone panel={panel} order={sorted.length} onDrop={onDrop} onDragOver={onDragOver} active={!!dragState} />

      {editMode && (
        <AddCardTray activeIds={allIds} onAdd={(id) => onAdd(id, panel)} />
      )}

      {sorted.length === 0 && !editMode && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground/20 text-xs border border-dashed border-border/30">
          Empty
        </div>
      )}
    </div>
  );
}

// ─── Column divider (drag to resize column split) ─────────────────────────────

function ColumnDivider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-3 shrink-0 flex items-center justify-center cursor-col-resize group/divider self-stretch z-10"
      title="Drag to resize columns"
    >
      <div className="w-px h-full bg-border group-hover/divider:bg-accent-brand/50 transition-colors" />
      <div className="absolute size-4 flex items-center justify-center opacity-0 group-hover/divider:opacity-100 transition-opacity">
        <GripHorizontal className="size-3 text-accent-brand" />
      </div>
    </div>
  );
}

// ─── DashboardTab ─────────────────────────────────────────────────────────────

export function DashboardTab({ onOpenSingletonTab, onOpenTab }: {
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const [slots, setSlots] = useState<CardSlot[]>(DEFAULT_SLOTS);
  const [editMode, setEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState>(null);
  const [mainWidthPct, setMainWidthPct] = useState(68);

  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const bodyRef = useRef<HTMLDivElement | null>(null);

  const mainSlots = slots.filter(s => s.panel === "main").sort((a, b) => a.order - b.order);
  const sideSlots = slots.filter(s => s.panel === "side").sort((a, b) => a.order - b.order);
  const hasSide = sideSlots.length > 0;

  // ── Column resize ──
  const onColumnDividerMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startPct = mainWidthPct;

    const onMove = (ev: MouseEvent) => {
      if (!bodyRef.current) return;
      const totalW = bodyRef.current.getBoundingClientRect().width;
      const delta = ev.clientX - startX;
      setMainWidthPct(Math.min(85, Math.max(25, startPct + (delta / totalW) * 100)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [mainWidthPct]);

  // ── Card drag ──
  const handleDragStart = (slot: CardSlot) => {
    setDragState({ id: slot.id, sourcePanel: slot.panel, sourceOrder: slot.order });
  };

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

  const handleDrop = (targetPanel: PanelId, targetOrder: number) => {
    if (!dragState) return;
    setSlots(prev => {
      const without = prev.filter(s => s.id !== dragState.id);
      const panelSlots = without.filter(s => s.panel === targetPanel).sort((a, b) => a.order - b.order);
      const others = without.filter(s => s.panel !== targetPanel);
      const insertIdx = panelSlots.findIndex(s => s.order > targetOrder);
      const insertAt = insertIdx === -1 ? panelSlots.length : insertIdx;
      const newPanelSlots = [
        ...panelSlots.slice(0, insertAt),
        { id: dragState.id, panel: targetPanel, order: 0, height: prev.find(s => s.id === dragState.id)?.height ?? null },
        ...panelSlots.slice(insertAt),
      ].map((s, i) => ({ ...s, order: i }));
      return [...others, ...newPanelSlots];
    });
    setDragState(null);
  };

  const handleRemove = (id: DashboardCardId) => setSlots(prev => prev.filter(s => s.id !== id));

  const handleAdd = (id: DashboardCardId, panel: PanelId) => {
    setSlots(prev => {
      const panelSlots = prev.filter(s => s.panel === panel);
      const maxOrder = panelSlots.length > 0 ? Math.max(...panelSlots.map(s => s.order)) + 1 : 0;
      // New cards that are naturally "tall" (scrollable lists) get flex-fill, others get a default px height
      const defaultHeight: number | null = (id === "host_status" || id === "recent_activity" || id === "network_graph") ? null : 150;
      return [...prev, { id, panel, order: maxOrder, height: defaultHeight }];
    });
  };

  const handleHeightChange = (id: DashboardCardId, h: number) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, height: h } : s));
  };

  const handleReset = () => {
    setSlots(DEFAULT_SLOTS);
    setMainWidthPct(72);
    setEditMode(false);
  };

  const isMobile = useIsMobile();

  // On mobile render all cards in a single scrollable column, in default order
  if (isMobile) {
    const allSlots = [...mainSlots, ...sideSlots];
    return (
      <div className="flex flex-col w-full h-full min-h-0 overflow-hidden">
        {/* Mobile header */}
        <Card className="flex-row items-center justify-between px-4 py-3 shrink-0 mx-3 mt-3 gap-0">
          <div>
            <h1 className="text-base font-bold leading-tight">Dashboard</h1>
            <p className="text-xs text-muted-foreground">{todayLabel}</p>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
              <a href="https://github.com/Termix-SSH/Termix" target="_blank" rel="noreferrer">GitHub</a>
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
              <a href="https://github.com/Termix-SSH/Support" target="_blank" rel="noreferrer">Support</a>
            </Button>
            <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
              <a href="https://discord.com/invite/jVQGdvHDrf" target="_blank" rel="noreferrer">Discord</a>
            </Button>
          </div>
        </Card>

        {/* Mobile body — single scrollable column */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3 pt-3 flex flex-col gap-3">
          {allSlots.map(slot => (
            <div key={slot.id} className={`shrink-0 ${(slot.id === "host_status" || slot.id === "recent_activity") ? "max-h-72 flex flex-col overflow-hidden" : ""}`}>
              {slot.id === "stats_bar"       && <StatsBarCard />}
              {slot.id === "counters_bar"    && <CountersBarCard />}
              {slot.id === "quick_actions"   && <QuickActionsCard onOpenSingletonTab={onOpenSingletonTab} />}
              {slot.id === "host_status"     && <HostStatusCard onOpenTab={onOpenTab} />}
              {slot.id === "recent_activity" && <RecentActivityCard onOpenTab={onOpenTab} />}
              {slot.id === "network_graph"   && <NetworkGraphCard />}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full h-full min-h-0 overflow-hidden">
      {/* Header */}
      <Card className="flex-row items-center justify-between px-5 py-3 shrink-0 mx-5 mt-5 gap-0">
        <div>
          <h1 className="text-lg font-bold leading-tight">Dashboard</h1>
          <p className="text-xs text-muted-foreground">{todayLabel}</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-2 mr-2 bg-muted/50 px-2.5 py-1 rounded-sm border border-border">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Command Palette</span>
            <div className="flex items-center gap-1">
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
              <span className="text-[10px] text-muted-foreground">+</span>
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
            <a href="https://github.com/Termix-SSH/Termix" target="_blank" rel="noreferrer">GitHub</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
            <a href="https://github.com/Termix-SSH/Support" target="_blank" rel="noreferrer">Support</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-foreground" asChild>
            <a href="https://discord.com/invite/jVQGdvHDrf" target="_blank" rel="noreferrer">Discord</a>
          </Button>
          <Separator orientation="vertical" className="mx-1 h-5" />
          {editMode ? (
            <>
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={handleReset}>Reset</Button>
              <Button size="sm" className="text-xs bg-accent-brand hover:bg-accent-brand/90 text-white" onClick={() => setEditMode(false)}>Done</Button>
            </>
          ) : (
            <Button variant="ghost" size="icon" onClick={() => setEditMode(true)} title="Customize Dashboard">
              <LayoutDashboard className="size-4 text-accent-brand" />
            </Button>
          )}
        </div>
      </Card>

      {/* Edit mode hint */}
      {editMode && (
        <div className="mx-5 mt-4 px-4 py-2 border border-dashed border-accent-brand/40 bg-accent-brand/5 shrink-0 flex items-center gap-2">
          <LayoutDashboard className="size-3.5 text-accent-brand shrink-0" />
          <span className="text-xs text-accent-brand font-semibold">
            Drag cards to reorder · Drag the column divider to resize columns · Drag the bottom edge of a card to resize its height · Trash to remove
          </span>
        </div>
      )}

      {/* Body */}
      <div ref={bodyRef} className="flex flex-row flex-1 min-h-0 px-5 pb-5 pt-4 overflow-hidden">
        {/* Main column */}
        <div
          className="flex flex-col min-h-0"
          style={{ width: hasSide || editMode ? `${mainWidthPct}%` : "100%" }}
        >
          <PanelColumn
            panel="main"
            slots={mainSlots}
            editMode={editMode}
            dragState={dragState}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onRemove={handleRemove}
            onAdd={handleAdd}
            onHeightChange={handleHeightChange}
            onOpenSingletonTab={onOpenSingletonTab}
            onOpenTab={onOpenTab}
          />
        </div>

        {/* Column divider — draggable only in edit mode */}
        {(hasSide || editMode) && (
          editMode
            ? <ColumnDivider onMouseDown={onColumnDividerMouseDown} />
            : <div className="w-4 shrink-0" />
        )}

        {/* Side column */}
        {(hasSide || editMode) && (
          <div className="flex flex-col min-h-0 flex-1">
            <PanelColumn
              panel="side"
              slots={sideSlots}
              editMode={editMode}
              dragState={dragState}
              onDragStart={handleDragStart}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onRemove={handleRemove}
              onAdd={handleAdd}
              onHeightChange={handleHeightChange}
              onOpenSingletonTab={onOpenSingletonTab}
              onOpenTab={onOpenTab}
            />
          </div>
        )}
      </div>
    </div>
  );
}
