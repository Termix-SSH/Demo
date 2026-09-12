import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Bookmark, ChevronDown, File, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import FolderTree from "@/components/folder";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/dropdown-menu";
import {
  getFolderShortcuts,
  getPinnedFiles,
  getRecentFiles,
  getDiskUsage,
  listFiles,
} from "@/demo/demo-api";
import type { DemoQuickAccessItem } from "@/demo/demo-data";

interface TreeNode {
  id: string;
  name: string;
  path: string;
  children?: TreeNode[];
}

function parentDir(path: string): string {
  return path.substring(0, path.lastIndexOf("/")) || "/";
}

export function FileManagerSidebar({
  currentPath,
  onPathChange,
  onFileOpen,
  onOpenTrash,
}: {
  currentPath: string;
  onPathChange: (path: string) => void;
  onFileOpen: (path: string) => void;
  onOpenTrash: () => void;
}) {
  const { t } = useTranslation();
  const [recent, setRecent] = useState<DemoQuickAccessItem[]>([]);
  const [pinned, setPinned] = useState<DemoQuickAccessItem[]>([]);
  const [shortcuts, setShortcuts] = useState<DemoQuickAccessItem[]>([]);
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [storage, setStorage] = useState<Awaited<
    ReturnType<typeof getDiskUsage>
  > | null>(null);
  const [selectedMount, setSelectedMount] = useState<string | null>(null);

  useEffect(() => {
    void getRecentFiles().then(setRecent);
    void getPinnedFiles().then(setPinned);
    void getFolderShortcuts().then(setShortcuts);
    void getDiskUsage().then(setStorage);
  }, []);

  useEffect(() => {
    void listFiles("/").then((rows) =>
      setTree(
        rows
          .filter((r) => r.type === "directory")
          .map((r) => ({ id: r.path, name: r.name, path: r.path })),
      ),
    );
  }, []);

  // Expanding a node pulls its children in, so the tree fills out as it is used.
  async function expand(node: TreeNode) {
    if (node.children) return;
    const rows = await listFiles(node.path);
    const children = rows
      .filter((r) => r.type === "directory")
      .map((r) => ({ id: r.path, name: r.name, path: r.path }));
    setTree((prev) => attachChildren(prev, node.id, children));
  }

  const ancestorIds = useMemo(() => {
    const ids = new Set<string>();
    const parts = currentPath.split("/").filter(Boolean);
    let acc = "";
    for (const part of parts) {
      acc += `/${part}`;
      ids.add(acc);
    }
    return ids;
  }, [currentPath]);

  useEffect(() => {
    for (const id of ancestorIds) {
      const node = findNode(tree, id);
      if (node && !node.children) void expand(node);
    }
  }, [ancestorIds, tree]);

  const activeStorage = useMemo(() => {
    if (!storage) return null;
    if (!selectedMount) return storage;
    const fs = storage.filesystems.find((f) => f.mount === selectedMount);
    return fs ? { ...storage, ...fs } : storage;
  }, [storage, selectedMount]);

  const hasQuickAccess =
    recent.length > 0 || pinned.length > 0 || shortcuts.length > 0;

  const quickItem = (
    item: DemoQuickAccessItem,
    icon: React.ReactNode,
    target: string,
    onClick: () => void,
  ) => (
    <button
      key={`${item.id}-${item.path}`}
      className={cn(
        "w-full flex items-center gap-2.5 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-colors text-left border-l-2",
        currentPath === target
          ? "bg-accent-brand/10 text-accent-brand border-accent-brand"
          : "text-muted-foreground hover:text-foreground hover:bg-muted border-transparent",
      )}
      onClick={onClick}
      title={item.path}
    >
      <div className="shrink-0">{icon}</div>
      <span className="flex-1 truncate">{item.name}</span>
    </button>
  );

  const section = (title: string, children: React.ReactNode) => (
    <div>
      <div className="px-3 py-1.5">
        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
          {title}
        </span>
      </div>
      {children}
    </div>
  );

  const renderNode = (node: TreeNode): React.ReactNode => (
    <FolderTree.Item key={node.id} id={node.id} label={node.name}>
      <FolderTree.Content>
        {node.children?.map((child) => renderNode(child))}
      </FolderTree.Content>
    </FolderTree.Item>
  );

  return (
    <div className="h-full flex flex-col bg-card overflow-hidden">
      <div className="flex-1 overflow-y-auto">
        <button
          className="w-full flex items-center gap-2.5 px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
          onClick={onOpenTrash}
        >
          <Trash2 className="size-3.5 shrink-0" />
          <span>{t("fileManager.trash")}</span>
        </button>

        {recent.length > 0 &&
          section(
            t("fileManager.recent"),
            recent.map((item) =>
              quickItem(
                item,
                <File
                  className={cn(
                    "size-3.5 shrink-0",
                    currentPath === parentDir(item.path)
                      ? "text-accent-brand"
                      : "text-muted-foreground/60",
                  )}
                />,
                parentDir(item.path),
                () => onFileOpen(item.path),
              ),
            ),
          )}

        {pinned.length > 0 &&
          section(
            t("fileManager.pinned"),
            pinned.map((item) =>
              quickItem(
                item,
                <Star
                  className={cn(
                    "size-3.5 shrink-0",
                    currentPath === parentDir(item.path)
                      ? "text-accent-brand fill-accent-brand"
                      : "text-muted-foreground/60",
                  )}
                />,
                parentDir(item.path),
                () => onFileOpen(item.path),
              ),
            ),
          )}

        {shortcuts.length > 0 &&
          section(
            t("fileManager.folderShortcuts"),
            shortcuts.map((item) =>
              quickItem(
                item,
                <Bookmark
                  className={cn(
                    "size-3.5 shrink-0",
                    currentPath === item.path
                      ? "text-accent-brand"
                      : "text-muted-foreground/60",
                  )}
                />,
                item.path,
                () => onPathChange(item.path),
              ),
            ),
          )}

        <div className={cn(hasQuickAccess && "border-t border-border mt-1 pt-1")}>
          <div className="px-3 py-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              {t("fileManager.directories")}
            </span>
          </div>
          <div className="px-1">
            <FolderTree.Root
              id="demo-directory-tree"
              selectedId={currentPath}
              expandedIds={ancestorIds}
              onSelect={(id) => onPathChange(id)}
              className="bg-transparent border-0 rounded-none shadow-none"
            >
              {tree.map((node) => renderNode(node))}
            </FolderTree.Root>
          </div>
        </div>
      </div>

      {activeStorage && (
        <div className="flex flex-col p-3 gap-2 border-t border-border shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("fileManager.storage")}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-foreground hover:text-accent-brand transition-colors">
                {selectedMount ?? activeStorage.mount}
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="rounded-none border-border bg-card"
            >
              {storage?.filesystems.map((fs) => (
                <DropdownMenuItem
                  key={fs.mount}
                  className="rounded-none text-xs"
                  onSelect={() => setSelectedMount(fs.mount)}
                >
                  {fs.mount}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="h-1.5 w-full bg-muted overflow-hidden">
            <div
              className="h-full bg-accent-brand"
              style={{ width: `${activeStorage.percent}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">
            {activeStorage.usedHuman} {t("fileManager.of")}{" "}
            {activeStorage.totalHuman} {t("fileManager.used").toLowerCase()}
          </span>
        </div>
      )}
    </div>
  );
}

function findNode(nodes: TreeNode[], id: string): TreeNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function attachChildren(
  nodes: TreeNode[],
  id: string,
  children: TreeNode[],
): TreeNode[] {
  return nodes.map((node) => {
    if (node.id === id) return { ...node, children };
    if (node.children) {
      return { ...node, children: attachChildren(node.children, id, children) };
    }
    return node;
  });
}
