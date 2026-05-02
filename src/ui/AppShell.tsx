import Logo from "@/assets/icon.svg?react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Box,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FolderSearch,
  Hammer,
  KeyRound,
  LayoutDashboard,
  Menu,
  Network,
  RefreshCw,
  Server,
  Settings,
  Terminal,
  User,
  X,
  Zap,
} from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { CommandPalette } from "@/ui/CommandPalette";
import { FileManager } from "@/ui/tabs/FileManagerTab";
import { DashboardTab } from "@/ui/tabs/DashboardTab";
import { TerminalTab } from "@/ui/tabs/TerminalTab";
import { StatsTab } from "@/ui/tabs/StatsTab";
import { HostManagerTab } from "@/ui/tabs/HostManagerTab";
import { UserProfileTab } from "@/ui/tabs/UserProfileTab";
import { AdminSettingsTab } from "@/ui/tabs/AdminSettingsTab";
import { DockerTab } from "@/ui/tabs/DockerTab";
import { TunnelTab } from "@/ui/tabs/TunnelTab";
import { ToolsSidebar } from "@/ui/ToolsSidebar";
import { QuickConnectDialog } from "@/ui/QuickConnectDialog";
import { HostItem, FolderItem, isFolder } from "@/ui/sidebar/SidebarTree";
import { hosts, hostTree, DASHBOARD_TAB, SINGLETON_TAB_LABELS } from "@/ui/data";
import type { Tab, TabType, Host } from "@/ui/types";

function tabIcon(type: TabType) {
  switch (type) {
    case "dashboard":      return <LayoutDashboard className="size-3.5"/>;
    case "terminal":       return <Terminal className="size-3.5"/>;
    case "stats":          return <Server className="size-3.5"/>;
    case "files":          return <FolderSearch className="size-3.5"/>;
    case "host-manager":   return <Server className="size-3.5"/>;
    case "user-profile":   return <User className="size-3.5"/>;
    case "admin-settings": return <Settings className="size-3.5"/>;
    case "docker":         return <Box className="size-3.5"/>;
    case "tunnel":         return <Network className="size-3.5"/>;
  }
}

function FilesTab({ label }: { label: string }) {
  return <FileManager label={label}/>;
}

export function AppShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
  const [activeTabId, setActiveTabId] = useState("dashboard");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const lastShiftTime = useRef(0);
  const pendingHostManagerEvent = useRef<string | null>(null);

  useEffect(() => {
    if (activeTabId === "host-manager" && pendingHostManagerEvent.current) {
      const eventName = pendingHostManagerEvent.current;
      pendingHostManagerEvent.current = null;
      window.dispatchEvent(new Event(eventName));
    }
  }, [activeTabId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "ShiftLeft") {
        const now = Date.now();
        if (now - lastShiftTime.current < 300) setCommandPaletteOpen(prev => !prev);
        lastShiftTime.current = now;
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const handle = () => onLogout();
    window.addEventListener("termix:logout", handle);
    return () => window.removeEventListener("termix:logout", handle);
  }, [onLogout]);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0) { e.preventDefault(); el.scrollLeft += e.deltaY; }
    };
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, []);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tabBarOpen, setTabBarOpen] = useState(true);
  const [quickConnectOpen, setQuickConnectOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [toolsWidth, setToolsWidth] = useState(304);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const [toolsDragging, setToolsDragging] = useState(false);
  const [dragTabId, setDragTabId] = useState<string | null>(null);
  const [dragTargetIndex, setDragTargetIndex] = useState<number | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const tabEls = useRef<Map<string, HTMLDivElement>>(new Map());
  const dragData = useRef<{
    id: string; index: number; startX: number; startY: number;
    offsetX: number; width: number; barTop: number; barHeight: number; x: number; y: number;
  } | null>(null);
  const [dragPos, setDragPos] = useState<{ x: number; y: number } | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const didDrag = useRef(false);

  useEffect(() => {
    if (!dragTabId) return;

    function onPointerMove(e: PointerEvent) {
      if (!dragData.current || !tabBarRef.current) return;
      const d = dragData.current;
      if (Math.abs(e.clientX - d.startX) > 5) didDrag.current = true;

      const barRect = tabBarRef.current.getBoundingClientRect();
      const x = Math.max(barRect.left, Math.min(barRect.right - d.width, e.clientX - d.offsetX));
      const y = d.barTop;
      setDragPos({ x, y });

      const centerX = e.clientX - d.offsetX + d.width / 2;
      let newTarget = d.index;
      tabEls.current.forEach((el, id) => {
        if (id === d.id) return;
        const rect = el.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        const idx = tabs.findIndex(t => t.id === id);
        if (idx < d.index && centerX < mid) newTarget = Math.min(newTarget, idx);
        if (idx > d.index && centerX > mid) newTarget = Math.max(newTarget, idx);
      });

      if (tabs[0].type === "dashboard") newTarget = Math.max(1, newTarget);
      dragTargetRef.current = newTarget;
      setDragTargetIndex(newTarget);
    }

    function onPointerUp() {
      if (!dragData.current) return;
      const { id, index } = dragData.current;
      const to = dragTargetRef.current ?? index;
      if (to !== index) {
        setTabs(prev => {
          if (prev[0].id === id) return prev;
          const next = [...prev];
          next.splice(to, 0, next.splice(index, 1)[0]);
          return next;
        });
      }
      dragData.current = null;
      dragTargetRef.current = null;
      setDragTabId(null);
      setDragTargetIndex(null);
      setDragPos(null);
      setTimeout(() => { didDrag.current = false; }, 0);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [dragTabId, tabs]);

  const onSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setSidebarDragging(true);
    const startX = e.clientX;
    const startW = sidebarWidth;
    function onMove(ev: MouseEvent) { setSidebarWidth(Math.max(160, Math.min(480, startW + ev.clientX - startX))); }
    function onUp() { setSidebarDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [sidebarWidth]);

  const onToolsMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setToolsDragging(true);
    const startX = e.clientX;
    const startW = toolsWidth;
    function onMove(ev: MouseEvent) { setToolsWidth(Math.max(200, Math.min(600, startW - (ev.clientX - startX)))); }
    function onUp() { setToolsDragging(false); window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [toolsWidth]);

  function openTab(host: Host, type: TabType) {
    setTabs(prev => {
      const same = prev.filter(t => t.type === type && t.label.replace(/ \(\d+\)$/, "") === host.name);
      if (same.length === 0) {
        const tab = { id: `${host.name}-${type}`, type, label: host.name };
        setActiveTabId(tab.id);
        return [...prev, tab];
      }
      const next = prev.map(t =>
        t.id === same[0].id && !/\(\d+\)$/.test(t.label) ? { ...t, label: `${host.name} (1)` } : t
      );
      const tab = { id: `${host.name}-${type}-${Date.now()}`, type, label: `${host.name} (${same.length + 1})` };
      setActiveTabId(tab.id);
      return [...next, tab];
    });
  }

  function openSingletonTab(type: TabType, pendingEvent?: string) {
    const id = type;
    if (pendingEvent) pendingHostManagerEvent.current = pendingEvent;
    setTabs(prev => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, { id, type, label: SINGLETON_TAB_LABELS[type] ?? type }];
    });
    setActiveTabId(id);
  }

  return (
    <>
      <div className="flex w-screen h-screen bg-background">
        <div
          className={`relative flex flex-col bg-sidebar shrink-0 overflow-hidden ${sidebarOpen ? `border-r transition-colors ${sidebarDragging ? "border-accent-brand/60" : "border-border"}` : ""}`}
          style={{ width: sidebarOpen ? sidebarWidth : 0, transition: sidebarOpen ? undefined : "width 0.2s" }}
        >
          <div className="flex flex-row items-center gap-2 border-b border-border h-12.5 px-3 shrink-0">
            <Logo className="w-6 h-6 shrink-0 text-muted-foreground"/>
            <span className="text-xl font-semibold text-muted-foreground">Termix</span>
            <Button variant="ghost" size="icon" className="ml-auto size-7 text-muted-foreground" onClick={() => setSidebarWidth(256)}>
              <RefreshCw className="size-3.5"/>
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" onClick={() => setSidebarOpen(false)}>
              <Menu className="size-3.5"/>
            </Button>
          </div>
          <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
            <div className="p-2">
              <Button variant="outline" className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={() => openSingletonTab("host-manager")}>
                <Server/>Host Manager
              </Button>
            </div>
            <Separator/>
            <div className="p-2">
              <Input placeholder="Search hosts..."/>
            </div>
            <Separator/>
            <div className="px-2 py-1">
              {hostTree.children.map((child, i) =>
                isFolder(child)
                  ? <FolderItem key={i} folder={child} onOpenTab={openTab}/>
                  : <HostItem key={i} host={child} onOpenTab={(type) => openTab(child, type)}/>
              )}
            </div>
          </div>
          <div className="border-t border-border p-1 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-full justify-between h-auto py-2 px-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                      {username.charAt(0).toUpperCase() || "U"}
                    </div>
                    <div className="flex flex-col items-start text-left">
                      <span className="text-sm font-semibold leading-tight">{username || "User"}</span>
                      <span className="text-xs text-muted-foreground leading-tight">Administrator</span>
                    </div>
                  </div>
                  <ChevronUp className="text-accent-brand"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" sideOffset={5} avoidCollisions={false} style={{ width: sidebarWidth - 1 }} className="[clip-path:inset(-4px_0px_0px_0px)]">
                <DropdownMenuItem onClick={() => openSingletonTab("user-profile")}>
                  <User className="size-3.5"/>User Profile
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openSingletonTab("admin-settings")}>
                  <Settings className="size-3.5"/>Admin Settings
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onClick={onLogout}>
                  <KeyRound className="size-3.5"/>Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          {sidebarOpen && (
            <div
              onMouseDown={onSidebarMouseDown}
              className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${sidebarDragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"}`}
            />
          )}
        </div>

        <div className={`relative flex flex-row flex-1 min-w-0 overflow-hidden transition-all duration-200 ${!sidebarOpen ? "pl-4" : ""}`}>
          {!sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-4 bg-sidebar border-r border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              <ChevronRight className="size-3"/>
            </button>
          )}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <div className={`flex items-end bg-sidebar shrink-0 min-w-0 transition-all duration-200 ${tabBarOpen ? "h-12.5 border-b border-border" : "h-0"}`}>
              <div ref={tabBarRef} className="flex h-full flex-1 min-w-0 overflow-x-auto scrollbar-none pl-px">
                {tabs.map((tab, index) => {
                  const active = tab.id === activeTabId;
                  const isDragging = dragTabId === tab.id;
                  const dragIdx = tabs.findIndex(t => t.id === dragTabId);
                  const target = dragTargetIndex ?? dragIdx;
                  let translateX = 0;
                  if (dragTabId && !isDragging && dragIdx !== -1 && target !== null && target !== dragIdx) {
                    const draggedWidth = tabEls.current.get(dragTabId)?.offsetWidth ?? 0;
                    if (dragIdx < target && index > dragIdx && index <= target) translateX = -(draggedWidth);
                    else if (dragIdx > target && index < dragIdx && index >= target) translateX = draggedWidth;
                  }
                  return (
                    <div
                      key={tab.id}
                      ref={el => { if (el) tabEls.current.set(tab.id, el); else tabEls.current.delete(tab.id); }}
                      onClick={() => !dragTabId && !didDrag.current && setActiveTabId(tab.id)}
                      onMouseDown={e => {
                        if (e.button === 1 && tab.type !== "dashboard") {
                          e.preventDefault();
                          setTabs(prev => {
                            const next = prev.filter(t => t.id !== tab.id);
                            if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                            return next;
                          });
                        }
                      }}
                      onPointerDown={e => {
                        if (e.button !== 0 || tab.type === "dashboard") return;
                        e.preventDefault();
                        const el = tabEls.current.get(tab.id);
                        if (!el || !tabBarRef.current) return;
                        const rect = el.getBoundingClientRect();
                        const barRect = tabBarRef.current.getBoundingClientRect();
                        dragData.current = {
                          id: tab.id, index,
                          startX: e.clientX, startY: e.clientY,
                          offsetX: e.clientX - rect.left,
                          width: rect.width,
                          barTop: barRect.top, barHeight: barRect.height,
                          x: rect.left, y: barRect.top,
                        };
                        setDragTabId(tab.id);
                        setDragTargetIndex(index);
                        setDragPos({ x: rect.left, y: barRect.top });
                        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                      }}
                      style={{
                        transform: isDragging ? "none" : `translateX(${translateX}px)`,
                        transition: dragTabId && !isDragging ? "transform 200ms ease" : "none",
                        opacity: isDragging ? 0 : 1,
                        cursor: tab.type === "dashboard" ? "pointer" : isDragging ? "grabbing" : "grab",
                        userSelect: "none",
                      }}
                      className={`group/tab flex items-center gap-2 shrink-0 transition-colors border-r border-border text-sm
                        ${index === 0 && tab.type !== "dashboard" ? "border-l border-border" : ""}
                        ${tab.type === "dashboard"
                          ? `px-3.5 ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                          : `px-4 font-medium ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                        }`}
                    >
                      {tabIcon(tab.type)}
                      {tab.type !== "dashboard" && tab.label}
                      {tab.type !== "dashboard" && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            setTabs(prev => {
                              const next = prev.filter(t => t.id !== tab.id);
                              if (active) setActiveTabId(next[next.length - 1].id);
                              return next;
                            });
                          }}
                          className={`flex items-center justify-center size-4 rounded-sm transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted ml-1 ${active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"}`}
                        >
                          <X className="size-3"/>
                        </button>
                      )}
                    </div>
                  );
                })}
                {dragTabId && dragPos && (() => {
                  const tab = tabs.find(t => t.id === dragTabId)!;
                  const active = tab.id === activeTabId;
                  return (
                    <div
                      style={{
                        position: "fixed",
                        left: dragPos.x, top: dragPos.y,
                        width: tabEls.current.get(dragTabId)?.offsetWidth,
                        height: tabEls.current.get(dragTabId)?.offsetHeight,
                        pointerEvents: "none", zIndex: 9999, opacity: 0.85,
                      }}
                      className={`flex items-center gap-2 shrink-0 border border-border text-sm shadow-lg
                        ${tab.type === "dashboard"
                          ? `px-3.5 ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "bg-sidebar text-muted-foreground"}`
                          : `px-4 font-medium ${active ? "border-b-2 border-b-accent-brand bg-surface text-foreground" : "bg-sidebar text-muted-foreground"}`
                        }`}
                    >
                      {tabIcon(tab.type)}
                      {tab.type !== "dashboard" && tab.label}
                    </div>
                  );
                })()}
              </div>
              <div className="flex items-center h-full shrink-0">
                <Separator orientation="vertical"/>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground">
                      <ChevronDown className="size-4"/>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" sideOffset={1} className="w-56 border-t-0 [clip-path:inset(0px_-4px_-4px_-4px)]">
                    {tabs.map(tab => (
                      <DropdownMenuItem
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`flex items-center justify-between ${tab.id === activeTabId ? "text-foreground" : ""}`}
                      >
                        <div className="flex items-center gap-2">
                          {tabIcon(tab.type)}
                          {tab.type === "dashboard" ? "Dashboard" : tab.label}
                        </div>
                        {tab.type !== "dashboard" && (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              setTabs(prev => {
                                const next = prev.filter(t => t.id !== tab.id);
                                if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                                return next;
                              });
                            }}
                            className="text-muted-foreground hover:text-foreground ml-2"
                          >
                            <X className="size-3"/>
                          </button>
                        )}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
                <Separator orientation="vertical"/>
                <Button
                  variant="ghost" size="icon"
                  className={`h-full w-12.5 rounded-none hover:text-foreground ${toolsOpen ? "text-accent-brand bg-accent-brand/10" : "text-muted-foreground"}`}
                  onClick={() => setToolsOpen(o => !o)}
                >
                  <Hammer className="size-4"/>
                </Button>
                <Separator orientation="vertical"/>
                <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground" onClick={() => setQuickConnectOpen(true)}>
                  <Zap className="size-4"/>
                </Button>
                <Separator orientation="vertical"/>
                <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground" onClick={() => setTabBarOpen(o => !o)}>
                  <ChevronUp className={`size-4 transition-transform ${tabBarOpen ? "" : "rotate-180"}`}/>
                </Button>
              </div>
            </div>
            {!tabBarOpen && (
              <button onClick={() => setTabBarOpen(true)} className="flex items-center justify-center w-full h-4 bg-sidebar border-b border-border text-muted-foreground hover:text-foreground transition-colors shrink-0">
                <ChevronDown className="size-3"/>
              </button>
            )}
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {(() => {
                const activeTab = tabs.find(t => t.id === activeTabId)!;
                switch (activeTab.type) {
                  case "dashboard":      return <DashboardTab onOpenSingletonTab={openSingletonTab} onOpenTab={openTab}/>;
                  case "terminal":       return <TerminalTab label={activeTab.label}/>;
                  case "stats":          return <StatsTab label={activeTab.label}/>;
                  case "files":          return <FilesTab label={activeTab.label}/>;
                  case "host-manager":   return <HostManagerTab/>;
                  case "user-profile":   return <UserProfileTab/>;
                  case "admin-settings": return <AdminSettingsTab/>;
                  case "docker":         return <DockerTab label={activeTab.label}/>;
                  case "tunnel":         return <TunnelTab label={activeTab.label}/>;
                }
              })()}
            </div>
          </div>
          <div
            className={`relative flex flex-col bg-sidebar shrink-0 overflow-hidden ${toolsOpen ? `border-l transition-colors ${toolsDragging ? "border-accent-brand/60" : "border-border"}` : ""}`}
            style={{ width: toolsOpen ? toolsWidth : 0, transition: toolsOpen ? undefined : "width 0.2s" }}
          >
            {toolsOpen && (
              <div
                onMouseDown={onToolsMouseDown}
                className={`absolute left-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${toolsDragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"}`}
              />
            )}
            <ToolsSidebar onClose={() => setToolsOpen(false)} tabs={tabs} width={toolsWidth} onResetWidth={() => setToolsWidth(304)}/>
          </div>
        </div>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        setIsOpen={setCommandPaletteOpen}
        hosts={hosts}
        onOpenTab={(type, label) => {
          if (["dashboard", "host-manager", "user-profile", "admin-settings", "docker", "tunnel"].includes(type)) {
            openSingletonTab(type);
          } else if (label) {
            const host = hosts.find(h => h.name === label);
            if (host) openTab(host, type);
          }
        }}
      />
      <QuickConnectDialog open={quickConnectOpen} onOpenChange={setQuickConnectOpen}/>
    </>
  );
}
