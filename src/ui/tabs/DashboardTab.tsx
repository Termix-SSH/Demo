import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Activity, Check, Database, KeyRound, LayoutDashboard, Network,
  Plus, RefreshCw, Server, Settings, Terminal, User, Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import CytoscapeComponent from "react-cytoscapejs";
import { Kbd } from "@/components/ui/kbd";
import { DASHBOARD_CARDS, DEMO_GRAPH_ELEMENTS, hostStatuses, recentActivity, hosts } from "@/ui/data";
import type { DashboardCardId, TabType, Host } from "@/ui/types";

function DashboardSettingsDialog({
  open, onOpenChange, enabled, onToggle,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  enabled: Record<DashboardCardId, boolean>;
  onToggle: (id: DashboardCardId) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
              <LayoutDashboard className="size-3.5 text-accent-brand" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-none">Dashboard Settings</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">Toggle which cards are visible on your dashboard.</DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="flex flex-col divide-y divide-border">
          {DASHBOARD_CARDS.map((card) => {
            const isOn = enabled[card.id];
            return (
              <button
                key={card.id}
                onClick={() => onToggle(card.id)}
                className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors text-left w-full"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{card.label}</span>
                  <span className="text-xs text-muted-foreground">{card.description}</span>
                </div>
                <div className={`ml-4 shrink-0 size-5 border flex items-center justify-center transition-colors ${isOn ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}>
                  {isOn && <Check className="size-3 text-white" strokeWidth={3} />}
                </div>
              </button>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{Object.values(enabled).filter(Boolean).length} of {DASHBOARD_CARDS.length} cards enabled</span>
          <Button variant="ghost" size="sm" className="text-xs h-7 text-muted-foreground" onClick={() => onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
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
    const bgColor = "#09090b";
    const textColor = "#f1f5f9";
    const dimColor = "#64748b";

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="72" viewBox="0 0 160 72">
      <defs>
        <filter id="sh" x="-15%" y="-15%" width="130%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#000" flood-opacity="0.4"/>
        </filter>
      </defs>
      <rect x="2" y="2" width="156" height="68" rx="4"
        fill="${bgColor}"
        stroke="${isGateway ? "rgba(251,146,60,0.8)" : statusColor}"
        stroke-width="${isGateway ? "2" : "1.5"}"
        filter="url(#sh)"
      />
      ${isGateway ? `<rect x="2" y="2" width="156" height="68" rx="4" fill="rgba(251,146,60,0.04)"/>` : ""}
      <circle cx="18" cy="36" r="4" fill="${statusColor}" opacity="0.9"/>
      <text x="32" y="30" font-family="monospace" font-size="12" font-weight="700" fill="${textColor}">${name}</text>
      <text x="32" y="48" font-family="monospace" font-size="10" fill="${dimColor}">${ip}</text>
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
    <Card className="flex flex-col overflow-hidden py-0 gap-0 flex-1 min-h-0">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
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
          <div
            ref={contextMenuRef}
            className="fixed z-[200] min-w-[160px] shadow-2xl p-1 flex flex-col gap-0.5 bg-card border border-border"
            style={{ top: contextMenu.y, left: contextMenu.x }}
          >
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

export function DashboardTab({ onOpenSingletonTab, onOpenTab }: {
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const defaultEnabled = Object.fromEntries(DASHBOARD_CARDS.map((c) => [c.id, c.defaultEnabled])) as Record<DashboardCardId, boolean>;
  const [enabled, setEnabled] = useState<Record<DashboardCardId, boolean>>(defaultEnabled);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const toggle = (id: DashboardCardId) => setEnabled((prev) => ({ ...prev, [id]: !prev[id] }));
  const hasRight = enabled.recent_activity || enabled.network_graph;
  const mainColClass = hasRight ? "flex w-3/4 flex-col gap-3 min-h-0" : "flex w-full flex-col gap-3 min-h-0";

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <DashboardSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} enabled={enabled} onToggle={toggle} />
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-xs text-muted-foreground">Thursday, May 1, 2026</p>
        </div>
        <div className="flex items-center gap-1">
          <div className="hidden sm:flex items-center gap-2 mr-2 bg-muted/50 px-3 py-1.5 rounded-md border border-border">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Quick Actions</span>
            <div className="flex items-center gap-1">
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
              <span className="text-[10px] text-muted-foreground">+</span>
              <Kbd className="h-5 px-1.5 bg-background text-[10px]">Shift</Kbd>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
            <a href="https://discord.com" target="_blank" rel="noreferrer">Discord</a>
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">Support</Button>
          <Separator orientation="vertical" className="mx-1"/>
          <Button variant="ghost" size="icon" onClick={() => setSettingsOpen(true)} title="Dashboard Settings">
            <LayoutDashboard className="size-4 text-accent-brand"/>
          </Button>
        </div>
      </Card>
      <div className="flex flex-row flex-1 min-h-0 px-3 py-3 gap-3">
        <div className={mainColClass}>

          {enabled.stats_bar && (
            <Card className="grid grid-cols-4 divide-x divide-border overflow-hidden shrink-0 py-0 gap-0">
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
                <span className="text-3xl font-bold text-accent-brand">v1.0.0</span>
                <span className="text-xs bg-accent-brand/20 text-accent-brand px-1.5 py-0.5 w-fit font-semibold">STABLE</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Uptime</span>
                <span className="text-3xl font-bold">6d 3h</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
                <span className="text-3xl font-bold text-accent-brand">Healthy</span>
              </div>
              <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Hosts Online</span>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-bold">{hostStatuses.filter(h => h.online).length}</span>
                  <span className="text-xl text-muted-foreground">/{hostStatuses.length}</span>
                </div>
              </div>
            </Card>
          )}

          {enabled.counters_bar && (
            <Card className={`grid divide-x divide-border overflow-hidden shrink-0 py-0 gap-0 ${enabled.stats_bar ? "grid-cols-3" : "grid-cols-4"}`}>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <Server className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">{hostStatuses.length}</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Total Hosts</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <KeyRound className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">2</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Credentials</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <Network className="size-4 text-muted-foreground shrink-0"/>
                <span className="text-xl font-bold">5</span>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Tunnels</span>
              </div>
              {!enabled.stats_bar && (
                <div className="flex items-center gap-3 px-4 py-2.5">
                  <Activity className="size-4 text-muted-foreground shrink-0"/>
                  <span className="text-xl font-bold text-accent-brand">Healthy</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
                </div>
              )}
            </Card>
          )}

          {enabled.quick_actions && (
            <Card className="flex flex-col overflow-hidden shrink-0 py-0 gap-0">
              <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                <Zap className="size-3.5 text-muted-foreground"/>
                <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Quick Actions</span>
              </div>
              <div className="flex flex-1">
                <div className="flex flex-col flex-1 border-r border-border">
                  <button onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-host")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <Plus className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Add Host</span>
                      <span className="text-xs text-muted-foreground">Register a new server</span>
                    </div>
                  </button>
                  <button onClick={() => onOpenSingletonTab("admin-settings")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <Settings className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Admin Settings</span>
                      <span className="text-xs text-muted-foreground">Configure the application</span>
                    </div>
                  </button>
                </div>
                <div className="flex flex-col flex-1">
                  <button onClick={() => onOpenSingletonTab("host-manager", "host-manager:add-credential")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <KeyRound className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">Add Credential</span>
                      <span className="text-xs text-muted-foreground">Store SSH key or password</span>
                    </div>
                  </button>
                  <button onClick={() => onOpenSingletonTab("user-profile")}
                    className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                    <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-accent-brand/20 group-hover/btn:border-accent-brand/40 transition-colors">
                      <User className="size-3.5 text-accent-brand"/>
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold text-foreground">User Profile</span>
                      <span className="text-xs text-muted-foreground">Manage your account</span>
                    </div>
                  </button>
                </div>
              </div>
            </Card>
          )}

          {enabled.host_status && (
            <Card className="flex flex-col overflow-hidden flex-1 min-h-0 py-0 gap-0">
              <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                <div className="flex items-center gap-2">
                  <Database className="size-3.5 text-muted-foreground"/>
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Host Status</span>
                </div>
                <span className="text-xs text-muted-foreground">{hostStatuses.filter(h => h.online).length}/{hostStatuses.length} online</span>
              </div>
              <div className="flex flex-col overflow-auto flex-1">
                {hostStatuses.map((host, i) => (
                  <div key={i} onClick={() => onOpenTab(host, "stats")} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                    <div className="flex items-center gap-3">
                      <span className={`size-2 rounded-full shrink-0 ${host.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
                      <div className="flex flex-col">
                        <span className="text-sm font-semibold">{host.name}</span>
                        <span className="text-xs text-muted-foreground">{host.address}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {host.online ? (
                        <div className="flex items-center gap-4">
                          <div className="flex flex-col gap-1 w-20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">CPU</span>
                              <span className="text-xs font-bold text-accent-brand">{host.cpu}%</span>
                            </div>
                            <div className="h-1 bg-muted w-full">
                              <div className="h-full bg-accent-brand" style={{ width: `${host.cpu}%` }}/>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 w-20">
                            <div className="flex items-center justify-between">
                              <span className="text-xs text-muted-foreground">RAM</span>
                              <span className="text-xs font-bold text-accent-brand">{host.ram}%</span>
                            </div>
                            <div className="h-1 bg-muted w-full">
                              <div className="h-full bg-accent-brand" style={{ width: `${host.ram}%` }}/>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-4">
                          <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                          <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                        </div>
                      )}
                      <span className={`text-xs px-2.5 py-1 font-semibold border ${host.online ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10" : "border-border text-muted-foreground"}`}>
                        {host.online ? "ONLINE" : "OFFLINE"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        {hasRight && (
          <div className={`w-1/4 min-h-0 flex flex-col gap-3 ${enabled.recent_activity && enabled.network_graph ? "h-full" : ""}`}>
            {enabled.recent_activity && (
              <Card className={`flex flex-col overflow-hidden py-0 gap-0 ${enabled.network_graph ? "flex-1 min-h-0" : "h-full"}`}>
                <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <Activity className="size-3.5 text-muted-foreground"/>
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Recent Activity</span>
                  </div>
                  <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-auto py-0.5 px-2 text-accent-brand">Clear</Button>
                </div>
                <div className="flex flex-col overflow-auto flex-1">
                  {recentActivity.map((item, i) => (
                    <div key={i} onClick={() => { const h = hosts.find(x => x.name === item.host); if (h) onOpenTab(h, "terminal"); }} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50 cursor-pointer">
                      <div className="flex items-center gap-2.5">
                        <span className={`size-1.5 rounded-full shrink-0 ${item.online ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
                        <div className="flex flex-col">
                          <span className="text-xs font-semibold truncate max-w-24">{item.host}</span>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Terminal className="size-3"/>
                            <span className="text-xs">{item.action}</span>
                          </div>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {enabled.network_graph && <NetworkGraphCard />}
          </div>
        )}
      </div>
    </div>
  );
}
