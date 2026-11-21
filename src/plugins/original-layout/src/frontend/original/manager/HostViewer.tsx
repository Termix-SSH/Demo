import { useMemo, useState } from "react";
import {
  Activity,
  Copy,
  Download,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import {
  hostActionsFor,
  useHostActions,
  type Host,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  canDeleteHost,
  canOpenHostEditor,
} from "../../sidebar/host-permissions";
import { hostMatches, parseHostQuery } from "../host-search";
import { outlineButton, wideButton } from "../styles";
import { FolderSections, groupByFolder } from "./FolderSections";

/** Tools listed on a card before the rest fold into a count. */
export const MAX_CARD_TOOLS = 6;

export const cardClass =
  "group/card flex h-full flex-col gap-2 rounded-[0.5rem] border border-border bg-[var(--original-field,var(--muted))] p-3 transition-colors hover:border-[color:var(--original-button-border,var(--input))]";

export const iconButton =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-[0.375rem] transition-colors hover:bg-[var(--original-button-hover,var(--accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A host's settings without secrets, as a JSON file to keep or share. */
export function hostExport(host: Host): Record<string, unknown> {
  return {
    name: host.name,
    ip: host.ip,
    port: host.port,
    username: host.username,
    folder: host.folder || undefined,
    tags: host.tags ?? [],
    pin: !!host.pin,
    notes: host.notes || undefined,
    authType: host.authType,
    enableSsh: host.enableSsh,
    sshPort: host.sshPort,
    statusCheckEnabled: host.statusCheckEnabled,
    statusCheckInterval: host.statusCheckInterval,
  };
}

function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${name.replace(/[^\w.-]+/g, "_") || "host"}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

function HostCard({
  host,
  onEdit,
  onDuplicate,
  onDelete,
}: {
  host: Host;
  onEdit: (host: Host) => void;
  onDuplicate: (host: Host) => void;
  onDelete: (host: Host) => void;
}) {
  const { t } = useTranslation();
  const tools = hostActionsFor(useHostActions(), host);
  const name = host.name || host.ip;
  const editable = canOpenHostEditor(host);
  const interval = host.statusCheckInterval;

  return (
    <div className={cardClass}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={!editable}
          onClick={() => onEdit(host)}
          className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:underline disabled:cursor-default"
        >
          <span className="flex max-w-full items-center gap-1 text-sm font-medium">
            {host.pin && (
              <Pin
                aria-label={t("original.pinned")}
                className="size-3 shrink-0 text-yellow-500"
              />
            )}
            <span className="truncate">{name}</span>
          </span>
          <span className="max-w-full truncate text-xs text-muted-foreground">
            {host.ip}:{host.port}
          </span>
          {host.username && (
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {host.username}
            </span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {host.isShared && (
            <Users
              aria-label={t("original.manager.shared")}
              className="mr-1 size-3.5 text-muted-foreground"
            />
          )}
          <button
            type="button"
            title={t("original.manager.export")}
            aria-label={t("original.manager.export")}
            onClick={() => downloadJson(name, hostExport(host))}
            className={`${iconButton} text-blue-500`}
          >
            <Download className="size-3.5" />
          </button>
          <button
            type="button"
            title={t("original.manager.clone")}
            aria-label={t("original.manager.clone")}
            onClick={() => onDuplicate(host)}
            className={`${iconButton} text-emerald-500`}
          >
            <Copy className="size-3.5" />
          </button>
          {editable && (
            <button
              type="button"
              title={t("original.edit")}
              aria-label={t("original.edit")}
              onClick={() => onEdit(host)}
              className={iconButton}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {canDeleteHost(host) && (
            <button
              type="button"
              title={t("original.manager.delete")}
              aria-label={t("original.manager.delete")}
              onClick={() => onDelete(host)}
              className={`${iconButton} text-red-500`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1">
        {tools.slice(0, MAX_CARD_TOOLS).map((tool) => {
          const Icon = tool.icon as typeof Pencil;
          return (
            <span
              key={tool.id}
              className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border px-1.5 py-0.5 text-xs"
            >
              {Icon && <Icon className="size-3" />}
              {tool.label?.(host) ?? t(tool.titleKey)}
            </span>
          );
        })}
        {tools.length > MAX_CARD_TOOLS && (
          <span
            title={tools
              .slice(MAX_CARD_TOOLS)
              .map((tool) => tool.label?.(host) ?? t(tool.titleKey))
              .join(", ")}
            className="inline-flex items-center rounded-[0.375rem] border border-border px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            {t("original.manager.moreTools", {
              count: tools.length - MAX_CARD_TOOLS,
            })}
          </span>
        )}
        {host.statusCheckEnabled !== false && (
          <span className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border px-1.5 py-0.5 text-xs">
            <Activity className="size-3" />
            {interval
              ? t("original.manager.statusEvery", { seconds: interval })
              : t("original.manager.status")}
          </span>
        )}
        {(host.tags ?? []).map((tag) => (
          <span
            key={`tag-${tag}`}
            className="rounded-[0.375rem] bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The old Host Viewer: a search and the hosts as cards in folder sections. */
export function HostViewer({
  hosts,
  canAdd,
  onAdd,
  onEdit,
  onDuplicate,
  onDelete,
  onRefresh,
}: {
  hosts: Host[];
  canAdd: boolean;
  onAdd: () => void;
  onEdit: (host: Host) => void;
  onDuplicate: (host: Host) => void;
  onDelete: (host: Host) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const query = useMemo(() => parseHostQuery(search), [search]);
  const searching = !!search.trim();
  const shown = useMemo(
    () => (searching ? hosts.filter((h) => hostMatches(h, query)) : hosts),
    [hosts, query, searching],
  );
  const groups = useMemo(
    () =>
      groupByFolder(
        shown,
        (h) => h.folder,
        (h) => h.name || h.ip,
      ),
    [shown],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">
            {t("original.manager.sshHosts")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("original.manager.hostCount", { count: hosts.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className={`${wideButton} h-8 gap-1.5 px-3 text-sm`}
            >
              <Plus className="size-3.5" />
              {t("original.manager.addHost")}
            </button>
          )}
          <button
            type="button"
            onClick={onRefresh}
            className={`${outlineButton} h-8 gap-1.5 px-3 text-sm`}
          >
            <RefreshCw className="size-3.5" />
            {t("original.refresh")}
          </button>
        </div>
      </div>
      <div className="flex h-9 items-center gap-2 rounded-[0.5rem] border-2 border-border bg-[var(--original-field,var(--muted))] px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("original.manager.searchHosts")}
          aria-label={t("original.manager.searchHosts")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        {hosts.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("original.manager.noHosts")}
          </p>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("original.noMatches")}
          </p>
        ) : (
          <FolderSections
            groups={groups}
            storageKey="original-layout.managerHostFolders"
            keyOf={(h) => h.id}
            forceOpen={searching}
            renderCard={(host) => (
              <HostCard
                host={host}
                onEdit={onEdit}
                onDuplicate={onDuplicate}
                onDelete={onDelete}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
