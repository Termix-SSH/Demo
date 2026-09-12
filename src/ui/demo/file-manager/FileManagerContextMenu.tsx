import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Clipboard,
  Copy,
  Download,
  Edit3,
  Eye,
  FileArchive,
  FilePlus,
  FolderPlus,
  Info,
  Link,
  RefreshCw,
  Scissors,
  Star,
  Terminal,
  Trash2,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Kbd, KbdKey, KbdSeparator } from "@/components/kbd";
import type { FileItem } from "@/types";

const VIEWPORT_PADDING = 16;

interface MenuItem {
  icon?: React.ReactNode;
  label?: string;
  action?: () => void;
  shortcut?: string;
  danger?: boolean;
  separator?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  files: FileItem[];
  isVisible: boolean;
  currentPath: string;
  hasClipboard: boolean;
  isPinned: (file: FileItem) => boolean;
  onClose: () => void;
  onPreview: (file: FileItem) => void;
  onDownload: (files: FileItem[]) => void;
  onRename: (file: FileItem) => void;
  onCopy: (files: FileItem[]) => void;
  onCut: (files: FileItem[]) => void;
  onPaste: () => void;
  onDelete: (files: FileItem[]) => void;
  onProperties: (file: FileItem) => void;
  onCopyPath: (files: FileItem[]) => void;
  onPin: (file: FileItem) => void;
  onUnpin: (file: FileItem) => void;
  onAddShortcut: (path: string) => void;
  onCompress: (files: FileItem[]) => void;
  onExtract: (file: FileItem) => void;
  onOpenTerminal: (path: string) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onNewFile: () => void;
  onRefresh: () => void;
}

const ARCHIVE_EXTS = ["zip", "tar", "gz", "tgz", "bz2", "xz", "rar", "7z"];

export function FileManagerContextMenu(props: ContextMenuProps) {
  const { t } = useTranslation();
  const { x, y, files, isVisible, onClose } = props;
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x, y });
  const [isMounted, setIsMounted] = useState(false);

  useLayoutEffect(() => {
    if (!isVisible) return;
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let nextX = x;
    let nextY = y;
    if (x + rect.width > window.innerWidth - VIEWPORT_PADDING) {
      nextX = Math.max(VIEWPORT_PADDING, window.innerWidth - rect.width - VIEWPORT_PADDING);
    }
    if (y + rect.height > window.innerHeight - VIEWPORT_PADDING) {
      nextY = Math.max(VIEWPORT_PADDING, window.innerHeight - rect.height - VIEWPORT_PADDING);
    }
    setPosition({ x: nextX, y: nextY });
    setIsMounted(true);
  }, [isVisible, x, y]);

  useEffect(() => {
    if (!isVisible) {
      setIsMounted(false);
      return;
    }
    const onPointerDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const items: MenuItem[] = [];
  const single = files.length === 1 ? files[0] : null;
  const multiple = files.length > 1;

  if (files.length > 0) {
    if (single && single.type === "file") {
      items.push({
        icon: <Eye className="size-3.5" />,
        label: t("fileManager.preview"),
        action: () => props.onPreview(single),
      });
    }

    items.push({
      icon: <Download className="size-3.5" />,
      label: multiple
        ? t("fileManager.downloadFiles", { count: files.length })
        : t("fileManager.downloadFile"),
      action: () => props.onDownload(files),
    });

    if (single) {
      const ext = single.name.split(".").pop()?.toLowerCase() ?? "";
      if (ARCHIVE_EXTS.includes(ext)) {
        items.push({
          icon: <FileArchive className="size-3.5" />,
          label: t("fileManager.extractArchive"),
          action: () => props.onExtract(single),
        });
      }
    }

    items.push({
      icon: <FileArchive className="size-3.5" />,
      label: multiple
        ? t("fileManager.compressFiles")
        : t("fileManager.compressFile"),
      action: () => props.onCompress(files),
    });

    if (single && single.type === "file") {
      items.push(
        props.isPinned(single)
          ? {
              icon: <Star className="size-3.5" />,
              label: t("fileManager.unpinFile"),
              action: () => props.onUnpin(single),
            }
          : {
              icon: <Star className="size-3.5" />,
              label: t("fileManager.pinFile"),
              action: () => props.onPin(single),
            },
      );
    }

    if (single && single.type === "directory") {
      items.push({
        icon: <Link className="size-3.5" />,
        label: t("fileManager.addToShortcuts"),
        action: () => props.onAddShortcut(single.path),
      });
    }

    items.push({ separator: true });

    if (single) {
      items.push({
        icon: <Edit3 className="size-3.5" />,
        label: t("fileManager.rename"),
        action: () => props.onRename(single),
        shortcut: "F2",
      });
    }

    items.push(
      {
        icon: <Copy className="size-3.5" />,
        label: multiple
          ? t("fileManager.copyFiles", { count: files.length })
          : t("fileManager.copy"),
        action: () => props.onCopy(files),
        shortcut: "Ctrl+C",
      },
      {
        icon: <Scissors className="size-3.5" />,
        label: multiple
          ? t("fileManager.cutFiles", { count: files.length })
          : t("fileManager.cut"),
        action: () => props.onCut(files),
        shortcut: "Ctrl+X",
      },
      {
        icon: <Link className="size-3.5" />,
        label: multiple
          ? t("fileManager.copyPaths")
          : t("fileManager.copyPath"),
        action: () => props.onCopyPath(files),
      },
    );

    if (single) {
      items.push({ separator: true });
      items.push({
        icon: <Info className="size-3.5" />,
        label: t("fileManager.properties"),
        action: () => props.onProperties(single),
      });
    }

    items.push({ separator: true });
    items.push({
      icon: <Trash2 className="size-3.5" />,
      label: multiple
        ? t("fileManager.deleteFiles", { count: files.length })
        : t("fileManager.delete"),
      action: () => props.onDelete(files),
      shortcut: "Del",
      danger: true,
    });
  } else {
    items.push(
      {
        icon: <Terminal className="size-3.5" />,
        label: t("fileManager.openTerminalHere"),
        action: () => props.onOpenTerminal(props.currentPath),
      },
      { separator: true },
      {
        icon: <Upload className="size-3.5" />,
        label: t("fileManager.uploadFile"),
        action: props.onUpload,
      },
      {
        icon: <FolderPlus className="size-3.5" />,
        label: t("fileManager.newFolder"),
        action: props.onNewFolder,
      },
      {
        icon: <FilePlus className="size-3.5" />,
        label: t("fileManager.newFile"),
        action: props.onNewFile,
      },
      { separator: true },
      {
        icon: <RefreshCw className="size-3.5" />,
        label: t("fileManager.refresh"),
        action: props.onRefresh,
        shortcut: "Ctrl+Y",
      },
    );

    if (props.hasClipboard) {
      items.push({
        icon: <Clipboard className="size-3.5" />,
        label: t("fileManager.paste"),
        action: props.onPaste,
        shortcut: "Ctrl+V",
      });
    }
  }

  const trimmed = items.filter((item, i) => {
    if (!item.separator) return true;
    const prev = i > 0 ? items[i - 1] : null;
    const next = i < items.length - 1 ? items[i + 1] : null;
    return !prev?.separator && !next?.separator;
  });
  const finalItems = trimmed.filter((item, i) => {
    if (!item.separator) return true;
    return i > 0 && i < trimmed.length - 1;
  });

  const renderShortcut = (shortcut: string) => {
    const keys = shortcut.split("+");
    if (keys.length === 1) return <Kbd>{keys[0]}</Kbd>;
    return (
      <Kbd>
        {keys.map((key, i) => (
          <span key={key} className="inline-flex items-center">
            <KbdKey>{key}</KbdKey>
            {i < keys.length - 1 && <KbdSeparator />}
          </span>
        ))}
      </Kbd>
    );
  };

  return (
    <div
      ref={menuRef}
      className={cn(
        "fixed bg-card border border-border rounded-none shadow-md min-w-[220px] max-w-[300px] z-[99995] overflow-x-hidden overflow-y-auto py-1",
        !isMounted && "opacity-0",
      )}
      style={{
        left: position.x,
        top: position.y,
        maxHeight: `calc(100vh - ${VIEWPORT_PADDING * 2}px)`,
      }}
    >
      {finalItems.map((item, index) =>
        item.separator ? (
          <div
            key={`sep-${index}`}
            className="my-1 border-t border-border"
          />
        ) : (
          <button
            key={item.label}
            className={cn(
              "w-full px-3 min-h-8 py-1.5 text-left text-xs font-semibold flex items-center justify-between gap-3 rounded-none transition-colors cursor-pointer",
              "hover:bg-accent-brand/10 hover:text-accent-brand",
              item.danger &&
                "text-destructive hover:bg-destructive/10 hover:text-destructive",
            )}
            onClick={() => {
              item.action?.();
              onClose();
            }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="shrink-0 text-muted-foreground">{item.icon}</div>
              <span className="flex-1 leading-tight">{item.label}</span>
            </div>
            {item.shortcut && (
              <div className="ml-auto shrink-0 opacity-50">
                {renderShortcut(item.shortcut)}
              </div>
            )}
          </button>
        ),
      )}
    </div>
  );
}
