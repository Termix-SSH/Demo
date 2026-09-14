import React, { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  Copy,
  FilePlus,
  Folder,
  FolderPlus,
  Layout,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { ViewToggle } from "@/components/panel-layout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import type { FileItem } from "@/types";
import type { Density, SortBy, SortOrder, ViewMode } from "./types";

interface FileManagerToolbarProps {
  t: (key: string) => string;
  currentPath: string;
  navIndex: number;
  navHistoryLength: number;
  isLoading: boolean;
  selectedFiles: FileItem[];
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  density: Density;
  setDensity: (density: Density) => void;
  sortBy: SortBy;
  setSortBy: (sortBy: SortBy) => void;
  sortOrder: SortOrder;
  setSortOrder: (sortOrder: SortOrder) => void;
  setMobileSidebarOpen: (updater: (open: boolean) => boolean) => void;
  goBack: () => void;
  goForward: () => void;
  goUp: () => void;
  navigateTo: (path: string) => void;
  onRefresh: () => void;
  onDeleteFiles: (files: FileItem[]) => void;
  onCopyFiles: (files: FileItem[]) => void;
  onUpload: () => void;
  onCreateFolder: () => void;
  onCreateFile: () => void;
}

function Breadcrumb({
  currentPath,
  navigateTo,
  t,
}: Pick<FileManagerToolbarProps, "currentPath" | "navigateTo" | "t">) {
  return (
    <>
      <Folder className="size-3.5 text-accent-brand shrink-0" />
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-none text-[10px] font-bold uppercase tracking-widest whitespace-nowrap">
        {currentPath.split("/").map((part, i, arr) => (
          <React.Fragment key={i}>
            {part === "" && i === 0 ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateTo("/");
                }}
                className="hover:text-accent-brand transition-colors"
              >
                {t("fileManager.root")}
              </button>
            ) : part !== "" ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigateTo(arr.slice(0, i + 1).join("/") || "/");
                }}
                className="hover:text-accent-brand transition-colors"
              >
                {part}
              </button>
            ) : null}
            {i < arr.length - 1 && part !== "" && (
              <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            )}
            {i === 0 && arr.length > 1 && part === "" && (
              <ChevronRight className="size-3 text-muted-foreground shrink-0" />
            )}
          </React.Fragment>
        ))}
      </div>
    </>
  );
}

function PathBar({
  currentPath,
  navigateTo,
  t,
  className,
}: Pick<FileManagerToolbarProps, "currentPath" | "navigateTo" | "t"> & {
  className: string;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(currentPath);
  const inputRef = useRef<HTMLInputElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    if (!isEditing) return;
    doneRef.current = false;
    const timer = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(timer);
  }, [isEditing]);

  const commit = (path: string) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setIsEditing(false);
    const trimmed = path.trim();
    if (trimmed && trimmed !== currentPath) navigateTo(trimmed);
  };

  const cancel = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className={className}>
        <Folder className="size-3.5 text-accent-brand shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit(value);
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => commit(value)}
          className="flex-1 min-w-0 bg-transparent text-xs font-semibold tracking-wide outline-none text-foreground"
        />
      </div>
    );
  }

  return (
    <div
      className={`${className} cursor-text`}
      onClick={() => {
        setValue(currentPath);
        setIsEditing(true);
      }}
    >
      <Breadcrumb currentPath={currentPath} navigateTo={navigateTo} t={t} />
    </div>
  );
}

export function FileManagerToolbar({
  t,
  currentPath,
  navIndex,
  navHistoryLength,
  isLoading,
  selectedFiles,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  density,
  setDensity,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  setMobileSidebarOpen,
  goBack,
  goForward,
  goUp,
  navigateTo,
  onRefresh,
  onDeleteFiles,
  onCopyFiles,
  onUpload,
  onCreateFolder,
  onCreateFile,
}: FileManagerToolbarProps) {
  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex w-full flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMobileSidebarOpen((open) => !open)}
            className="md:hidden size-8 rounded-none"
            title={t("fileManager.toggleSidebar")}
          >
            <Layout className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goBack}
            disabled={navIndex <= 0}
            className="size-8 rounded-none"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goForward}
            disabled={navIndex >= navHistoryLength - 1}
            className="size-8 rounded-none"
          >
            <ChevronRight className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={goUp}
            disabled={currentPath === "/"}
            className="size-8 rounded-none"
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRefresh}
            className="size-8 rounded-none"
          >
            <RefreshCw
              className={`size-4 ${isLoading ? "animate-spin [animation-duration:0.5s]" : ""}`}
            />
          </Button>
        </div>

        <PathBar
          currentPath={currentPath}
          navigateTo={navigateTo}
          t={t}
          className="hidden md:flex flex-1 items-center px-3 h-8 bg-muted/50 border border-border rounded-none gap-2 overflow-hidden"
        />

        <div className="flex items-center gap-2">
          {selectedFiles.length > 0 && (
            <div className="flex items-center gap-1 px-2 py-1 bg-accent-brand/10 border border-accent-brand/20 text-accent-brand text-[10px] font-black uppercase tracking-tighter">
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-accent-brand hover:bg-accent-brand/20 rounded-none"
                onClick={() => onDeleteFiles(selectedFiles)}
              >
                <Trash2 className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-accent-brand hover:bg-accent-brand/20 rounded-none"
                onClick={() => onCopyFiles(selectedFiles)}
              >
                <Copy className="size-3.5" />
              </Button>
            </div>
          )}

          <div className="relative w-28 md:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              placeholder={t("fileManager.searchFiles")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-muted/50 border-border rounded-none focus:ring-1 focus:ring-accent-brand/50"
            />
          </div>

          <ViewToggle
            view={viewMode}
            onView={setViewMode}
            density={density}
            onDensity={setDensity}
          />

          <button
            onClick={onUpload}
            className="hidden md:flex h-8 px-3 items-center gap-1.5 border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-[10px] font-bold uppercase tracking-widest"
            title={t("fileManager.upload")}
          >
            <Upload className="size-3.5" /> {t("fileManager.upload")}
          </button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none font-bold uppercase tracking-widest text-[10px]"
              >
                <Plus className="size-3.5" />
                {t("fileManager.new")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-44 rounded-none border-border bg-card"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem
                onSelect={() => setTimeout(() => onCreateFolder(), 0)}
                className="rounded-none text-xs font-semibold gap-2 focus:bg-accent-brand/10 focus:text-accent-brand"
              >
                <FolderPlus className="size-4 text-accent-brand" />
                {t("fileManager.newFolder")}
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setTimeout(() => onCreateFile(), 0)}
                className="rounded-none text-xs font-semibold gap-2 focus:bg-accent-brand/10 focus:text-accent-brand"
              >
                <FilePlus className="size-4 text-muted-foreground" />
                {t("fileManager.newFile")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="text-[10px] uppercase tracking-widest text-muted-foreground py-1">
                {t("fileManager.sortBy")}
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={sortBy}
                onValueChange={(value) => setSortBy(value as SortBy)}
              >
                <DropdownMenuRadioItem
                  value="name"
                  className="rounded-none text-xs"
                >
                  {t("fileManager.sortByName")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="modified"
                  className="rounded-none text-xs"
                >
                  {t("fileManager.sortByDate")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="size"
                  className="rounded-none text-xs"
                >
                  {t("fileManager.sortBySize")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
              <DropdownMenuSeparator />
              <DropdownMenuRadioGroup
                value={sortOrder}
                onValueChange={(value) => setSortOrder(value as SortOrder)}
              >
                <DropdownMenuRadioItem
                  value="asc"
                  className="rounded-none text-xs"
                >
                  {t("fileManager.ascending")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem
                  value="desc"
                  className="rounded-none text-xs"
                >
                  {t("fileManager.descending")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-2 md:hidden">
        <PathBar
          currentPath={currentPath}
          navigateTo={navigateTo}
          t={t}
          className="flex h-8 flex-1 items-center gap-2 overflow-hidden border border-border bg-muted/50 px-3"
        />
      </div>
    </div>
  );
}
