import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Box,
  ChevronDown,
  Cloud,
  Copy,
  Cpu,
  Database,
  Folder,
  FolderSearch,
  Globe,
  LayoutDashboard,
  LayoutPanelLeft,
  Network,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Share2,
  Terminal,
  Trash2,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  TOOLS_TABS,
  SPLIT_MODES,
  FOLDER_COLORS,
  INITIAL_FOLDERS,
  INITIAL_SNIPPETS,
  HISTORY_ENTRIES,
  PANE_COUNTS,
} from "@/ui/data";
import { FOLDER_ICONS } from "@/ui/types";
import { tabIcon } from "@/ui/AppShell";
import type { Tab, ToolsTab, SplitMode, Snippet, SnippetFolder, FolderIconId } from "@/ui/types";

function FolderIconEl({ icon, className, style }: { icon: FolderIconId; className?: string; style?: React.CSSProperties }) {
  const props = { className, style };
  switch (icon) {
    case "folder":   return <Folder {...props}/>;
    case "server":   return <Server {...props}/>;
    case "cloud":    return <Cloud {...props}/>;
    case "database": return <Database {...props}/>;
    case "box":      return <Box {...props}/>;
    case "network":  return <Network {...props}/>;
    case "copy":     return <Copy {...props}/>;
    case "settings": return <Settings {...props}/>;
    case "cpu":      return <Cpu {...props}/>;
    case "globe":    return <Globe {...props}/>;
  }
}

function CreateSnippetDialog({ open, onOpenChange, folders, onCreate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  folders: SnippetFolder[];
  onCreate: (s: Omit<Snippet, "id">) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [command, setCommand] = useState("");

  function handleCreate() {
    if (!name.trim() || !command.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() || undefined, command: command.trim(), folderId });
    setName(""); setDescription(""); setFolderId(null); setCommand("");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create Snippet</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Create a new command snippet for quick execution
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Name <span className="text-accent-brand">*</span></label>
            <Input placeholder="e.g., Restart Nginx" value={name} onChange={e => setName(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Description <span className="font-normal">(Optional)</span></label>
            <Input placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
              <Folder className="size-3.5"/>
              Folder <span className="font-normal">(Optional)</span>
            </label>
            <select
              value={folderId ?? ""}
              onChange={e => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
              className="px-3 py-2 text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">No folder (Uncategorized)</option>
              {folders.filter(f => f.name !== "Uncategorized").map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Command <span className="text-accent-brand">*</span></label>
            <textarea
              placeholder="e.g., sudo systemctl restart nginx"
              value={command}
              onChange={e => setCommand(e.target.value)}
              className="w-full h-36 px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={handleCreate}>
            Create Snippet
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CreateFolderDialog({ open, onOpenChange, onCreate }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (f: Omit<SnippetFolder, "id" | "open">) => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(FOLDER_COLORS[0]);
  const [icon, setIcon] = useState<FolderIconId>("folder");

  function handleCreate() {
    if (!name.trim()) return;
    onCreate({ name: name.trim(), color, icon });
    setName(""); setColor(FOLDER_COLORS[0]); setIcon("folder");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">Create Folder</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Organize your snippets into folders
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4 mt-1">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Folder Name <span className="text-accent-brand">*</span></label>
            <Input placeholder="e.g., System Commands, Docker Scripts" value={name} onChange={e => setName(e.target.value)}/>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold">Folder Color</label>
            <div className="grid grid-cols-4 gap-2">
              {FOLDER_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`h-10 transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/50" : "opacity-75 hover:opacity-100"}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold">Folder Icon</label>
            <div className="grid grid-cols-5 gap-2">
              {FOLDER_ICONS.map(ic => (
                <button
                  key={ic}
                  onClick={() => setIcon(ic)}
                  className={`flex items-center justify-center h-11 border transition-colors ${
                    icon === ic
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                  }`}
                >
                  <FolderIconEl icon={ic} className="size-5"/>
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold">Preview</label>
            <div className="flex items-center gap-2 px-3 py-3 border border-border bg-muted/20">
              <FolderIconEl icon={icon} className="size-4 shrink-0" style={{ color }}/>
              <span className="text-sm font-semibold">{name || "Folder Name"}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={handleCreate}>
            Create Folder
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HistoryTab() {
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState(HISTORY_ENTRIES);

  const filtered = search
    ? entries.filter(e =>
        e.command.toLowerCase().includes(search.toLowerCase()) ||
        e.host.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
        <Input placeholder="Search history..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8"/>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setEntries([])} className="text-xs text-accent-brand hover:text-accent-brand/70">
          Clear All
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <span className="text-xs text-muted-foreground/60 text-center py-8">No history entries</span>
        )}
        {filtered.map(entry => (
          <div key={entry.id} className="group flex flex-col gap-1 px-2.5 py-2 border border-border bg-background hover:border-muted-foreground/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-mono text-foreground break-all leading-relaxed">{entry.command}</span>
              <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(entry.command)}>
                  <Copy className="size-3"/>
                </Button>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}>
                  <Trash2 className="size-3"/>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60">{entry.host}</span>
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground/60">{entry.time}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Layout previews for each split mode
const LAYOUT_PREVIEWS: Record<SplitMode, React.ReactNode> = {
  "none": (
    <div className="size-full border-2 border-current"/>
  ),
  "2-way": (
    <div className="flex gap-0.5 size-full">
      <div className="flex-1 border-2 border-current"/>
      <div className="flex-1 border-2 border-current"/>
    </div>
  ),
  "3-way": (
    <div className="flex gap-0.5 size-full">
      <div className="flex-1 border-2 border-current"/>
      <div className="flex flex-col flex-1 gap-0.5">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
      </div>
    </div>
  ),
  "4-way": (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5 size-full">
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
    </div>
  ),
  "5-way": (
    <div className="flex flex-col gap-0.5 size-full">
      <div className="flex gap-0.5 flex-1">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
      </div>
      <div className="flex gap-0.5 flex-1">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-[2] border-2 border-current"/>
      </div>
    </div>
  ),
  "6-way": (
    <div className="grid grid-cols-3 grid-rows-2 gap-0.5 size-full">
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
    </div>
  ),
};

function SplitScreenTab({ tabs, splitMode, setSplitMode, paneTabIds, setPaneTabIds }: {
  tabs: Tab[];
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  paneTabIds: (string | null)[];
  setPaneTabIds: (ids: (string | null)[]) => void;
}) {
  const paneCount = PANE_COUNTS[splitMode];
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<number | null>(null);

  function handleDrop(paneIndex: number) {
    if (draggingTabId === null) return;
    const next = [...paneTabIds];
    next[paneIndex] = draggingTabId;
    setPaneTabIds(next);
    setDraggingTabId(null);
    setDragOverPane(null);
  }

  function clearPane(paneIndex: number) {
    const next = [...paneTabIds];
    next[paneIndex] = null;
    setPaneTabIds(next);
  }

  function resetAll() {
    setSplitMode("none");
    setPaneTabIds(Array(6).fill(null));
  }

  const activeCount = paneTabIds.slice(0, Math.max(paneCount, 0)).filter(Boolean).length;

  return (
    <>
      {/* Mode selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Layout</span>
          {splitMode !== "none" && (
            <span className="text-xs border border-accent-brand/40 text-accent-brand px-1.5 py-0.5 leading-tight">
              {splitMode}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SPLIT_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setSplitMode(mode.id)}
              className={`flex flex-col items-center gap-1.5 p-2 border transition-colors ${
                splitMode === mode.id
                  ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
              }`}
            >
              <div className={`w-10 h-7 ${splitMode === mode.id ? "text-accent-brand" : "text-muted-foreground/40"}`}>
                {LAYOUT_PREVIEWS[mode.id]}
              </div>
              <span className="text-xs font-semibold">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {splitMode === "none" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center border border-dashed border-border">
          <LayoutPanelLeft className="size-8 text-muted-foreground/30"/>
          <span className="text-sm text-muted-foreground">Select a layout above</span>
          <span className="text-xs text-muted-foreground/60">Choose how many panes to display</span>
        </div>
      ) : (
        <>
          <Separator/>

          {/* Pane assignment */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Panes</span>
              <span className="text-xs text-muted-foreground">{activeCount}/{paneCount} assigned</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: paneCount }).map((_, i) => {
                const assignedId = paneTabIds[i];
                const assignedTab = assignedId ? tabs.find(t => t.id === assignedId) : null;
                const isOver = dragOverPane === i;
                return (
                  <div
                    key={i}
                    onDragOver={e => { e.preventDefault(); setDragOverPane(i); }}
                    onDragLeave={() => setDragOverPane(null)}
                    onDrop={() => handleDrop(i)}
                    className={`relative flex flex-col items-center justify-center gap-1 p-2 min-h-[52px] border transition-colors ${
                      isOver
                        ? "border-accent-brand bg-accent-brand/10"
                        : assignedTab
                          ? "border-border bg-muted/20"
                          : "border-dashed border-border/60 bg-muted/5 hover:border-border hover:bg-muted/10"
                    }`}
                  >
                    <span className="absolute top-1 left-1.5 text-[10px] text-muted-foreground/40 font-mono leading-none">{i + 1}</span>
                    {assignedTab ? (
                      <>
                        <div className="flex items-center gap-1 px-1 w-full justify-center">
                          <span className="text-muted-foreground shrink-0">{tabIcon(assignedTab.type)}</span>
                          <span className="text-xs font-semibold truncate max-w-[70px]">
                            {assignedTab.type === "dashboard" ? "Dashboard" : assignedTab.label}
                          </span>
                        </div>
                        <button
                          onClick={() => clearPane(i)}
                          className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-2.5"/>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">
                        {isOver ? "Drop here" : "Empty"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator/>

          {/* Tab list to drag from */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Open Tabs</span>
            <span className="text-xs text-muted-foreground/60">Drag tabs into panes above</span>
            <div className="flex flex-col gap-1 mt-0.5">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => setDraggingTabId(tab.id)}
                  onDragEnd={() => { setDraggingTabId(null); setDragOverPane(null); }}
                  className={`flex items-center gap-2 px-2.5 py-2 border cursor-grab active:cursor-grabbing select-none transition-colors ${
                    draggingTabId === tab.id
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                  }`}
                >
                  <span className="text-muted-foreground shrink-0">{tabIcon(tab.type)}</span>
                  <span className="text-xs font-medium flex-1 truncate">
                    {tab.type === "dashboard" ? "Dashboard" : tab.label}
                  </span>
                  <div className="grid grid-cols-2 gap-px opacity-30 shrink-0">
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={resetAll}
          >
            <X className="size-3"/>
            Clear Split Screen
          </Button>
        </>
      )}
    </>
  );
}

export function ToolsSidebar({ onClose, tabs, width, onResetWidth, splitMode, setSplitMode, paneTabIds, setPaneTabIds }: {
  onClose: () => void;
  tabs: Tab[];
  width: number;
  onResetWidth: () => void;
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  paneTabIds: (string | null)[];
  setPaneTabIds: (ids: (string | null)[]) => void;
}) {
  const [activeTab, setActiveTab] = useState<ToolsTab>("ssh-tools");
  const [snippetSearch, setSnippetSearch] = useState("");
  const [keyRecording, setKeyRecording] = useState(false);
  const [rightClickPaste, setRightClickPaste] = useState(false);
  const [folders, setFolders] = useState<SnippetFolder[]>(INITIAL_FOLDERS);
  const [snippets, setSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
  const [createSnippetOpen, setCreateSnippetOpen] = useState(false);
  const [createFolderOpen, setCreateFolderOpen] = useState(false);

  function handleCreateSnippet(s: Omit<Snippet, "id">) {
    const id = Math.max(0, ...snippets.map(x => x.id)) + 1;
    setSnippets(prev => [...prev, { ...s, id }]);
    toast.success("Snippet created successfully");
  }

  function handleCreateFolder(f: Omit<SnippetFolder, "id" | "open">) {
    const id = Math.max(0, ...folders.map(x => x.id)) + 1;
    setFolders(prev => [...prev, { ...f, id, open: true }]);
    toast.success("Folder created successfully");
  }

  function toggleFolder(id: number) {
    setFolders(prev => prev.map(f => f.id === id ? { ...f, open: !f.open } : f));
  }

  function deleteSnippet(id: number) {
    setSnippets(prev => prev.filter(s => s.id !== id));
  }

  const filtered = snippetSearch
    ? snippets.filter(s =>
        s.name.toLowerCase().includes(snippetSearch.toLowerCase()) ||
        s.command.toLowerCase().includes(snippetSearch.toLowerCase())
      )
    : snippets;

  const namedFolders = folders.filter(f => f.name !== "Uncategorized");
  const uncategorized = folders.find(f => f.name === "Uncategorized");
  const allFolders = [...namedFolders, ...(uncategorized ? [uncategorized] : [])];

  return (
    <>
      <div className="flex flex-col bg-sidebar border-border shrink-0 h-full relative" style={{ width }}>
        <div className="flex items-center justify-between px-4 h-12.5 border-b border-border shrink-0">
          <span className="text-base font-bold">Tools</span>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onResetWidth}>
              <RefreshCw className="size-3.5"/>
            </Button>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
              <X className="size-3.5"/>
            </Button>
          </div>
        </div>

        <div className="flex shrink-0 border-b border-border">
          {TOOLS_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors relative ${
                activeTab === tab.id
                  ? "border-b-accent-brand text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
              {tab.id === "split-screen" && splitMode !== "none" && (
                <span className="absolute top-1 right-1 size-1.5 rounded-full bg-accent-brand"/>
              )}
            </button>
          ))}
        </div>

        <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 gap-3">
          {activeTab === "ssh-tools" && (
            <>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest">Key Recording</span>
                <Button
                  variant="outline"
                  className={`w-full ${keyRecording ? "border-accent-brand/40 text-accent-brand bg-accent-brand/10 hover:bg-accent-brand/20 hover:text-accent-brand" : ""}`}
                  onClick={() => setKeyRecording(o => !o)}
                >
                  {keyRecording ? "Stop Key Recording" : "Start Key Recording"}
                </Button>
              </div>
              <Separator/>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold uppercase tracking-widest">Settings</span>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm text-muted-foreground">Enable right-click copy/paste</span>
                  <button
                    onClick={() => setRightClickPaste(o => !o)}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${rightClickPaste ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
                  >
                    <span className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${rightClickPaste ? "translate-x-4" : "translate-x-0.5"}`}/>
                  </button>
                </div>
              </div>
            </>
          )}

          {activeTab === "snippets" && (
            <>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold">Select Terminals <span className="text-muted-foreground font-normal">(optional)</span></span>
                <span className="text-xs text-muted-foreground">Execute on current terminal (click to select multiple)</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <button className="text-xs text-accent-brand hover:text-accent-brand/70">Select All</button>
                  <button className="text-xs text-accent-brand hover:text-accent-brand/70">Deselect All</button>
                </div>
              </div>
              <Separator/>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                <Input placeholder="Search snippets..." value={snippetSearch} onChange={e => setSnippetSearch(e.target.value)} className="pl-8"/>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateSnippetOpen(true)}>
                  <Plus className="size-3.5"/>New Snippet
                </Button>
                <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateFolderOpen(true)}>
                  <Folder className="size-3.5"/>New Folder
                </Button>
              </div>
              <div className="flex flex-col gap-4">
                {allFolders.map(folder => {
                  const folderSnippets = filtered.filter(s =>
                    folder.name === "Uncategorized"
                      ? s.folderId === null || s.folderId === folder.id
                      : s.folderId === folder.id
                  );
                  if (folderSnippets.length === 0 && snippetSearch) return null;
                  return (
                    <div key={folder.id} className="flex flex-col gap-2">
                      <button onClick={() => toggleFolder(folder.id)} className="flex items-center gap-1.5 w-full text-left">
                        <ChevronDown className={`size-3 text-muted-foreground shrink-0 transition-transform ${folder.open ? "" : "-rotate-90"}`}/>
                        <FolderIconEl icon={folder.icon} className="size-3.5 shrink-0" style={{ color: folder.color }}/>
                        <span className="text-xs font-semibold flex-1 truncate" style={{ color: folder.name === "Uncategorized" ? undefined : folder.color }}>
                          {folder.name}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">{folderSnippets.length}</span>
                      </button>
                      {folder.open && (
                        <div className="flex flex-col gap-2 ml-1">
                          {folderSnippets.map(snippet => (
                            <div key={snippet.id} className="border border-border bg-background p-2.5 flex flex-col gap-2">
                              <div className="flex items-start gap-2">
                                <div className="grid grid-cols-2 gap-px mt-0.5 shrink-0 opacity-30">
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                  <div className="size-1 bg-muted-foreground rounded-full"/>
                                </div>
                                <div className="flex flex-col min-w-0">
                                  <span className="text-xs font-semibold">{snippet.name}</span>
                                  {snippet.description && <span className="text-xs text-muted-foreground">{snippet.description}</span>}
                                </div>
                              </div>
                              <span className="text-xs text-muted-foreground font-mono px-1">{snippet.command}</span>
                              <div className="flex items-center gap-1">
                                <Button variant="outline" size="sm" className="flex-1 text-xs h-7 gap-1.5">
                                  <Play className="size-3"/>Run
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Copy className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Pencil className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteSnippet(snippet.id)}>
                                  <Trash2 className="size-3.5"/>
                                </Button>
                                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                  <Share2 className="size-3.5"/>
                                </Button>
                              </div>
                            </div>
                          ))}
                          {folderSnippets.length === 0 && (
                            <span className="text-xs text-muted-foreground/60 pl-1">No snippets in this folder</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "history" && <HistoryTab/>}

          {activeTab === "split-screen" && (
            <SplitScreenTab
              tabs={tabs}
              splitMode={splitMode}
              setSplitMode={setSplitMode}
              paneTabIds={paneTabIds}
              setPaneTabIds={setPaneTabIds}
            />
          )}
        </div>
      </div>

      <CreateSnippetDialog
        open={createSnippetOpen}
        onOpenChange={setCreateSnippetOpen}
        folders={folders}
        onCreate={handleCreateSnippet}
      />
      <CreateFolderDialog
        open={createFolderOpen}
        onOpenChange={setCreateFolderOpen}
        onCreate={handleCreateFolder}
      />
    </>
  );
}
