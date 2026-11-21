import { Fragment } from "react";
import { ChevronDown } from "lucide-react";
import {
  FolderIconEl,
  type Host,
  type HostFolder,
  type TabType,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { HostRow, type OpenHostOptions } from "./HostRow";
import { isFolder, sortHosts } from "./host-search";
import { elevatedBg, headerBg, outlineButton } from "./styles";

export interface FolderCardActions {
  onOpen: (host: Host, type: TabType, options?: OpenHostOptions) => void;
  onEdit?: (host: Host) => void;
  onShare?: (host: Host) => void;
  showTags: boolean;
  focusExisting: boolean;
}

function HostWithChildren({
  host,
  depth,
  actions,
}: {
  host: Host;
  depth: number;
  actions: FolderCardActions;
}) {
  return (
    <>
      <HostRow host={host} depth={depth} {...actions} />
      {sortHosts(host.childHosts ?? []).map((child) => (
        <HostWithChildren
          key={child.id}
          host={child}
          depth={depth + 1}
          actions={actions}
        />
      ))}
    </>
  );
}

/** The hosts of one folder, under the folder's own header. */
export function FolderCard({
  title,
  folder,
  expanded,
  onToggle,
  isExpanded,
  actions,
}: {
  title: string;
  folder: HostFolder;
  expanded: boolean;
  onToggle: (path: string) => void;
  /** Whether a nested folder is open. */
  isExpanded: (path: string) => boolean;
  actions: FolderCardActions;
}) {
  const { t } = useTranslation();
  const path = folder.path ?? folder.name;
  const hosts = sortHosts(
    folder.children.filter((child): child is Host => !isFolder(child)),
  );
  const subfolders = folder.children
    .filter(isFolder)
    .sort((a, b) => a.name.localeCompare(b.name));
  const bodyId = `original-folder-${path.replace(/[^\w-]/g, "_")}`;

  return (
    <section
      className={`${elevatedBg} shrink-0 overflow-hidden rounded-[0.625rem] border-2 border-border`}
      aria-label={title}
    >
      <div
        className={`relative flex items-center gap-2 px-4 py-3 pr-12 ${headerBg} ${expanded ? "border-b-2 border-border" : ""}`}
      >
        <FolderIconEl
          icon={folder.icon}
          className="size-4 shrink-0"
          style={folder.color ? { color: folder.color } : undefined}
        />
        <h3 className="min-w-0 flex-1 break-words text-base font-semibold leading-tight">
          {title}
        </h3>
        <button
          type="button"
          onClick={() => onToggle(path)}
          aria-expanded={expanded}
          aria-controls={bodyId}
          title={
            expanded ? t("original.collapseFolder") : t("original.expandFolder")
          }
          aria-label={
            expanded ? t("original.collapseFolder") : t("original.expandFolder")
          }
          className={`${outlineButton} absolute right-4 top-1/2 size-7 -translate-y-1/2`}
        >
          <ChevronDown
            className={`size-4 transition-transform ${expanded ? "" : "rotate-180"}`}
          />
        </button>
      </div>
      {expanded && (
        <div id={bodyId} className="flex flex-col gap-y-3 p-2">
          {hosts.map((host, index) => (
            <Fragment key={host.id}>
              {index > 0 && <div className="-mx-2 h-0.5 bg-border" />}
              <HostWithChildren host={host} depth={0} actions={actions} />
            </Fragment>
          ))}
          {subfolders.map((sub) => (
            <FolderCard
              key={sub.path ?? sub.name}
              title={sub.name}
              folder={sub}
              expanded={isExpanded(sub.path ?? sub.name)}
              onToggle={onToggle}
              isExpanded={isExpanded}
              actions={actions}
            />
          ))}
        </div>
      )}
    </section>
  );
}
