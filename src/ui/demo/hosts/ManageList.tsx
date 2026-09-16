import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Folder,
  FolderOpen,
  KeyRound,
  Plus,
  Search,
  Server,
} from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { EmptyState } from "@/components/empty-state";
import { Segmented } from "@/components/panel-layout";
import {
  allFolderPaths,
  allParentIds,
  buildCredentialManageTree,
  buildHostManageTree,
  flattenTree,
  type ManageRow,
} from "@/demo/hosts/manage-tree";
import type { Credential, Host } from "@/types/ui-types";

type Mode = "hosts" | "credentials";

/**
 * The list column of the manage tab.
 *
 * It draws the same tree the sidebar does rather than a flat set of folder
 * buckets: nested folder paths nest, sub-hosts sit under the host they belong
 * to, and both collapse. Rows carry a status dot and an indent guide so depth
 * stays readable once a tree gets deep.
 */
export function ManageList({
  editing,
  mode,
  onMode,
  query,
  onQuery,
  hosts,
  credentials,
  selectedId,
  onPickHost,
  onPickCredential,
}: {
  editing: boolean;
  mode: Mode;
  onMode: (mode: Mode) => void;
  query: string;
  onQuery: (value: string) => void;
  hosts: Host[];
  credentials: Credential[];
  selectedId: string | null;
  onPickHost: (host: Host | null) => void;
  onPickCredential: (credential: Credential | null) => void;
}) {
  const needle = query.trim().toLowerCase();

  const tree = useMemo(
    () =>
      mode === "hosts"
        ? buildHostManageTree(hosts)
        : buildCredentialManageTree(credentials),
    [mode, hosts, credentials],
  );

  // Everything starts open, which is what you want on a list you came here to
  // edit. Closing something is remembered while the tab stays mounted.
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => {
    setOpen(new Set([...allFolderPaths(tree), ...allParentIds(tree)]));
    // Rebuilt only when the side changes, so toggles survive a host edit.
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const rows = useMemo(
    () => flattenTree(tree, open, needle),
    [tree, open, needle],
  );

  const pick = (id: string) => {
    if (mode === "hosts") onPickHost(hosts.find((h) => h.id === id) ?? null);
    else onPickCredential(credentials.find((c) => c.id === id) ?? null);
  };

  // Three columns do not fit on a phone. While you are editing something the
  // list steps aside and the editor takes the screen; Cancel brings it back.
  return (
    <div
      className={`${editing ? "hidden md:flex" : "flex"} w-full shrink-0 flex-col border-r border-border md:w-72`}
    >
      <div className="flex flex-col gap-2 border-b border-border px-2.5 py-2">
        <Segmented
          value={mode}
          onChange={onMode}
          options={[
            { value: "hosts", label: "Hosts", count: hosts.length },
            {
              value: "credentials",
              label: "Credentials",
              count: credentials.length,
            },
          ]}
          className="w-full [&>button]:flex-1"
        />
        <div className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => onQuery(e.target.value)}
              placeholder="Search"
              className="h-8 pl-8 text-xs"
            />
          </div>
          <Button
            variant="outline"
            size="icon"
            title={mode === "hosts" ? "Add host" : "Add credential"}
            onClick={() =>
              mode === "hosts" ? onPickHost(null) : onPickCredential(null)
            }
            className="shrink-0 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
          >
            <Plus className="size-3.5" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {rows.length === 0 ? (
          <EmptyState
            icon={mode === "hosts" ? Server : KeyRound}
            title={needle ? "Nothing matches" : "Nothing here yet"}
            hint={
              needle
                ? undefined
                : mode === "hosts"
                  ? "Add a host and it shows up here, in whatever folder you give it."
                  : "Credentials you save can be reused by any host."
            }
          />
        ) : (
          rows.map((row) =>
            row.kind === "folder" ? (
              <FolderRow
                key={`f:${row.folder.path}`}
                row={row}
                showOnline={mode === "hosts"}
                open={!!needle || open.has(row.folder.path)}
                locked={!!needle}
                onToggle={() => toggle(row.folder.path)}
              />
            ) : (
              <ItemRow
                key={`i:${row.item.id}`}
                row={row}
                mode={mode}
                selected={row.item.id === selectedId}
                open={!!needle || open.has(row.item.id)}
                locked={!!needle}
                onToggle={() => toggle(row.item.id)}
                onPick={() => pick(row.item.id)}
              />
            ),
          )
        )}
      </div>
    </div>
  );
}

/** Left padding for a row at this depth, leaving room for the chevron. */
function indent(depth: number) {
  return 6 + depth * 13;
}

/**
 * Vertical rules marking each open ancestor, so a row four levels down still
 * reads as belonging to something.
 */
function Guides({ depth }: { depth: number }) {
  if (depth === 0) return null;
  return (
    <>
      {Array.from({ length: depth }, (_, i) => (
        <span
          key={i}
          aria-hidden
          className="absolute inset-y-0 w-px bg-border"
          style={{ left: indent(i) + 7 }}
        />
      ))}
    </>
  );
}

function FolderRow({
  row,
  open,
  locked,
  showOnline,
  onToggle,
}: {
  row: Extract<ManageRow, { kind: "folder" }>;
  open: boolean;
  /** Search forces folders open, so the chevron stops responding. */
  locked: boolean;
  showOnline: boolean;
  onToggle: () => void;
}) {
  const Icon = open ? FolderOpen : Folder;
  return (
    <div className="relative">
      <Guides depth={row.depth} />
      <button
        type="button"
        onClick={locked ? undefined : onToggle}
        style={{ paddingLeft: indent(row.depth) }}
        className="group flex w-full items-center gap-1.5 py-1.5 pr-2.5 text-left transition-colors hover:bg-muted focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring"
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="size-3 shrink-0 text-muted-foreground" />
        )}
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {row.folder.name}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/60">
          {showOnline ? `${row.online}/${row.count}` : row.count}
        </span>
      </button>
    </div>
  );
}

function ItemRow({
  row,
  mode,
  selected,
  open,
  locked,
  onToggle,
  onPick,
}: {
  row: Extract<ManageRow, { kind: "item" }>;
  mode: Mode;
  selected: boolean;
  open: boolean;
  locked: boolean;
  onToggle: () => void;
  onPick: () => void;
}) {
  const nests = row.item.children.length > 0;
  const Icon = mode === "hosts" ? Server : KeyRound;

  return (
    <div className="relative">
      <Guides depth={row.depth} />
      <div
        className={`flex items-center border-l-2 transition-colors ${
          selected
            ? "border-accent-brand bg-accent-brand/10"
            : "border-transparent hover:bg-muted"
        }`}
      >
        {/* The chevron is its own control so clicking a parent host still
            opens it for editing rather than only folding its children. */}
        <div
          className="flex shrink-0 items-center justify-center"
          style={{ paddingLeft: indent(row.depth) }}
        >
          {nests ? (
            <button
              type="button"
              onClick={locked ? undefined : onToggle}
              title={open ? "Collapse" : "Expand"}
              className="flex size-4 items-center justify-center text-muted-foreground hover:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring"
            >
              {open ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
            </button>
          ) : (
            <span aria-hidden className="size-4" />
          )}
        </div>

        <button
          type="button"
          onClick={onPick}
          className={`flex min-w-0 flex-1 items-center gap-2 py-1.5 pl-1 pr-2.5 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring ${
            selected ? "text-accent-brand" : "text-foreground"
          }`}
        >
          <Icon
            className={`size-3.5 shrink-0 ${selected ? "" : "text-muted-foreground"}`}
          />
          <span className="min-w-0 flex-1 truncate text-xs font-medium">
            {row.item.name}
          </span>
          <span className="shrink-0 truncate font-mono text-[10px] text-muted-foreground">
            {row.item.note}
          </span>
          {mode === "hosts" && (
            <span
              aria-hidden
              title={row.item.online ? "Online" : "Offline"}
              className={`size-1.5 shrink-0 rounded-full ${
                row.item.online ? "bg-emerald-500" : "bg-muted-foreground/30"
              }`}
            />
          )}
        </button>
      </div>
    </div>
  );
}
