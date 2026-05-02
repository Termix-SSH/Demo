import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Box,
  ChevronRight,
  Folder,
  FolderOpen,
  FolderSearch,
  MoreHorizontal,
  Network,
  Pencil,
  Server,
  Tag,
  Terminal,
} from "lucide-react";
import type { Host, HostFolder, TabType } from "@/ui/types";

export function isFolder(item: Host | HostFolder): item is HostFolder {
  return "children" in item;
}

export function HostItem({ host, onOpenTab }: { host: Host; onOpenTab: (type: TabType) => void }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const isOnline = host.online;

  return (
    <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
      <div
        className="flex items-center justify-between group px-2 py-1 hover:bg-muted cursor-pointer border-l-2 border-l-transparent"
        onClick={() => onOpenTab("terminal")}
        onContextMenu={e => { e.preventDefault(); setDropdownOpen(true); }}
      >
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className={`size-1.5 rounded-full shrink-0 ${isOnline ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
            <span className="text-xs font-medium truncate">{host.name}</span>
          </div>
          <span className="text-xs text-muted-foreground truncate">{host.user}@{host.address}</span>
          {host.tags && host.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {host.tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-0.5 px-1.5 py-px text-[10px] font-medium bg-muted text-muted-foreground border border-border leading-none">
                  <Tag className="size-2 shrink-0"/>
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
          <Button variant="ghost" size="icon-xs" className="text-accent-brand" onClick={e => { e.stopPropagation(); onOpenTab("terminal"); }}>
            <Terminal/>
          </Button>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={e => e.stopPropagation()}>
              <MoreHorizontal/>
            </Button>
          </DropdownMenuTrigger>
        </div>
      </div>
      <DropdownMenuContent side="right" align="start" sideOffset={17} alignOffset={0} className="w-44 [clip-path:inset(-4px_-4px_-4px_0px)]">
        <DropdownMenuItem onClick={() => onOpenTab("terminal")}>
          <Terminal className="size-3.5"/>Open Terminal
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("stats")}>
          <Server className="size-3.5"/>Open Server Stats
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("files")}>
          <FolderSearch className="size-3.5"/>Open File Manager
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("docker")}>
          <Box className="size-3.5"/>Open Docker
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onOpenTab("tunnel")}>
          <Network className="size-3.5"/>Open Tunnel
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Pencil className="size-3.5"/>Edit
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function FolderItem({ folder, depth = 0, onOpenTab }: {
  folder: HostFolder;
  depth?: number;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const [open, setOpen] = useState(depth === 0);

  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1 w-full px-2 py-1 hover:bg-muted text-left">
        <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? "rotate-90 text-accent-brand" : "text-muted-foreground"}`}/>
        {open
          ? <FolderOpen className="size-3.5 shrink-0 text-accent-brand"/>
          : <Folder className="size-3.5 shrink-0 text-muted-foreground"/>
        }
        <span className="text-xs font-medium">{folder.name}</span>
      </button>
      {open && (
        <div className="ml-3 border-l border-border pl-1">
          {folder.children.map((child, i) =>
            isFolder(child)
              ? <FolderItem key={i} folder={child} depth={depth + 1} onOpenTab={onOpenTab}/>
              : <HostItem key={i} host={child} onOpenTab={(type) => onOpenTab(child, type)}/>
          )}
        </div>
      )}
    </div>
  );
}
