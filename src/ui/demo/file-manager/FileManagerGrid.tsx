import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  Archive,
  ArrowDown,
  ArrowUp,
  Code,
  File,
  FileAudio,
  FileImage,
  FileSymlink,
  FileText,
  FileVideo,
  Folder,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FileItem } from "@/types";
import {
  formatFileSize,
  type CreateIntent,
  type Density,
  type SortBy,
  type SortOrder,
  type ViewMode,
} from "./types";

const ROW_COLS = "grid-cols-[1fr_120px_150px_80px_90px]";

// Rows lost their bottom border to the left-edge selection marker, so the
// measured height is one pixel under the real app's 41.
const LIST_ROW_H = 40;
const GRID_ROW_H = 112;
const GRID_CELL_W = 112;

// Folders lead with the brand accent, links read as a pointer, and plain files
// stay neutral so a long listing is not a wall of competing colors.
function fileTypeColor(file: FileItem): string {
  if (file.type === "directory") return "text-accent-brand";
  if (file.type === "link") return "text-blue-400";
  return "text-muted-foreground";
}

function fileIcon(file: FileItem, viewMode: ViewMode, compact: boolean) {
  const iconClass = compact
    ? viewMode === "grid"
      ? "size-6"
      : "size-4"
    : viewMode === "grid"
      ? "size-8"
      : "size-6";
  const color = fileTypeColor(file);
  const className = `${iconClass} ${color}`;

  if (file.type === "directory") return <Folder className={className} />;
  if (file.type === "link") return <FileSymlink className={className} />;

  switch (file.name.split(".").pop()?.toLowerCase()) {
    case "txt":
    case "md":
    case "readme":
      return <FileText className={className} />;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "bmp":
    case "svg":
      return <FileImage className={className} />;
    case "mp4":
    case "avi":
    case "mkv":
    case "mov":
      return <FileVideo className={className} />;
    case "mp3":
    case "wav":
    case "flac":
    case "ogg":
      return <FileAudio className={className} />;
    case "zip":
    case "tar":
    case "gz":
    case "rar":
    case "7z":
      return <Archive className={className} />;
    case "js":
    case "ts":
    case "jsx":
    case "tsx":
    case "py":
    case "java":
    case "cpp":
    case "c":
    case "cs":
    case "php":
    case "rb":
    case "go":
    case "rs":
      return <Code className={className} />;
    case "json":
    case "xml":
    case "yaml":
    case "yml":
    case "toml":
    case "ini":
    case "conf":
    case "config":
      return <Settings className={className} />;
    default:
      return <File className={className} />;
  }
}

interface FileManagerGridProps {
  files: FileItem[];
  selectedFiles: FileItem[];
  viewMode: ViewMode;
  density: Density;
  sortBy: SortBy;
  sortOrder: SortOrder;
  editingFile: FileItem | null;
  createIntent: CreateIntent | null;
  onSortChange: (field: SortBy) => void;
  onSelectionChange: (files: FileItem[]) => void;
  onFileOpen: (file: FileItem) => void;
  onContextMenu: (event: React.MouseEvent, file?: FileItem) => void;
  onRename: (file: FileItem, newName: string) => void;
  onCancelEdit: () => void;
  onConfirmCreate: (name: string) => void;
  onCancelCreate: () => void;
}

export function FileManagerGrid({
  files,
  selectedFiles,
  viewMode,
  density,
  sortBy,
  sortOrder,
  editingFile,
  createIntent,
  onSortChange,
  onSelectionChange,
  onFileOpen,
  onContextMenu,
  onRename,
  onCancelEdit,
  onConfirmCreate,
  onCancelCreate,
}: FileManagerGridProps) {
  const { t } = useTranslation();
  const compact = density === "compact";
  const scrollRef = useRef<HTMLDivElement>(null);
  const [gridCols, setGridCols] = useState(6);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || viewMode !== "grid") return;
    const measure = () => {
      const width = el.clientWidth;
      const cols = Math.floor((width + 16) / GRID_CELL_W);
      setGridCols(Math.min(8, Math.max(2, cols)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewMode, compact]);

  const listVirtualizer = useVirtualizer({
    count: viewMode === "list" ? files.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 32 : LIST_ROW_H),
    overscan: 16,
  });

  const gridRowCount = Math.ceil(files.length / gridCols);
  const gridVirtualizer = useVirtualizer({
    count: viewMode === "grid" ? gridRowCount : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (compact ? 88 : GRID_ROW_H),
    overscan: 6,
  });

  function handleFileClick(file: FileItem, e: React.MouseEvent) {
    if (e.ctrlKey || e.metaKey) {
      const next = selectedFiles.some((f) => f.path === file.path)
        ? selectedFiles.filter((f) => f.path !== file.path)
        : [...selectedFiles, file];
      onSelectionChange(next);
      return;
    }
    onSelectionChange([file]);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      {viewMode === "list" && (
        <div
          className={cn(
            "grid gap-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 border-b border-border bg-background",
            ROW_COLS,
            compact ? "px-3 py-1" : "px-3 py-2",
          )}
        >
          <button
            className="flex items-center gap-1 text-left hover:text-accent-brand transition-colors"
            onClick={() => onSortChange("name")}
          >
            {t("fileManager.sortByName")}
            {sortBy === "name" &&
              (sortOrder === "asc" ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              ))}
          </button>
          <button
            className="flex items-center gap-1 text-left hover:text-accent-brand transition-colors"
            onClick={() => onSortChange("modified")}
          >
            {t("fileManager.sortByDate")}
            {sortBy === "modified" &&
              (sortOrder === "asc" ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              ))}
          </button>
          <span className="hidden md:block">{t("fileManager.owner")}</span>
          <button
            className="flex items-center gap-1 justify-end hover:text-accent-brand transition-colors"
            onClick={() => onSortChange("size")}
          >
            {t("fileManager.sortBySize")}
            {sortBy === "size" &&
              (sortOrder === "asc" ? (
                <ArrowUp className="size-3" />
              ) : (
                <ArrowDown className="size-3" />
              ))}
          </button>
          <span className="text-right">{t("fileManager.permissions")}</span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto relative"
        onContextMenu={(e) => {
          e.preventDefault();
          onContextMenu(e);
        }}
      >
        {files.length === 0 && !createIntent ? (
          <div className="flex h-full select-none flex-col items-center justify-center gap-2 text-center">
            <Folder
              className="size-8 text-muted-foreground/30"
              strokeWidth={1.5}
            />
            <span className="text-xs text-muted-foreground">
              {t("fileManager.emptyFolder")}
            </span>
          </div>
        ) : viewMode === "list" ? (
          <div className="relative w-full">
            {createIntent && (
              <CreateRow
                intent={createIntent}
                compact={compact}
                onConfirm={onConfirmCreate}
                onCancel={onCancelCreate}
              />
            )}
            <div
              className="relative w-full"
              style={{ height: listVirtualizer.getTotalSize() }}
            >
              {listVirtualizer.getVirtualItems().map((vItem) => {
                const file = files[vItem.index];
                const isSelected = selectedFiles.some(
                  (f) => f.path === file.path,
                );
                return (
                  <div
                    key={vItem.key}
                    className="absolute top-0 left-0 w-full"
                    style={{ transform: `translateY(${vItem.start}px)` }}
                  >
                    <div
                      className={cn(
                        "grid gap-2 items-center cursor-pointer select-none border-l-2 transition-colors",
                        ROW_COLS,
                        compact ? "px-3 py-1 text-[11px]" : "px-3 py-2 text-xs",
                        isSelected
                          ? "border-accent-brand bg-accent-brand/10"
                          : "border-transparent hover:bg-muted/50",
                      )}
                      onClick={(e) => handleFileClick(file, e)}
                      onDoubleClick={() => onFileOpen(file)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onContextMenu(e, file);
                      }}
                    >
                      <div
                        className={cn(
                          "flex items-center overflow-hidden",
                          compact ? "gap-2" : "gap-3",
                        )}
                      >
                        <div className="shrink-0">
                          {fileIcon(file, viewMode, compact)}
                        </div>
                        {editingFile?.path === file.path ? (
                          <RenameInput
                            initial={file.name}
                            onConfirm={(name) => onRename(file, name)}
                            onCancel={onCancelEdit}
                          />
                        ) : (
                          <span
                            className="truncate font-medium tracking-tight"
                            title={file.name}
                          >
                            {file.name}
                            {file.type === "link" && file.linkTarget && (
                              <span className="ml-1 font-normal text-muted-foreground">
                                {"-> "}
                                {file.linkTarget}
                              </span>
                            )}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-muted-foreground">
                        {formatModified(file.modified)}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate hidden md:block">
                        {file.owner
                          ? `${file.owner}${file.group ? `:${file.group}` : ""}`
                          : "-"}
                      </span>
                      <span className="text-[10px] text-right text-muted-foreground tabular-nums">
                        {file.type === "file" ? formatFileSize(file.size) : "-"}
                      </span>
                      <span className="text-[10px] text-right font-mono text-muted-foreground/60">
                        {file.permissions || "-"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={cn("flex flex-col p-3", compact ? "gap-2" : "gap-4")}>
            {createIntent && (
              <CreateRow
                intent={createIntent}
                compact={compact}
                onConfirm={onConfirmCreate}
                onCancel={onCancelCreate}
              />
            )}
            <div
              className="relative w-full"
              style={{ height: gridVirtualizer.getTotalSize() }}
            >
              {gridVirtualizer.getVirtualItems().map((vRow) => {
                const start = vRow.index * gridCols;
                const rowFiles = files.slice(start, start + gridCols);
                return (
                  <div
                    key={vRow.key}
                    className="absolute top-0 left-0 w-full grid"
                    style={{
                      transform: `translateY(${vRow.start}px)`,
                      gridTemplateColumns: `repeat(${gridCols}, minmax(0, 1fr))`,
                      gap: compact ? "0.5rem" : "1rem",
                    }}
                  >
                    {rowFiles.map((file) => {
                      const isSelected = selectedFiles.some(
                        (f) => f.path === file.path,
                      );
                      return (
                        <div
                          key={file.path}
                          className={cn(
                            "flex cursor-pointer select-none flex-col items-center gap-1.5 border p-2 transition-colors",
                            isSelected
                              ? "border-accent-brand/40 bg-accent-brand/10"
                              : "border-transparent hover:bg-muted/50",
                          )}
                          onClick={(e) => handleFileClick(file, e)}
                          onDoubleClick={() => onFileOpen(file)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onContextMenu(e, file);
                          }}
                        >
                          {fileIcon(file, viewMode, compact)}
                          {editingFile?.path === file.path ? (
                            <RenameInput
                              initial={file.name}
                              onConfirm={(name) => onRename(file, name)}
                              onCancel={onCancelEdit}
                            />
                          ) : (
                            <span
                              className="w-full truncate text-center text-[11px]"
                              title={file.name}
                            >
                              {file.name}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-border px-3 py-1 text-[10px] text-muted-foreground">
        <span className="tabular-nums">
          {files.length} {t("fileManager.items").toLowerCase()}
        </span>
        {selectedFiles.length > 0 && (
          <span className="tabular-nums text-accent-brand">
            {selectedFiles.length} {t("fileManager.selected").toLowerCase()}
          </span>
        )}
      </div>
    </div>
  );
}

function formatModified(modified?: string): string {
  if (!modified) return "-";
  const parsed = Date.parse(modified);
  if (Number.isNaN(parsed)) return modified;
  return new Date(parsed).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function RenameInput({
  initial,
  onConfirm,
  onCancel,
}: {
  initial: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      ref.current?.focus();
      ref.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const commit = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    const trimmed = value.trim();
    if (trimmed && trimmed !== initial) onConfirm(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={ref}
      type="text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          doneRef.current = true;
          onCancel();
        }
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="flex-1 min-w-0 max-w-[200px] border border-accent-brand/60 bg-card px-2 py-1 text-xs rounded-none outline-none focus:ring-1 focus:ring-accent-brand/50"
    />
  );
}

function CreateRow({
  intent,
  compact,
  onConfirm,
  onCancel,
}: {
  intent: CreateIntent;
  compact: boolean;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-l-2 border-accent-brand bg-accent-brand/5",
        compact ? "px-3 py-1" : "px-3 py-2",
      )}
    >
      {intent.type === "directory" ? (
        <Folder className="size-5 shrink-0 text-accent-brand" />
      ) : (
        <File className="size-5 shrink-0 text-muted-foreground" />
      )}
      <RenameInput
        initial={intent.currentName}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    </div>
  );
}
