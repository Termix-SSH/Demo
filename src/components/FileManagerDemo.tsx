import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import {
  Folder,
  File,
  FileText,
  FileImage,
  FileVideo,
  FileAudio,
  Archive,
  Code,
  Settings,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  RefreshCw,
  Search,
  Grid3X3,
  List,
  Plus,
  Copy,
  MoreHorizontal,
  Trash2,
  Edit3,
  Download,
  Info,
  Star,
  HardDrive,
  Layout,
  ExternalLink,
  X,
  ChevronDown,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// --- Types ---

export type FileType = "file" | "directory" | "link";

export interface MockFile {
  id: string;
  name: string;
  type: FileType;
  path: string;
  size?: number;
  modified: string;
  permissions: string;
  owner: string;
  group: string;
  content?: string;
  icon?: React.ReactNode;
}

// --- Mock Data ---

const INITIAL_FILES: MockFile[] = [
  { id: "1", name: "home", type: "directory", path: "/home", modified: "2026-05-01 08:30", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "2", name: "var", type: "directory", path: "/var", modified: "2026-04-28 12:15", permissions: "drwxr-xr-x", owner: "root", group: "root" },
  { id: "3", name: "etc", type: "directory", path: "/etc", modified: "2026-04-30 19:45", permissions: "drwxr-xr-x", owner: "root", group: "root" },
  { id: "4", name: "usr", type: "directory", path: "/usr", modified: "2026-04-25 10:00", permissions: "drwxr-xr-x", owner: "root", group: "root" },
  { id: "5", name: "user", type: "directory", path: "/home/user", modified: "2026-05-01 08:31", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "6", name: "Documents", type: "directory", path: "/home/user/Documents", modified: "2026-05-01 09:00", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "7", name: "Downloads", type: "directory", path: "/home/user/Downloads", modified: "2026-04-30 22:10", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "8", name: "Desktop", type: "directory", path: "/home/user/Desktop", modified: "2026-05-01 08:32", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "9", name: "Projects", type: "directory", path: "/home/user/Documents/Projects", modified: "2026-05-01 10:15", permissions: "drwxr-xr-x", owner: "user", group: "user" },
  { id: "10", name: "resume.pdf", type: "file", path: "/home/user/Documents/resume.pdf", size: 1024 * 450, modified: "2026-04-15 14:20", permissions: "-rw-r--r--", owner: "user", group: "user" },
  { id: "11", name: "budget.xlsx", type: "file", path: "/home/user/Documents/budget.xlsx", size: 1024 * 120, modified: "2026-04-20 11:05", permissions: "-rw-r--r--", owner: "user", group: "user" },
  { id: "12", name: "profile.jpg", type: "file", path: "/home/user/Downloads/profile.jpg", size: 1024 * 850, modified: "2026-04-30 22:05", permissions: "-rw-r--r--", owner: "user", group: "user" },
  { id: "13", name: "index.ts", type: "file", path: "/home/user/Documents/Projects/index.ts", size: 1024 * 5, modified: "2026-05-01 10:20", permissions: "-rw-r--r--", owner: "user", group: "user", content: "console.log('Hello World');\n\nconst main = () => {\n  console.log('Termix Demo');\n};\n\nmain();" },
  { id: "14", name: "README.md", type: "file", path: "/home/user/Documents/Projects/README.md", size: 1024 * 2, modified: "2026-05-01 10:25", permissions: "-rw-r--r--", owner: "user", group: "user", content: "# Project Title\n\nThis is a demo project for the new Termix UI.\n\n## Features\n- Professional Terminal Aesthetic\n- File Manager Demo\n- Dark Mode by Default" },
  { id: "15", name: "docker-compose.yml", type: "file", path: "/home/user/Documents/Projects/docker-compose.yml", size: 1024 * 1, modified: "2026-05-01 10:30", permissions: "-rw-r--r--", owner: "user", group: "user", content: "version: '3.8'\nservices:\n  web:\n    image: nginx\n    ports:\n      - \"80:80\"\n  db:\n    image: postgres:15" },
  { id: "16", name: "archive.zip", type: "file", path: "/home/user/Downloads/archive.zip", size: 1024 * 1024 * 15, modified: "2026-04-29 16:40", permissions: "-rw-r--r--", owner: "user", group: "user" },
  { id: "17", name: "log", type: "directory", path: "/var/log", modified: "2026-05-01 00:00", permissions: "drwxr-xr-x", owner: "root", group: "root" },
  { id: "18", name: "syslog", type: "file", path: "/var/log/syslog", size: 1024 * 1024 * 2, modified: "2026-05-01 11:00", permissions: "-rw-r-----", owner: "root", group: "adm", content: "May  1 11:00:01 termix-web-01 systemd[1]: Starting Session 123 of user root.\nMay  1 11:00:05 termix-web-01 sshd[4567]: Accepted password for deploy from 10.0.1.50 port 54322 ssh2" },
];

// --- Utilities ---

function formatSize(bytes?: number) {
  if (bytes === undefined) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function getFileIcon(file: MockFile, className?: string) {
  if (file.type === "directory") return <Folder className={cn("text-accent-brand", className)} />;
  if (file.type === "link") return <ExternalLink className={cn("text-blue-400", className)} />;

  const ext = file.name.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "txt":
    case "md":
    case "readme":
      return <FileText className={cn("text-muted-foreground", className)} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "webp":
      return <FileImage className={cn("text-green-400", className)} />;
    case "mp4":
    case "mkv":
    case "mov":
      return <FileVideo className={cn("text-purple-400", className)} />;
    case "mp3":
    case "wav":
    case "flac":
      return <FileAudio className={cn("text-pink-400", className)} />;
    case "zip":
    case "tar":
    case "gz":
    case "7z":
      return <Archive className={cn("text-yellow-500", className)} />;
    case "ts":
    case "js":
    case "tsx":
    case "jsx":
    case "py":
    case "yml":
    case "yaml":
    case "json":
      return <Code className={cn("text-accent-brand", className)} />;
    case "conf":
    case "ini":
    case "config":
      return <Settings className={cn("text-muted-foreground", className)} />;
    default:
      return <File className={cn("text-muted-foreground", className)} />;
  }
}

// --- Hooks ---

function useMockFileSystem() {
  const [files, setFiles] = useState<MockFile[]>(INITIAL_FILES);
  const [pinnedIds, setPinnedIds] = useState<string[]>(["6", "7", "8"]);
  const [currentPath, setCurrentPath] = useState("/home/user/Documents");
  const [history, setHistory] = useState<string[]>(["/home/user/Documents"]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const currentFiles = useMemo(() => {
    return files.filter((f) => {
      const parentPath = f.path.substring(0, f.path.lastIndexOf("/"));
      const normalizedParent = parentPath === "" ? "/" : parentPath;
      return normalizedParent === currentPath;
    });
  }, [files, currentPath]);

  const pinnedFiles = useMemo(() => {
    return files.filter((f) => pinnedIds.includes(f.id));
  }, [files, pinnedIds]);

  const navigateTo = useCallback((path: string) => {
    setCurrentPath(path);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(path);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  }, [history, historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setCurrentPath(history[historyIndex - 1]);
    }
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setCurrentPath(history[historyIndex + 1]);
    }
  }, [history, historyIndex]);

  const goUp = useCallback(() => {
    if (currentPath === "/") return;
    const parentPath = currentPath.substring(0, currentPath.lastIndexOf("/"));
    navigateTo(parentPath === "" ? "/" : parentPath);
  }, [currentPath, navigateTo]);

  const createFile = useCallback((name: string, type: FileType) => {
    const newFile: MockFile = {
      id: Math.random().toString(36).substring(7),
      name,
      type,
      path: currentPath === "/" ? `/${name}` : `${currentPath}/${name}`,
      modified: new Date().toISOString().replace("T", " ").substring(0, 16),
      permissions: type === "directory" ? "drwxr-xr-x" : "-rw-r--r--",
      owner: "user",
      group: "user",
      size: type === "file" ? 0 : undefined,
    };
    setFiles((prev) => [...prev, newFile]);
    toast.success(`${type === "directory" ? "Folder" : "File"} created: ${name}`);
  }, [currentPath]);

  const deleteFiles = useCallback((ids: string[]) => {
    setFiles((prev) => prev.filter((f) => !ids.includes(f.id)));
    setPinnedIds((prev) => prev.filter((id) => !ids.includes(id)));
    toast.success(`Deleted ${ids.length} item(s)`);
  }, []);

  const renameFile = useCallback((id: string, newName: string) => {
    setFiles((prev) => prev.map((f) => {
      if (f.id === id) {
        const parentPath = f.path.substring(0, f.path.lastIndexOf("/"));
        const newPath = parentPath === "" ? `/${newName}` : `${parentPath}/${newName}`;
        return { ...f, name: newName, path: newPath };
      }
      return f;
    }));
    toast.success(`Renamed to ${newName}`);
  }, []);

  const moveFiles = useCallback((ids: string[], targetPath: string) => {
    setFiles((prev) => prev.map((f) => {
      if (ids.includes(f.id)) {
        const newPath = targetPath === "/" ? `/${f.name}` : `${targetPath}/${f.name}`;
        if (newPath === f.path) return f;
        return { ...f, path: newPath };
      }
      return f;
    }));
    toast.success(`Moved ${ids.length} item(s) to ${targetPath}`);
  }, []);

  const togglePin = useCallback((id: string) => {
    setPinnedIds((prev) => {
      const isPinned = prev.includes(id);
      if (isPinned) {
        toast.info("Removed from Quick Access");
        return prev.filter((pid) => pid !== id);
      } else {
        toast.success("Pinned to Quick Access");
        return [...prev, id];
      }
    });
  }, []);

  return {
    files,
    currentPath,
    currentFiles,
    pinnedFiles,
    pinnedIds,
    navigateTo,
    goBack,
    goForward,
    goUp,
    canGoBack: historyIndex > 0,
    canGoForward: historyIndex < history.length - 1,
    canGoUp: currentPath !== "/",
    createFile,
    deleteFiles,
    renameFile,
    moveFiles,
    togglePin,
  };
}

// --- Components ---

function FolderTreeItem({
  item,
  currentPath,
  onNavigate,
  depth = 0
}: {
  item: any;
  currentPath: string;
  onNavigate: (path: string) => void;
  depth?: number;
}) {
  const [isOpen, setIsOpen] = useState(currentPath.startsWith(item.path));
  const isActive = currentPath === item.path;
  const hasChildren = item.children && item.children.length > 0;

  return (
    <div className="flex flex-col">
      <button
        onClick={() => {
          onNavigate(item.path);
          if (hasChildren) setIsOpen(!isOpen);
        }}
        className={cn(
          "w-full flex items-center gap-1.5 py-1 px-2 text-[10px] font-bold uppercase tracking-wider transition-colors text-left border-l-2",
          isActive
            ? "bg-accent-brand/10 text-accent-brand border-accent-brand"
            : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
        )}
        style={{ paddingLeft: `${(depth * 12) + 8}px` }}
      >
        <div className="size-4 flex items-center justify-center shrink-0">
          {hasChildren ? (
            isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />
          ) : (
            <div className="size-3" />
          )}
        </div>
        <Folder className={cn("size-3.5 shrink-0", isActive ? "text-accent-brand" : "text-muted-foreground/60")} />
        <span className="truncate">{item.name}</span>
      </button>
      {hasChildren && isOpen && (
        <div className="flex flex-col">
          {item.children.map((child: any) => (
            <FolderTreeItem
              key={child.id}
              item={child}
              currentPath={currentPath}
              onNavigate={onNavigate}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileManagerDemoProps {
  label: string;
}

export function FileManagerDemo({ label }: FileManagerDemoProps) {
  const {
    files,
    currentPath,
    currentFiles,
    pinnedFiles,
    pinnedIds,
    navigateTo,
    goBack,
    goForward,
    goUp,
    canGoBack,
    canGoForward,
    canGoUp,
    createFile,
    deleteFiles,
    renameFile,
    moveFiles,
    togglePin,
  } = useMockFileSystem();

  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredFiles = useMemo(() => {
    return currentFiles.filter((f) =>
      f.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [currentFiles, searchQuery]);

  const [isNewFolderDialogOpen, setIsNewFolderDialogOpen] = useState(false);
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [isPropertiesDialogOpen, setIsPropertiesDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [renameTargetId, setRenameTargetId] = useState<string | null>(null);
  const [propertiesFile, setPropertiesFile] = useState<MockFile | null>(null);

  const [isPreviewDialogOpen, setIsPreviewDialogOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<MockFile | null>(null);

  // Selection Box State
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<{ x: number; y: number } | null>(null);
  const [selectionRect, setSelectionRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Drag State
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    draggedIds: string[];
    targetId: string | null;
  }>({
    isDragging: false,
    draggedIds: [],
    targetId: null,
  });

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if ((e.ctrlKey || e.metaKey) && e.key === "a") {
        e.preventDefault();
        setSelectedIds(filteredFiles.map(f => f.id));
      }

      if (e.key === "Delete" && selectedIds.length > 0) {
        deleteFiles(selectedIds);
        setSelectedIds([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredFiles, selectedIds, deleteFiles]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    if (e.target !== e.currentTarget) return; // Only if clicking background

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setIsSelecting(true);
    setSelectionStart({ x, y });
    setSelectionRect({ x, y, width: 0, height: 0 });

    if (!e.ctrlKey && !e.metaKey) {
      setSelectedIds([]);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !selectionStart || !containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const x = Math.min(selectionStart.x, currentX);
    const y = Math.min(selectionStart.y, currentY);
    const width = Math.abs(currentX - selectionStart.x);
    const height = Math.abs(currentY - selectionStart.y);

    setSelectionRect({ x, y, width, height });

    // Find intersecting files
    const fileElements = containerRef.current.querySelectorAll("[data-file-id]");
    const newSelectedIds: string[] = e.ctrlKey || e.metaKey ? [...selectedIds] : [];

    fileElements.forEach((el) => {
      const elRect = el.getBoundingClientRect();
      const relativeElRect = {
        left: elRect.left - rect.left,
        top: elRect.top - rect.top,
        right: elRect.right - rect.left,
        bottom: elRect.bottom - rect.top,
      };

      const intersects = !(
        relativeElRect.right < x ||
        relativeElRect.left > x + width ||
        relativeElRect.bottom < y ||
        relativeElRect.top > y + height
      );

      const fileId = el.getAttribute("data-file-id");
      if (intersects && fileId) {
        if (!newSelectedIds.includes(fileId)) {
          newSelectedIds.push(fileId);
        }
      }
    });

    setSelectedIds(newSelectedIds);
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionRect(null);
  };

  const handleDragStart = (e: React.DragEvent, file: MockFile) => {
    const ids = selectedIds.includes(file.id) ? selectedIds : [file.id];
    setDragState((prev) => ({ ...prev, isDragging: true, draggedIds: ids }));
    setSelectedIds(ids);

    e.dataTransfer.setData("text/plain", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, file?: MockFile) => {
    e.preventDefault();
    if (file && file.type === "directory" && !dragState.draggedIds.includes(file.id)) {
      setDragState((prev) => ({ ...prev, targetId: file.id }));
      e.dataTransfer.dropEffect = "move";
    } else {
      setDragState((prev) => ({ ...prev, targetId: null }));
      e.dataTransfer.dropEffect = "none";
    }
  };

  const handleDrop = (e: React.DragEvent, targetFile?: MockFile) => {
    e.preventDefault();
    const ids = dragState.draggedIds;

    if (targetFile && targetFile.type === "directory" && !ids.includes(targetFile.id)) {
      moveFiles(ids, targetFile.path);
      setSelectedIds([]);
    }

    setDragState({ isDragging: false, draggedIds: [], targetId: null });
  };

  const handleFileClick = (file: MockFile, e: React.MouseEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey) {
      setSelectedIds((prev) =>
        prev.includes(file.id) ? prev.filter((id) => id !== file.id) : [...prev, file.id]
      );
    } else if (e.shiftKey && selectedIds.length > 0) {
      const lastId = selectedIds[selectedIds.length - 1];
      const lastIndex = filteredFiles.findIndex(f => f.id === lastId);
      const currentIndex = filteredFiles.findIndex(f => f.id === file.id);

      if (lastIndex !== -1 && currentIndex !== -1) {
        const start = Math.min(lastIndex, currentIndex);
        const end = Math.max(lastIndex, currentIndex);
        const rangeIds = filteredFiles.slice(start, end + 1).map(f => f.id);
        setSelectedIds(Array.from(new Set([...selectedIds, ...rangeIds])));
      }
    } else {
      setSelectedIds([file.id]);
    }
  };

  const handleFileDoubleClick = (file: MockFile) => {
    if (file.type === "directory") {
      navigateTo(file.path);
      setSelectedIds([]);
    } else {
      setPreviewFile(file);
      setIsPreviewDialogOpen(true);
    }
  };

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFile(newFolderName.trim(), "directory");
      setNewFolderName("");
      setIsNewFolderDialogOpen(false);
    }
  };

  const handleRename = () => {
    if (renameValue.trim() && renameTargetId) {
      renameFile(renameTargetId, renameValue.trim());
      setRenameValue("");
      setRenameTargetId(null);
      setIsRenameDialogOpen(false);
    }
  };

  const openRenameDialog = (file: MockFile) => {
    setRenameTargetId(file.id);
    setRenameValue(file.name);
    setIsRenameDialogOpen(true);
  };

  const openPropertiesDialog = (file: MockFile) => {
    setPropertiesFile(file);
    setIsPropertiesDialogOpen(true);
  };

  const drives = [
    { name: "Root", path: "/", icon: <HardDrive className="size-4" /> },
    { name: "System", path: "/usr", icon: <Settings className="size-4" /> },
  ];

  // Build Folder Tree
  const folderTree = useMemo(() => {
    const folders = files.filter(f => f.type === "directory");
    const buildTree = (parentPath: string): any[] => {
      return folders
        .filter(f => {
          const pPath = f.path.substring(0, f.path.lastIndexOf("/"));
          const normParent = pPath === "" ? "/" : pPath;
          return normParent === parentPath && f.path !== parentPath;
        })
        .map(f => ({
          ...f,
          children: buildTree(f.path)
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    };
    return buildTree("/");
  }, [files]);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {/* Header / Toolbar */}
      <Card className="flex flex-row items-center justify-between px-3 py-2 shrink-0 mx-3 mt-3 gap-2 border-border bg-card rounded-none shadow-none">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            disabled={!canGoBack}
            className="size-8 rounded-none"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goForward}
            disabled={!canGoForward}
            className="size-8 rounded-none"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goUp}
            disabled={!canGoUp}
            className="size-8 rounded-none"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => toast.success("Refreshed")}
            className="size-8 rounded-none"
          >
            <RefreshCw className="size-4" />
          </Button>
        </div>

        <div className="flex-1 flex items-center px-3 h-8 bg-muted/50 border border-border rounded-none gap-2 overflow-hidden">
           <Folder className="size-3.5 text-accent-brand shrink-0" />
           <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
              {currentPath.split("/").map((part, i, arr) => (
                <React.Fragment key={i}>
                  {part === "" && i === 0 ? (
                    <button onClick={() => navigateTo("/")} className="hover:text-accent-brand transition-colors">root</button>
                  ) : part !== "" ? (
                    <button
                      onClick={() => navigateTo(arr.slice(0, i + 1).join("/"))}
                      className="hover:text-accent-brand transition-colors"
                    >
                      {part}
                    </button>
                  ) : null}
                  {i < arr.length - 1 && part !== "" && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                  {i === 0 && arr.length > 1 && part === "" && <ChevronRight className="size-3 text-muted-foreground shrink-0" />}
                </React.Fragment>
              ))}
           </div>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1 mr-2 px-2 py-1 bg-accent-brand/10 border border-accent-brand/20 text-accent-brand text-[10px] font-black uppercase tracking-tighter">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-accent-brand hover:bg-accent-brand/20 rounded-none"
                onClick={() => deleteFiles(selectedIds)}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-accent-brand hover:bg-accent-brand/20 rounded-none"
                onClick={() => {
                  const items = currentFiles.filter(f => selectedIds.includes(f.id));
                  const paths = items.map(f => f.path).join("\n");
                  navigator.clipboard.writeText(paths);
                  toast.info(`Copied ${items.length} path(s)`);
                }}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}

          <div className="relative w-48 hidden md:block">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder="Search..."
              className="h-8 pl-8 text-xs bg-muted/50 border-border rounded-none focus:ring-1 focus:ring-accent-brand/50"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="flex items-center border border-border rounded-none overflow-hidden">
             <Button
               variant={viewMode === "grid" ? "secondary" : "ghost"}
               size="icon"
               onClick={() => setViewMode("grid")}
               className={cn("size-8 rounded-none border-y-0 border-l-0 border-r border-border", viewMode === "grid" && "bg-accent-brand/10 text-accent-brand")}
             >
               <Grid3X3 className="size-4" />
             </Button>
             <Button
               variant={viewMode === "list" ? "secondary" : "ghost"}
               size="icon"
               onClick={() => setViewMode("list")}
               className={cn("size-8 rounded-none border-y-0 border-r-0 border-border", viewMode === "list" && "bg-accent-brand/10 text-accent-brand")}
             >
               <List className="size-4" />
             </Button>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1.5 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none font-bold uppercase tracking-widest text-[10px]">
                <Plus className="size-3.5" /> New
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40 rounded-none border-border bg-card">
              <DropdownMenuItem onClick={() => setIsNewFolderDialogOpen(true)} className="rounded-none text-xs font-semibold hover:bg-accent-brand/10 hover:text-accent-brand">
                <Folder className="size-4 mr-2 text-accent-brand" /> Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => createFile("untitled.txt", "file")} className="rounded-none text-xs font-semibold hover:bg-accent-brand/10 hover:text-accent-brand">
                <FileText className="size-4 mr-2 text-muted-foreground" /> Text File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => createFile("script.sh", "file")} className="rounded-none text-xs font-semibold hover:bg-accent-brand/10 hover:text-accent-brand">
                <Code className="size-4 mr-2 text-accent-brand" /> Shell Script
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>

      <div className="flex flex-row flex-1 min-h-0 px-3 pt-3 pb-[10px] gap-3 relative">
        {/* Sidebar */}
        <div className="w-64 flex flex-col gap-3 shrink-0">
          <Card className="flex flex-col py-2 gap-1 bg-card border-border rounded-none shadow-none flex-1 overflow-hidden p-0">
            <div className="flex-1 overflow-y-auto thin-scrollbar">
              <div className="px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Quick Access</span>
              </div>
              {pinnedFiles.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleFileDoubleClick(item)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors text-left border-l-2",
                    currentPath === item.path
                      ? "bg-accent-brand/10 text-accent-brand border-accent-brand"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent"
                  )}
                >
                  <div className="shrink-0">{getFileIcon(item, "size-4")}</div>
                  <span className="truncate">{item.name}</span>
                </button>
              ))}

              <Separator className="my-2 bg-border/50" />

              <div className="px-3 py-1.5">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Directories</span>
              </div>
              <div className="px-1">
                {folderTree.map((item: any) => (
                  <FolderTreeItem
                    key={item.id}
                    item={item}
                    currentPath={currentPath}
                    onNavigate={navigateTo}
                  />
                ))}
              </div>

            </div>
          </Card>

          <Card className="flex flex-col p-3 gap-2 bg-card border-border rounded-none shadow-none mt-auto">
             <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                <span>Storage</span>
                <span className="text-accent-brand">45% Used</span>
             </div>
             <div className="h-1.5 bg-muted rounded-none overflow-hidden border border-border/50">
                <div className="h-full bg-accent-brand" style={{ width: "45%" }} />
             </div>
             <span className="text-[10px] font-bold text-muted-foreground/60 tracking-tight">23.4 GB of 50.0 GB used</span>
          </Card>
        </div>

        {/* Main Content Area */}
        <Card
          ref={containerRef}
          className="flex-1 min-w-0 min-h-0 flex flex-col bg-card border-border relative overflow-hidden rounded-none shadow-none p-0 gap-0"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <div
            className="flex-1 min-h-0 overflow-y-auto p-4 pb-20"
          >
            {filteredFiles.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-10 gap-4 select-none pointer-events-none">
                 <Folder className="size-32" strokeWidth={1} />
                 <span className="text-2xl font-black uppercase tracking-[0.2em]">Empty</span>
              </div>
            ) : viewMode === "grid" ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {filteredFiles.map((file) => (
                  <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                      <div
                        data-file-id={file.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file)}
                        onDragOver={(e) => handleDragOver(e, file)}
                        onDrop={(e) => handleDrop(e, file)}
                        onClick={(e) => handleFileClick(file, e)}
                        onDoubleClick={() => handleFileDoubleClick(file)}
                        className={cn(
                          "group flex flex-col items-center p-3 rounded-none border-2 border-transparent transition-all cursor-pointer hover:bg-muted/50 select-none",
                          selectedIds.includes(file.id) && "bg-accent-brand/10 border-accent-brand/40 shadow-[0_0_15px_rgba(251,146,60,0.05)]",
                          dragState.targetId === file.id && "bg-accent-brand/20 border-accent-brand border-dashed"
                        )}
                      >
                        <div className="relative mb-2 pointer-events-none">
                           {getFileIcon(file, "size-12")}
                           {file.type === "link" && <ExternalLink className="size-3.5 absolute -bottom-1 -right-1 text-blue-400 bg-card border border-border p-0.5" />}
                           {pinnedIds.includes(file.id) && <Star className="size-3 absolute -top-1 -right-1 text-accent-brand fill-accent-brand" />}
                        </div>
                        <span className="text-[11px] font-bold uppercase tracking-tight text-center truncate w-full px-1 pointer-events-none" title={file.name}>
                          {file.name}
                        </span>
                        <span className="text-[10px] font-medium text-muted-foreground/60 mt-0.5 pointer-events-none">
                          {file.type === "directory" ? "Folder" : formatSize(file.size)}
                        </span>
                      </div>
                    </ContextMenuTrigger>
                    <FileContextMenuContent
                      file={file}
                      isPinned={pinnedIds.includes(file.id)}
                      onOpen={() => handleFileDoubleClick(file)}
                      onRename={() => openRenameDialog(file)}
                      onDelete={() => deleteFiles([file.id])}
                      onTogglePin={() => togglePin(file.id)}
                      onProperties={() => openPropertiesDialog(file)}
                    />
                  </ContextMenu>
                ))}
              </div>
            ) : (
              <div className="flex flex-col">
                <div className="grid grid-cols-[1fr_100px_150px_100px] gap-4 px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border sticky top-0 bg-card z-10">
                  <span>Name</span>
                  <span className="text-right">Size</span>
                  <span>Modified</span>
                  <span className="text-right">Perms</span>
                </div>
                {filteredFiles.map((file) => (
                  <ContextMenu key={file.id}>
                    <ContextMenuTrigger>
                      <div
                        data-file-id={file.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, file)}
                        onDragOver={(e) => handleDragOver(e, file)}
                        onDrop={(e) => handleDrop(e, file)}
                        onClick={(e) => handleFileClick(file, e)}
                        onDoubleClick={() => handleFileDoubleClick(file)}
                        className={cn(
                          "grid grid-cols-[1fr_100px_150px_100px] gap-4 px-4 py-2 items-center text-xs transition-colors cursor-pointer border-b border-border/50 hover:bg-muted/50 last:border-0 rounded-none select-none",
                          selectedIds.includes(file.id) && "bg-accent-brand/10",
                          dragState.targetId === file.id && "bg-accent-brand/20 border-accent-brand border-dashed"
                        )}
                      >
                        <div className="flex items-center gap-3 overflow-hidden pointer-events-none">
                          <div className="relative shrink-0">
                            {getFileIcon(file, "size-4")}
                            {pinnedIds.includes(file.id) && <Star className="size-2 absolute -top-0.5 -right-0.5 text-accent-brand fill-accent-brand" />}
                          </div>
                          <span className="font-bold truncate uppercase tracking-tight" title={file.name}>{file.name}</span>
                        </div>
                        <span className="text-[10px] text-right text-muted-foreground tabular-nums pointer-events-none">
                          {file.type === "directory" ? "—" : formatSize(file.size)}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-medium pointer-events-none">{file.modified}</span>
                        <span className="text-[10px] text-right font-mono text-muted-foreground/60 pointer-events-none">{file.permissions}</span>
                      </div>
                    </ContextMenuTrigger>
                    <FileContextMenuContent
                      file={file}
                      isPinned={pinnedIds.includes(file.id)}
                      onOpen={() => handleFileDoubleClick(file)}
                      onRename={() => openRenameDialog(file)}
                      onDelete={() => deleteFiles([file.id])}
                      onTogglePin={() => togglePin(file.id)}
                      onProperties={() => openPropertiesDialog(file)}
                    />
                  </ContextMenu>
                ))}
              </div>
            )}
          </div>

          {/* Selection Rect */}
          {isSelecting && selectionRect && (
            <div
              className="absolute border border-accent-brand bg-accent-brand/10 pointer-events-none z-50"
              style={{
                left: selectionRect.x,
                top: selectionRect.y,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            />
          )}

          {/* Status Bar */}
          <div className="px-4 py-1.5 bg-muted/30 border-t border-border flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0 rounded-none mt-auto">
             <div className="flex gap-4">
                <span>{filteredFiles.length} Items</span>
                {selectedIds.length > 0 && <span className="text-accent-brand">{selectedIds.length} Selected</span>}
             </div>
             <div className="flex gap-4">
                <span>user@termix</span>
                <span>utf-8</span>
             </div>
          </div>
        </Card>

        {/* Floating Editor Window */}
        {isPreviewDialogOpen && previewFile && (
          <div className="absolute inset-x-20 top-10 bottom-10 z-[100] flex flex-col border border-border bg-[#0d0e0c] shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between px-4 py-2 bg-muted/30 border-b border-border shrink-0 cursor-default">
               <div className="flex items-center gap-3">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent-brand">Editor</span>
                  <Separator orientation="vertical" className="h-4 bg-border/50" />
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground truncate max-w-[400px]">{previewFile.name}</span>
               </div>
               <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  <span className="hidden md:inline">UTF-8</span>
                  <span className="hidden md:inline">{previewFile.permissions}</span>
                  <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-accent-brand hover:bg-accent-brand/10" onClick={() => setIsPreviewDialogOpen(false)}>
                     <X className="size-3.5" />
                  </Button>
               </div>
            </div>

            <div className="flex-1 flex min-h-0">
               {/* Line numbers mock */}
               <div className="w-10 bg-[#151613] border-r border-border/30 flex flex-col items-center py-4 gap-1 select-none">
                  {Array.from({ length: 25 }).map((_, i) => (
                     <span key={i} className="text-[10px] font-mono text-muted-foreground/20">{i + 1}</span>
                  ))}
               </div>
               <div className="flex-1 overflow-auto p-4 bg-transparent custom-scrollbar">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all text-foreground/90 leading-relaxed">
                     <span className="text-accent-brand/80"># File: {previewFile.path}</span>{"\n"}
                     <span className="text-muted-foreground/50"># --- Start Content ---</span>{"\n\n"}
                     {previewFile.content || "/* No content available for this preview. */"}
                  </pre>
               </div>
            </div>

            <div className="px-4 py-1.5 bg-muted/20 border-t border-border flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground shrink-0">
               <div className="flex gap-6">
                  <div className="flex items-center gap-1.5">
                     <div className="size-1.5 rounded-full bg-accent-brand animate-pulse" />
                     <span>Ln 1, Col 1</span>
                  </div>
                  <span>Spaces: 2</span>
               </div>
               <div className="flex gap-4">
                  <button onClick={() => toast.info("Download started...")} className="hover:text-accent-brand transition-colors flex items-center gap-1.5 uppercase font-black text-[10px]">
                     <Download className="size-3" /> Save
                  </button>
               </div>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <Dialog open={isNewFolderDialogOpen} onOpenChange={setIsNewFolderDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-none border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xs font-bold uppercase tracking-widest">New Folder</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
              Create a new directory in <span className="text-accent-brand font-mono">{currentPath}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
              className="rounded-none bg-muted/50 border-border text-xs focus:ring-1 focus:ring-accent-brand/50"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsNewFolderDialogOpen(false)} className="rounded-none text-[10px] font-bold uppercase tracking-widest">Cancel</Button>
            <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none text-[10px] font-bold uppercase tracking-widest" onClick={handleCreateFolder}>
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-none border-border bg-card">
          <DialogHeader>
            <DialogTitle className="text-xs font-bold uppercase tracking-widest">Rename Item</DialogTitle>
            <DialogDescription className="text-[10px] font-bold uppercase tracking-tight text-muted-foreground">
              Enter a new name for the item
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              autoFocus
              placeholder="New name"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRename()}
              className="rounded-none bg-muted/50 border-border text-xs focus:ring-1 focus:ring-accent-brand/50"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsRenameDialogOpen(false)} className="rounded-none text-[10px] font-bold uppercase tracking-widest">Cancel</Button>
            <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none text-[10px] font-bold uppercase tracking-widest" onClick={handleRename}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isPropertiesDialogOpen} onOpenChange={setIsPropertiesDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-none border-border bg-card shadow-2xl">
          <DialogHeader className="border-b border-border pb-4">
            <DialogTitle className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
              <Info className="size-4 text-accent-brand" /> Item Properties
            </DialogTitle>
          </DialogHeader>
          {propertiesFile && (
            <div className="py-4 space-y-4">
              <div className="flex items-center gap-4">
                <div className="size-16 border border-border bg-muted/30 flex items-center justify-center">
                  {getFileIcon(propertiesFile, "size-10")}
                </div>
                <div className="flex flex-col gap-1 overflow-hidden">
                  <span className="text-sm font-black uppercase tracking-tight truncate">{propertiesFile.name}</span>
                  <span className="text-[10px] font-bold uppercase text-muted-foreground tracking-widest">
                    {propertiesFile.type === "directory" ? "Directory" : "File"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 border border-border bg-muted/10 p-3">
                 <PropertyRow label="Location" value={propertiesFile.path} mono />
                 <PropertyRow label="Size" value={propertiesFile.type === "directory" ? "—" : formatSize(propertiesFile.size)} />
                 <PropertyRow label="Modified" value={propertiesFile.modified} />
                 <Separator className="my-1 bg-border/50" />
                 <PropertyRow label="Owner" value={`${propertiesFile.owner}:${propertiesFile.group}`} />
                 <PropertyRow label="Permissions" value={propertiesFile.permissions} mono />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPropertiesDialogOpen(false)} className="w-full border-border hover:bg-muted rounded-none text-[10px] font-bold uppercase tracking-widest h-9">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PropertyRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
       <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/70">{label}</span>
       <span className={cn("text-[11px] font-bold uppercase tracking-tight truncate", mono && "font-mono normal-case tracking-normal")}>{value}</span>
    </div>
  );
}

function FileContextMenuContent({
  file,
  isPinned,
  onOpen,
  onRename,
  onDelete,
  onTogglePin,
  onProperties,
}: {
  file: MockFile;
  isPinned: boolean;
  onOpen: () => void;
  onRename: () => void;
  onDelete: () => void;
  onTogglePin: () => void;
  onProperties: () => void;
}) {
  return (
    <ContextMenuContent className="w-48 rounded-none border-border bg-card shadow-xl p-0 overflow-hidden">
      <ContextMenuItem onClick={onOpen} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <Layout className="size-3.5 mr-2.5" /> Open
      </ContextMenuItem>
      <ContextMenuItem onClick={() => {
        navigator.clipboard.writeText(file.path);
        toast.info(`Copied path: ${file.path}`);
      }} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <MoreHorizontal className="size-3.5 mr-2.5" /> Copy Path
      </ContextMenuItem>
      <ContextMenuItem onClick={onTogglePin} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <Star className={cn("size-3.5 mr-2.5", isPinned && "fill-accent-brand text-accent-brand")} />
        {isPinned ? "Unpin Quick Access" : "Pin Quick Access"}
      </ContextMenuItem>

      <Separator className="bg-border/50" />

      <ContextMenuItem onClick={onRename} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <Edit3 className="size-3.5 mr-2.5" /> Rename
      </ContextMenuItem>
      <ContextMenuItem onClick={() => toast.info(`Downloading ${file.name}`)} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <Download className="size-3.5 mr-2.5" /> Download
      </ContextMenuItem>
      <ContextMenuItem onClick={onProperties} className="rounded-none text-[10px] font-bold uppercase tracking-widest h-9 focus:bg-accent-brand/10 focus:text-accent-brand transition-colors cursor-pointer px-3">
        <Info className="size-3.5 mr-2.5" /> Properties
      </ContextMenuItem>

      <Separator className="bg-border/50" />

      <ContextMenuItem onClick={onDelete} className="text-destructive focus:text-destructive focus:bg-destructive/10 rounded-none text-[10px] font-bold uppercase tracking-widest h-9 cursor-pointer px-3">
        <Trash2 className="size-3.5 mr-2.5" /> Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
