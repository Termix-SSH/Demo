import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { Host } from "@/types/ui-types";
import type { FileItem } from "@/types";
import { listFiles, readFile } from "@/demo/demo-api";
import { copyToClipboard } from "@/lib/clipboard";
import { FileManagerToolbar } from "./FileManagerToolbar";
import { usePanelView } from "@/hooks/use-panel-view";
import { PanelShell } from "@/components/panel-layout";
import { Folder as FolderIcon } from "lucide-react";
import { FileManagerGrid } from "./FileManagerGrid";
import { FileManagerSidebar } from "./FileManagerSidebar";
import { FileManagerContextMenu } from "./FileManagerContextMenu";
import type {
  CreateIntent,
  SortBy,
  SortOrder,
} from "./types";

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  files: FileItem[];
}

const CLOSED_MENU: ContextMenuState = { visible: false, x: 0, y: 0, files: [] };

export function DemoFileManager({
  host,
  initialPath,
}: {
  host: Host;
  initialPath?: string;
}) {
  const { t } = useTranslation();
  const startPath = initialPath || host.defaultPath || "/home/deploy";

  const [currentPath, setCurrentPath] = useState(startPath);
  const [navHistory, setNavHistory] = useState<string[]>([startPath]);
  const [navIndex, setNavIndex] = useState(0);

  const [entries, setEntries] = useState<FileItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);

  const [selectedFiles, setSelectedFiles] = useState<FileItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  // Grid/list and row height are a saved preference, not tab state, so they
  // survive closing the tab and follow the Simple/Advanced presets.
  const {
    view: viewMode,
    density,
    setView: setViewMode,
    setDensity,
  } = usePanelView("fileManager");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  const [editingFile, setEditingFile] = useState<FileItem | null>(null);
  const [createIntent, setCreateIntent] = useState<CreateIntent | null>(null);
  const [clipboard, setClipboard] = useState<FileItem[] | null>(null);
  const [pinnedPaths, setPinnedPaths] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState>(CLOSED_MENU);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Local edits layer over the fixtures, so renames and deletes stick while the
  // tab is open without writing back to demo-data.
  const overrides = useRef<Map<string, FileItem[]>>(new Map());

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setSelectedFiles([]);
    const local = overrides.current.get(currentPath);
    if (local) {
      setEntries(local);
      setIsLoading(false);
      return;
    }
    void listFiles(currentPath).then((rows) => {
      if (cancelled) return;
      setEntries(rows);
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [currentPath, refreshToken]);

  const navigateTo = useCallback(
    (path: string) => {
      const normalized = path === "" ? "/" : path.replace(/\/+$/, "") || "/";
      if (normalized === currentPath) return;
      setNavHistory((prev) => [...prev.slice(0, navIndex + 1), normalized]);
      setNavIndex((prev) => prev + 1);
      setCurrentPath(normalized);
    },
    [currentPath, navIndex],
  );

  const goBack = useCallback(() => {
    if (navIndex <= 0) return;
    const next = navIndex - 1;
    setNavIndex(next);
    setCurrentPath(navHistory[next]);
  }, [navIndex, navHistory]);

  const goForward = useCallback(() => {
    if (navIndex >= navHistory.length - 1) return;
    const next = navIndex + 1;
    setNavIndex(next);
    setCurrentPath(navHistory[next]);
  }, [navIndex, navHistory]);

  const goUp = useCallback(() => {
    if (currentPath === "/") return;
    navigateTo(currentPath.substring(0, currentPath.lastIndexOf("/")) || "/");
  }, [currentPath, navigateTo]);

  useEffect(() => {
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, [goBack, goForward]);

  const visibleFiles = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const rows = query
      ? entries.filter((e) => e.name.toLowerCase().includes(query))
      : entries;
    const direction = sortOrder === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const aDir = a.type === "directory";
      const bDir = b.type === "directory";
      if (aDir !== bDir) return aDir ? -1 : 1;
      if (sortBy === "size") return ((a.size ?? 0) - (b.size ?? 0)) * direction;
      if (sortBy === "modified") {
        return (
          ((a.modifiedTimestamp ?? 0) - (b.modifiedTimestamp ?? 0)) * direction
        );
      }
      return a.name.localeCompare(b.name) * direction;
    });
  }, [entries, searchQuery, sortBy, sortOrder]);

  function applyToCurrent(next: FileItem[]) {
    overrides.current.set(currentPath, next);
    setEntries(next);
  }

  function handleSortChange(field: SortBy) {
    if (field === sortBy) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortBy(field);
    setSortOrder("asc");
  }

  function openFile(file: FileItem) {
    if (file.type === "directory") {
      navigateTo(file.path);
      return;
    }
    if (file.type === "link" && file.linkTarget) {
      navigateTo(file.linkTarget);
      return;
    }
    void previewFile(file);
  }

  async function previewFile(file: FileItem) {
    const body = await readFile(file.path);
    const firstLine = body.split("\n").find((line) => line.trim()) ?? "";
    toast.message(file.name, { description: firstLine.slice(0, 120) });
  }

  function handleRename(file: FileItem, newName: string) {
    const parent = file.path.substring(0, file.path.lastIndexOf("/")) || "";
    applyToCurrent(
      entries.map((e) =>
        e.path === file.path
          ? { ...e, name: newName, path: `${parent}/${newName}` }
          : e,
      ),
    );
    setEditingFile(null);
  }

  function handleDelete(files: FileItem[]) {
    const paths = new Set(files.map((f) => f.path));
    applyToCurrent(entries.filter((e) => !paths.has(e.path)));
    setSelectedFiles([]);
  }

  function handleConfirmCreate(name: string) {
    if (!createIntent) return;
    const path = currentPath === "/" ? `/${name}` : `${currentPath}/${name}`;
    const now = Date.now();
    applyToCurrent([
      ...entries,
      {
        name,
        path,
        type: createIntent.type,
        size: createIntent.type === "file" ? 0 : 4096,
        modified: new Date(now).toISOString(),
        modifiedTimestamp: now,
        permissions:
          createIntent.type === "directory" ? "drwxr-xr-x" : "-rw-r--r--",
        owner: host.username,
        group: host.username,
      },
    ]);
    setCreateIntent(null);
  }

  function openContextMenu(event: React.MouseEvent, file?: FileItem) {
    const targets = file
      ? selectedFiles.some((f) => f.path === file.path)
        ? selectedFiles
        : [file]
      : [];
    if (file && !selectedFiles.some((f) => f.path === file.path)) {
      setSelectedFiles([file]);
    }
    setContextMenu({
      visible: true,
      x: event.clientX,
      y: event.clientY,
      files: targets,
    });
  }

  async function copyPaths(files: FileItem[]) {
    await copyToClipboard(files.map((f) => f.path).join("\n"));
    toast.success(t("fileManager.copyPath"));
  }

  return (
    <PanelShell
      icon={<FolderIcon className="size-4" />}
      title="Files"
      status={host.name}
      scroll={false}
      toolbar={
        <FileManagerToolbar
          t={t}
          currentPath={currentPath}
          navIndex={navIndex}
          navHistoryLength={navHistory.length}
          isLoading={isLoading}
          selectedFiles={selectedFiles}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
          density={density}
          setDensity={setDensity}
          sortBy={sortBy}
          setSortBy={setSortBy}
          sortOrder={sortOrder}
          setSortOrder={setSortOrder}
          setMobileSidebarOpen={(updater) =>
            setMobileSidebarOpen((open) => updater(open))
          }
          goBack={goBack}
          goForward={goForward}
          goUp={goUp}
          navigateTo={navigateTo}
          onRefresh={() => {
            overrides.current.delete(currentPath);
            setRefreshToken((n) => n + 1);
          }}
          onDeleteFiles={handleDelete}
          onCopyFiles={(files) => setClipboard(files)}
          onUpload={() => toast.info(t("fileManager.uploadFile"))}
          onCreateFolder={() =>
            setCreateIntent({ type: "directory", currentName: "new-folder" })
          }
          onCreateFile={() =>
            setCreateIntent({ type: "file", currentName: "new-file" })
          }
        />
      }
    >
      <div className="relative flex min-h-0 flex-1">
        <div
          className={`${mobileSidebarOpen ? "flex" : "hidden"} md:flex w-44 lg:w-56 shrink-0 flex-col overflow-hidden min-h-0 border-r border-border`}
        >
          <FileManagerSidebar
            currentPath={currentPath}
            onPathChange={navigateTo}
            onFileOpen={(path) => {
              const parent = path.substring(0, path.lastIndexOf("/")) || "/";
              navigateTo(parent);
            }}
            onOpenTrash={() => toast.info(t("fileManager.trash"))}
          />
        </div>

        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <FileManagerGrid
            files={visibleFiles}
            selectedFiles={selectedFiles}
            viewMode={viewMode}
            density={density}
            sortBy={sortBy}
            sortOrder={sortOrder}
            editingFile={editingFile}
            createIntent={createIntent}
            onSortChange={handleSortChange}
            onSelectionChange={setSelectedFiles}
            onFileOpen={openFile}
            onContextMenu={openContextMenu}
            onRename={handleRename}
            onCancelEdit={() => setEditingFile(null)}
            onConfirmCreate={handleConfirmCreate}
            onCancelCreate={() => setCreateIntent(null)}
          />
        </div>
      </div>

      <FileManagerContextMenu
        x={contextMenu.x}
        y={contextMenu.y}
        files={contextMenu.files}
        isVisible={contextMenu.visible}
        currentPath={currentPath}
        hasClipboard={!!clipboard}
        isPinned={(file) => pinnedPaths.has(file.path)}
        onClose={() => setContextMenu(CLOSED_MENU)}
        onPreview={(file) => void previewFile(file)}
        onDownload={() => toast.info(t("fileManager.downloadFile"))}
        onRename={setEditingFile}
        onCopy={(files) => setClipboard(files)}
        onCut={(files) => setClipboard(files)}
        onPaste={() => {
          if (!clipboard) return;
          const existing = new Set(entries.map((e) => e.path));
          const added = clipboard.filter((f) => !existing.has(f.path));
          if (added.length > 0) applyToCurrent([...entries, ...added]);
        }}
        onDelete={handleDelete}
        onProperties={(file) =>
          toast.message(file.name, {
            description: `${file.permissions ?? ""} ${file.owner ?? ""}`.trim(),
          })
        }
        onCopyPath={(files) => void copyPaths(files)}
        onPin={(file) =>
          setPinnedPaths((prev) => new Set(prev).add(file.path))
        }
        onUnpin={(file) =>
          setPinnedPaths((prev) => {
            const next = new Set(prev);
            next.delete(file.path);
            return next;
          })
        }
        onAddShortcut={() => toast.info(t("fileManager.addToShortcuts"))}
        onCompress={() => toast.info(t("fileManager.compressFile"))}
        onExtract={() => toast.info(t("fileManager.extractArchive"))}
        onOpenTerminal={() => toast.info(t("fileManager.openTerminalHere"))}
        onUpload={() => toast.info(t("fileManager.uploadFile"))}
        onNewFolder={() =>
          setCreateIntent({ type: "directory", currentName: "new-folder" })
        }
        onNewFile={() =>
          setCreateIntent({ type: "file", currentName: "new-file" })
        }
        onRefresh={() => {
          overrides.current.delete(currentPath);
          setRefreshToken((n) => n + 1);
        }}
      />
    </PanelShell>
  );
}
