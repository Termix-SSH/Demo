import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { useState, useRef, useCallback, useEffect } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileBottomBar } from "@/ui/shared/MobileBottomBar";
import { CommandPalette } from "@/ui/shared/CommandPalette";
import { AppRail } from "@/ui/sidebar/AppRail";
import type { RailView } from "@/ui/sidebar/AppRail";
import { HostsPanel } from "@/ui/sidebar/HostsPanel";
import { QuickConnectPanel } from "@/ui/sidebar/QuickConnectPanel";
import { SshToolsPanel } from "@/ui/sidebar/SshToolsPanel";
import { SnippetsPanel } from "@/ui/sidebar/SnippetsPanel";
import { HistoryPanel } from "@/ui/sidebar/HistoryPanel";
import { SplitScreenPanel } from "@/ui/sidebar/SplitScreenPanel";
import { UserProfilePanel } from "@/ui/sidebar/UserProfilePanel";
import { AdminSettingsPanel } from "@/ui/sidebar/AdminSettingsPanel";
import { SplitView } from "@/ui/shared/SplitView";
import { TabBar } from "@/ui/tabs/TabBar";
import { hosts, DASHBOARD_TAB, SINGLETON_TAB_LABELS } from "@/ui/utils/data";
import type { Tab, TabType, Host, SplitMode } from "@/ui/utils/types";
export { tabIcon, renderTabContent } from "@/ui/utils/tabUtils";
import { renderTabContent } from "@/ui/utils/tabUtils";

// ─── AppShell ────────────────────────────────────────────────────────────────

export function AppShell({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
  const [activeTabId, setActiveTabId] = useState("dashboard");
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
  const [paneTabIds, setPaneTabIds] = useState<(string | null)[]>(Array(6).fill(null));

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [railView, setRailView] = useState<RailView>("hosts");
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [hostManagerExpanded, setHostManagerExpanded] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [sidebarDragging, setSidebarDragging] = useState(false);

  const isMobile = useIsMobile();

  // Close the sidebar when switching to mobile (it becomes a sheet overlay)
  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
  }, [isMobile]);

  const pendingHostManagerEditId = useRef<string | null>(null);
  const pendingHostManagerAction = useRef<"add-host" | "add-credential" | null>(null);
  const lastShiftTime = useRef(0);

  const sidebarTitle: Record<RailView, string> = {
    "hosts":          "Hosts",
    "quick-connect":  "Quick Connect",
    "ssh-tools":      "SSH Tools",
    "snippets":       "Snippets",
    "history":        "History",
    "split-screen":   "Split Screen",
    "user-profile":   "User Profile",
    "admin-settings": "Admin Settings",
  };

  // Double-shift opens command palette
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

  // Let HostManager trigger tab opens via custom event
  useEffect(() => {
    const handle = (e: Event) => {
      const { hostId, type } = (e as CustomEvent<{ hostId: string; type?: TabType }>).detail;
      const host = hosts.find(h => h.id === hostId);
      if (host) connectHost(host, type);
    };
    window.addEventListener("termix:open-tab", handle);
    return () => window.removeEventListener("termix:open-tab", handle);
  }, [tabs]);

  // ─── Tab management ──────────────────────────────────────────────────────

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

  function connectHost(host: Host, preferredType?: TabType) {
    const type: TabType =
      preferredType ??
      (host.connectionType === "rdp"    ? "rdp"    :
       host.connectionType === "vnc"    ? "vnc"    :
       host.connectionType === "telnet" ? "telnet" :
       "terminal");
    openTab(host, type);
  }

  function openSingletonTab(type: TabType, pendingEvent?: string) {
    if (type === "host-manager") {
      if (pendingEvent === "host-manager:add-host") pendingHostManagerAction.current = "add-host";
      else if (pendingEvent === "host-manager:add-credential") pendingHostManagerAction.current = "add-credential";
      
      setHostManagerExpanded(true);
      setSidebarOpen(true);
      setRailView("hosts");

      if (pendingEvent) {
        // Use a small delay to ensure HostManager is mounted if it wasn't already,
        // and to allow the current render cycle to complete.
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent(pendingEvent));
        }, 0);
      }
      return;
    }
    if (type === "user-profile" || type === "admin-settings") {
      handleRailClick(type as RailView);
      return;
    }
    const id = type;
    setTabs(prev => {
      if (prev.find(t => t.id === id)) return prev;
      return [...prev, { id, type, label: SINGLETON_TAB_LABELS[type] ?? type }];
    });
    setActiveTabId(id);
  }

  function closeTab(id: string) {
    setTabs(prev => {
      const next = prev.filter(t => t.id !== id);
      if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }

  // ─── Rail / sidebar ──────────────────────────────────────────────────────

  function handleRailClick(view: RailView) {
    if (railView === view && sidebarOpen) {
      setSidebarOpen(false);
    } else {
      setRailView(view);
      setSidebarOpen(true);
    }
  }

  function editHostInManager(host: Host) {
    pendingHostManagerEditId.current = host.id;
    setHostManagerExpanded(true);
    setSidebarOpen(true);
    setRailView("hosts");
  }

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

  const activeTab = tabs.find(t => t.id === activeTabId)!;
  const isSplit = splitMode !== "none";
  const terminalTabs = tabs.filter(t => t.type === "terminal");

  // Sidebar panel content — shared between desktop inline sidebar and mobile sheet
  const sidebarPanelContent = (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {railView === "hosts" && (
        <HostsPanel
          expanded={hostManagerExpanded}
          onExpand={() => setHostManagerExpanded(true)}
          onCollapse={() => setHostManagerExpanded(false)}
          pendingEditId={pendingHostManagerEditId}
          pendingAction={pendingHostManagerAction}
          onOpenTab={(host, type) => { connectHost(host, type); if (isMobile) setSidebarOpen(false); }}
          onEditHost={editHostInManager}
        />
      )}

      {railView === "quick-connect" && <QuickConnectPanel/>}

      {railView === "ssh-tools" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SshToolsPanel terminalTabs={terminalTabs} activeTabId={activeTabId}/>
        </div>
      )}

      {railView === "snippets" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SnippetsPanel terminalTabs={terminalTabs} activeTabId={activeTabId}/>
        </div>
      )}

      {railView === "history" && (
        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
          <HistoryPanel terminalTabs={terminalTabs} activeTabId={activeTabId}/>
        </div>
      )}

      {railView === "split-screen" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <SplitScreenPanel
            tabs={tabs}
            splitMode={splitMode}
            setSplitMode={setSplitMode}
            paneTabIds={paneTabIds}
            setPaneTabIds={setPaneTabIds}
          />
        </div>
      )}

      {railView === "user-profile" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <UserProfilePanel />
        </div>
      )}

      {railView === "admin-settings" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <AdminSettingsPanel />
        </div>
      )}
    </div>
  );

  // Sidebar header — shared
  const sidebarHeader = (
    <div className="flex flex-row items-center border-b border-border h-12.5 shrink-0">
      <span className="flex-1 text-base font-bold tracking-tight text-foreground px-3">
        {sidebarTitle[railView]}
      </span>
      {!hostManagerExpanded && !isMobile && (
        <>
          <Separator orientation="vertical"/>
          <Button
            variant="ghost"
            size="icon"
            className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground"
            title="Reset width"
            onClick={() => setSidebarWidth(256)}
          >
            <Maximize2 className="size-3.5"/>
          </Button>
        </>
      )}
      <Separator orientation="vertical"/>
      <Button
        variant="ghost"
        size="icon"
        className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground"
        onClick={() => { setSidebarOpen(false); setHostManagerExpanded(false); }}
      >
        <ChevronLeft className="size-4"/>
      </Button>
    </div>
  );

  return (
    <>
      <div className="flex w-screen bg-background" style={{ height: "100dvh" }}>
        {/* Skinny icon rail — desktop only, hidden on mobile */}
        <AppRail
          railView={railView}
          sidebarOpen={sidebarOpen}
          splitMode={splitMode}
          username={username}
          profileDropdownOpen={profileDropdownOpen}
          onProfileDropdownChange={setProfileDropdownOpen}
          onRailClick={handleRailClick}
          onLogout={onLogout}
        />

        {/* Desktop: inline resizable sidebar */}
        {!isMobile && (
          <div
            className={`relative flex flex-col bg-sidebar shrink-0 overflow-hidden ${sidebarOpen ? `border-r transition-colors ${sidebarDragging ? "border-accent-brand/60" : "border-border"}` : ""}`}
            style={{
              width: sidebarOpen ? (hostManagerExpanded && railView === "hosts" ? 720 : sidebarWidth) : 0,
              transition: sidebarDragging ? "none" : "width 0.2s",
            }}
          >
            {sidebarHeader}
            {sidebarPanelContent}

            {sidebarOpen && !(hostManagerExpanded && railView === "hosts") && (
              <div
                onMouseDown={onSidebarMouseDown}
                className={`absolute right-0 top-0 bottom-0 w-1 cursor-col-resize z-30 transition-colors ${sidebarDragging ? "bg-accent-brand/60" : "hover:bg-accent-brand/40"}`}
              />
            )}
          </div>
        )}

        {/* Mobile: sidebar as overlay sheet */}
        {isMobile && (
          <Sheet open={sidebarOpen} onOpenChange={open => { setSidebarOpen(open); if (!open) setHostManagerExpanded(false); }}>
            <SheetContent
              side="left"
              showCloseButton={false}
              className="p-0 flex flex-col w-[min(85vw,360px)] max-w-full bg-sidebar border-r border-border gap-0"
              style={{ height: "100dvh" }}
            >
              {sidebarHeader}
              {sidebarPanelContent}
            </SheetContent>
          </Sheet>
        )}

        {/* Main content area */}
        <div className={`relative flex flex-col flex-1 min-w-0 overflow-hidden transition-all duration-200 ${!isMobile && !sidebarOpen ? "pl-6" : ""}`}>
          {!isMobile && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              title="Open Sidebar"
              className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-6 bg-sidebar border-r border-border text-muted-foreground hover:text-accent-brand hover:bg-accent-brand/5 transition-colors"
            >
              <ChevronRight className="size-3.5"/>
            </button>
          )}
          <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
            <TabBar
              tabs={tabs}
              activeTabId={activeTabId}
              onSetActiveTab={setActiveTabId}
              onCloseTab={closeTab}
              onReorderTabs={setTabs}
            />
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {isSplit && !isMobile ? (
                <SplitView
                  tabs={tabs}
                  paneTabIds={paneTabIds}
                  splitMode={splitMode}
                  onOpenSingletonTab={openSingletonTab}
                  onOpenTab={openTab}
                />
              ) : (
                activeTab ? renderTabContent(activeTab, openSingletonTab, openTab) : null
              )}
            </div>
          </div>

          {/* Bottom nav bar — mobile only */}
          <MobileBottomBar
            railView={railView}
            sidebarOpen={sidebarOpen}
            splitMode={splitMode}
            onRailClick={handleRailClick}
          />
        </div>
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        setIsOpen={setCommandPaletteOpen}
        hosts={hosts}
        onOpenTab={(type, label, pendingEvent) => {
          if (["dashboard", "host-manager", "user-profile", "admin-settings", "docker", "tunnel"].includes(type)) {
            openSingletonTab(type, pendingEvent);
          } else if (label) {
            const host = hosts.find(h => h.name === label);
            if (host) openTab(host, type);
          }
        }}
      />
    </>
  );
}
