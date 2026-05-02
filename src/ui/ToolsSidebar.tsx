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
  PANE_LAYOUTS,
} from "@/ui/data";
import { FOLDER_ICONS } from "@/ui/types";
import type { Tab, ToolsTab, SplitMode, Snippet, SnippetFolder, FolderIconId } from "@/ui/types";

function tabIcon(type: Tab["type"]) {
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

function SplitScreenTab({ tabs, splitMode, setSplitMode }: {
  tabs: Tab[];
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
}) {
  const paneCount = PANE_COUNTS[splitMode];
  const [panes, setPanes] = useState<(Tab | null)[]>(() => Array(6).fill(null));
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<number | null>(null);

  function handleDrop(paneIndex: number) {
    if (draggingTabId === null) return;
    const tab = tabs.find(t => t.id === draggingTabId) ?? null;
    setPanes(prev => { const next = [...prev]; next[paneIndex] = tab; return next; });
    setDraggingTabId(null);
    setDragOverPane(null);
  }

  function clearPane(paneIndex: number) {
    setPanes(prev => { const next = [...prev]; next[paneIndex] = null; return next; });
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-2 shrink-0">
        {SPLIT_MODES.map(mode => (
          <button
            key={mode.id}
            onClick={() => setSplitMode(mode.id)}
            className={`px-2 py-2 text-xs font-semibold border transition-colors ${
              splitMode === mode.id
                ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      {splitMode === "none" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
          <div className="grid grid-cols-2 gap-1 opacity-30">
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
            <div className="size-6 border-2 border-muted-foreground"/>
          </div>
          <span className="text-sm text-muted-foreground mt-1">Select a split screen mode</span>
          <span className="text-xs text-muted-foreground/60">Choose how many tabs you want to view at once</span>
        </div>
      ) : (
        <>
          <div className={`grid gap-1.5 ${PANE_LAYOUTS[splitMode]}`} style={{ aspectRatio: paneCount <= 3 ? "16/9" : "16/10" }}>
            {Array.from({ length: paneCount }).map((_, i) => {
              const assigned = panes[i];
              const isOver = dragOverPane === i;
              return (
                <div
                  key={i}
                  onDragOver={e => { e.preventDefault(); setDragOverPane(i); }}
                  onDragLeave={() => setDragOverPane(null)}
                  onDrop={() => handleDrop(i)}
                  className={`relative flex flex-col items-center justify-center border-2 border-dashed text-center transition-colors min-h-0
                    ${isOver ? "border-accent-brand bg-accent-brand/10" : assigned ? "border-border bg-muted/30" : "border-border/50 bg-muted/10 hover:border-border hover:bg-muted/20"}
                    ${splitMode === "3-way" && i === 0 ? "row-span-2" : ""}
                    ${splitMode === "5-way" && i === 4 ? "col-span-2" : ""}
                  `}
                >
                  {assigned ? (
                    <>
                      <div className="flex items-center gap-1 px-1">
                        {tabIcon(assigned.type)}
                        <span className="text-xs font-semibold truncate max-w-[80px]">
                          {assigned.type === "dashboard" ? "Dashboard" : assigned.label}
                        </span>
                      </div>
                      <button onClick={() => clearPane(i)} className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center text-muted-foreground hover:text-foreground">
                        <X className="size-2.5"/>
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground/50">{isOver ? "Drop here" : `Pane ${i + 1}`}</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Open Tabs</span>
            <span className="text-xs text-muted-foreground/60">Drag tabs into the panes above</span>
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
                  <div className="text-muted-foreground shrink-0">{tabIcon(tab.type)}</div>
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
            className="w-full border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
            onClick={() => setPanes(Array(6).fill(null))}
          >
            Reset Layout
          </Button>
        </>
      )}
    </>
  );
}

export function ToolsSidebar({ onClose, tabs, width, onResetWidth }: {
  onClose: () => void;
  tabs: Tab[];
  width: number;
  onResetWidth: () => void;
}) {
  const [activeTab, setActiveTab] = useState<ToolsTab>("ssh-tools");
  const [splitMode, setSplitMode] = useState<SplitMode>("none");
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
              className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-b-accent-brand text-foreground"
                  : "border-b-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab.label}
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
                                  <span className="text-xs text-muted-foreground">ID: {snippet.id}</span>
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
            <SplitScreenTab tabs={tabs} splitMode={splitMode} setSplitMode={setSplitMode}/>
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
