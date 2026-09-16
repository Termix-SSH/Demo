import { useEffect, useMemo, useRef, useState } from "react";
import {
  CornerDownRight,
  KeyRound,
  LibraryBig,
  Plus,
  Puzzle,
  Search,
  Server,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Separator } from "@/components/separator";
import { EmptyState } from "@/components/empty-state";
import { GroupHeading, PANEL, Segmented } from "@/components/panel-layout";
import { FakeSwitch } from "@/components/section-card";
import {
  addDemoHost,
  getDemoHosts,
  subscribeDemoHosts,
  updateDemoHost,
} from "@/demo/demo-store";
import {
  addDemoCredential,
  getDemoCredentials,
  subscribeDemoCredentials,
  updateDemoCredential,
} from "@/demo/credential-store";
import {
  buildCredentialPatch,
  buildHostPatch,
  createCredentialEditorForm,
  createHostEditorForm,
  newCredentialFromForm,
  newHostFromForm,
  validateCredentialForm,
  validateHostForm,
  type CredentialEditorForm,
  type HostEditorForm,
} from "@/demo/hosts/host-form";
import {
  BAND_LABELS,
  HOST_SECTIONS,
  SectionNav,
  useScrollSpy,
  visibleSections,
  type SectionBand,
} from "@/demo/hosts/host-sections";
import { HostEditorBody } from "@/demo/hosts/HostEditorBody";
import {
  CREDENTIAL_SECTIONS,
  CredentialEditorBody,
} from "@/demo/hosts/CredentialEditorBody";
import {
  AvailablePluginsNote,
  usePluginHostSections,
} from "@/demo/hosts/host-plugin-sections";
import {
  takePendingEditorRequest,
  type EditorRequest,
} from "@/demo/hosts/host-editor-events";
import { useUiPreference } from "@/contexts/UiPreferencesContext";
import type { Credential, Host } from "@/types/ui-types";

/**
 * Hosts and credentials, edited at full width.
 *
 * Named "Manage" rather than after either one, since the surface owns both.
 *
 * The editor used to live in the left dock, which meant opening it widened the
 * dock to a hardcoded 560px, hid the list you were working in, and squeezed
 * ~120 fields into one column. This is the same full-window shape the settings
 * screen moved to for the same reason: a list on the left, the thing you picked
 * on the right, and a section nav rather than two rows of scrolling tabs.
 */

type Mode = "hosts" | "credentials";
type Editing =
  | { kind: "host"; host: Host | null }
  | { kind: "credential"; credential: Credential | null }
  | null;

export function HostWorkbench({
  onOpenPlugins,
}: {
  onOpenPlugins?: () => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>("hosts");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Editing>(null);

  const [hosts, setHosts] = useState<Host[]>(getDemoHosts);
  const [credentials, setCredentials] =
    useState<Credential[]>(getDemoCredentials);
  useEffect(() => subscribeDemoHosts(() => setHosts([...getDemoHosts()])), []);
  useEffect(
    () => subscribeDemoCredentials(() => setCredentials([...getDemoCredentials()])),
    [],
  );

  const [hostForm, setHostForm] = useState<HostEditorForm>(() =>
    createHostEditorForm(null),
  );
  const [credForm, setCredForm] = useState<CredentialEditorForm>(() =>
    createCredentialEditorForm(null),
  );

  // Starts from the preset, which already had a simple/full setting that
  // nothing read, and stays where the user puts it for this session.
  const presetMode = useUiPreference("hostEditor", "mode");
  const [advanced, setAdvanced] = useState(presetMode === "full");

  const openHost = (host: Host | null) => {
    setMode("hosts");
    setEditing({ kind: "host", host });
    setHostForm(createHostEditorForm(host));
  };
  const openCredential = (credential: Credential | null) => {
    setMode("credentials");
    setEditing({ kind: "credential", credential });
    setCredForm(createCredentialEditorForm(credential));
  };

  // The sidebar, the dashboard, the tree empty state and the command palette
  // all speak through one request, parked for us by host-editor-events. The
  // request that opened this tab was made before this component existed, so it
  // is claimed on mount rather than only listened for.
  useEffect(() => {
    const apply = (request: EditorRequest | null) => {
      if (!request) return;
      if (request.kind === "host") openHost(request.host);
      else if (request.kind === "credential") openCredential(request.credential);
      else {
        // Browsing: show the list for that side and clear any open editor.
        setMode(request.mode);
        setEditing(null);
      }
    };

    apply(takePendingEditorRequest());

    const onOpen = () => apply(takePendingEditorRequest());
    window.addEventListener("host-manager:open-editor", onOpen);
    return () =>
      window.removeEventListener("host-manager:open-editor", onOpen);
  }, []);

  const isHost = editing?.kind === "host";
  const editingHost = isHost ? editing.host : null;
  const editingCredential =
    editing?.kind === "credential" ? editing.credential : null;

  const hostErrors = useMemo(
    () => (isHost ? validateHostForm(hostForm) : {}),
    [isHost, hostForm],
  );
  const credErrors = useMemo(
    () => (editing?.kind === "credential" ? validateCredentialForm(credForm) : {}),
    [editing, credForm],
  );

  const { sections: pluginSections, available } = usePluginHostSections();

  function saveHost() {
    if (Object.keys(hostErrors).length > 0) return;
    if (editingHost) {
      updateDemoHost(editingHost.id, buildHostPatch(hostForm));
      toast.success(`Saved ${hostForm.name || hostForm.ip}`);
    } else {
      addDemoHost(newHostFromForm(hostForm));
      toast.success(`Added ${hostForm.name || hostForm.ip}`);
    }
    setEditing(null);
  }

  function saveCredential() {
    if (Object.keys(credErrors).length > 0) return;
    if (editingCredential) {
      updateDemoCredential(editingCredential.id, buildCredentialPatch(credForm));
      toast.success(`Saved ${credForm.name}`);
    } else {
      addDemoCredential(newCredentialFromForm(credForm));
      toast.success(`Added ${credForm.name}`);
    }
    setEditing(null);
  }

  const title = editing
    ? isHost
      ? editingHost
        ? editingHost.name || editingHost.ip
        : "New host"
      : editingCredential
        ? editingCredential.name
        : "New credential"
    : mode === "hosts"
      ? `${hosts.length} hosts`
      : `${credentials.length} credentials`;

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header
        className={`flex ${PANEL.header} shrink-0 flex-row items-center border-b border-border`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <LibraryBig className="size-4 shrink-0 text-accent-brand" />
          <span className="truncate text-base font-bold tracking-tight">
            {t("nav.manage")}
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {title}
          </span>
        </div>

        {editing && (
          <div className="flex shrink-0 items-center gap-2 px-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Advanced
            </span>
            <FakeSwitch checked={advanced} onChange={setAdvanced} />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <ObjectList
          editing={!!editing}
          mode={mode}
          onMode={(next) => {
            setMode(next);
            setEditing(null);
          }}
          query={query}
          onQuery={setQuery}
          hosts={hosts}
          credentials={credentials}
          selectedId={
            editingHost?.id ?? editingCredential?.id ?? null
          }
          onPickHost={openHost}
          onPickCredential={openCredential}
        />

        {editing ? (
          <EditorPane
            key={
              (isHost ? "h:" : "c:") +
              (editingHost?.id ?? editingCredential?.id ?? "new")
            }
            isHost={isHost}
            advanced={advanced}
            hostForm={hostForm}
            credForm={credForm}
            hostErrors={hostErrors}
            credErrors={credErrors}
            setHostField={(key, value) =>
              setHostForm((prev) => ({ ...prev, [key]: value }))
            }
            setCredField={(key, value) =>
              setCredForm((prev) => ({ ...prev, [key]: value }))
            }
            hosts={hosts}
            credentials={credentials}
            editingId={editingHost?.id ?? null}
            pluginSections={pluginSections}
            available={available}
            onOpenPlugins={onOpenPlugins}
            isNew={isHost ? !editingHost : !editingCredential}
            onCancel={() => setEditing(null)}
            onSave={isHost ? saveHost : saveCredential}
          />
        ) : (
          <div className="hidden min-h-0 flex-1 items-center justify-center md:flex">
            <EmptyState
              icon={mode === "hosts" ? Server : KeyRound}
              title={
                mode === "hosts"
                  ? "Pick a host to edit"
                  : "Pick a credential to edit"
              }
              hint="Everything about a connection lives here, grouped so you can find it."
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    mode === "hosts" ? openHost(null) : openCredential(null)
                  }
                >
                  <Plus className="mr-1 size-3" />
                  {mode === "hosts" ? "Add host" : "Add credential"}
                </Button>
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}

/** The list column: what to edit, grouped by folder and nested by parent. */
function ObjectList({
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

  const groups = useMemo(() => {
    type Row = { id: string; label: string; note?: string; depth: number };
    const byFolder = new Map<string, Row[]>();
    const push = (folder: string, row: Row) => {
      const key = folder || "Ungrouped";
      const list = byFolder.get(key);
      if (list) list.push(row);
      else byFolder.set(key, [row]);
    };

    if (mode === "hosts") {
      const matches = (host: Host) =>
        !needle ||
        `${host.name || host.ip} ${host.ip}`.toLowerCase().includes(needle);

      // Sub-hosts sit under their parent rather than beside it, the same
      // nesting the sidebar tree draws from parentHostId. Grouping by folder
      // alone flattened them into siblings.
      const childrenOf = new Map<string, Host[]>();
      for (const host of hosts) {
        if (!host.parentHostId) continue;
        const list = childrenOf.get(host.parentHostId);
        if (list) list.push(host);
        else childrenOf.set(host.parentHostId, [host]);
      }

      const addRow = (host: Host, folder: string, depth: number) => {
        push(folder, {
          id: host.id,
          label: host.name || host.ip,
          note: host.ip,
          depth,
        });
        for (const child of childrenOf.get(host.id) ?? [])
          addRow(child, folder, depth + 1);
      };

      const byId = new Map(hosts.map((h) => [h.id, h]));
      for (const host of hosts) {
        // A child whose parent is missing falls back to a root row, so a
        // stale parentHostId never hides a host entirely.
        if (host.parentHostId && byId.has(host.parentHostId)) continue;

        // Keep a parent visible when a child matches, or the match would have
        // nowhere to hang.
        const kept = [host, ...(childrenOf.get(host.id) ?? [])].some(matches);
        if (!kept) continue;
        addRow(host, host.folder, 0);
      }
    } else {
      for (const cred of credentials) {
        if (
          needle &&
          !`${cred.name} ${cred.username}`.toLowerCase().includes(needle)
        )
          continue;
        push(cred.folder ?? "", {
          id: cred.id,
          label: cred.name,
          note: cred.username,
          depth: 0,
        });
      }
    }
    return [...byFolder.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [mode, hosts, credentials, needle]);

  const empty = groups.length === 0;

  // Three columns do not fit on a phone. While you are editing something
  // the list steps aside and the editor takes the screen; the editor's
  // Cancel brings the list back.
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

      <div className="min-h-0 flex-1 overflow-y-auto py-2">
        {empty ? (
          <EmptyState
            icon={mode === "hosts" ? Server : KeyRound}
            title={needle ? "Nothing matches" : "Nothing here yet"}
          />
        ) : (
          groups.map(([folder, rows]) => (
            <div key={folder} className="mb-2 flex flex-col">
              <GroupHeading
                title={folder}
                count={rows.length}
                className="px-2.5 pb-1.5"
              />
              {rows.map((row) => {
                const on = row.id === selectedId;
                return (
                  <button
                    key={row.id}
                    onClick={() =>
                      mode === "hosts"
                        ? onPickHost(hosts.find((h) => h.id === row.id) ?? null)
                        : onPickCredential(
                            credentials.find((c) => c.id === row.id) ?? null,
                          )
                    }
                    style={{ paddingLeft: 8 + row.depth * 14 }}
                    className={`flex w-full items-center gap-2 border-l-2 py-1.5 pr-2 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring ${
                      on
                        ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {row.depth > 0 && (
                      <CornerDownRight
                        aria-hidden
                        className="size-3 shrink-0 opacity-40"
                      />
                    )}
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">
                      {row.label}
                    </span>
                    {row.note && (
                      <span className="shrink-0 truncate font-mono text-[10px] opacity-60">
                        {row.note}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/** The editor column: section nav beside one scrolling form. */
function EditorPane({
  isHost,
  advanced,
  hostForm,
  credForm,
  hostErrors,
  credErrors,
  setHostField,
  setCredField,
  hosts,
  credentials,
  editingId,
  pluginSections,
  available,
  onOpenPlugins,
  isNew,
  onCancel,
  onSave,
}: {
  isHost: boolean;
  advanced: boolean;
  hostForm: HostEditorForm;
  credForm: CredentialEditorForm;
  hostErrors: Record<string, string | undefined>;
  credErrors: Record<string, string | undefined>;
  setHostField: <K extends keyof HostEditorForm>(
    key: K,
    value: HostEditorForm[K],
  ) => void;
  setCredField: <K extends keyof CredentialEditorForm>(
    key: K,
    value: CredentialEditorForm[K],
  ) => void;
  hosts: Host[];
  credentials: Credential[];
  editingId: string | null;
  pluginSections: ReturnType<typeof usePluginHostSections>["sections"];
  available: ReturnType<typeof usePluginHostSections>["available"];
  onOpenPlugins?: () => void;
  isNew: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => (isHost ? visibleSections(HOST_SECTIONS, hostForm, advanced) : []),
    [isHost, hostForm, advanced],
  );

  const bands = useMemo(() => {
    if (!isHost) {
      return [
        {
          band: "basics" as SectionBand,
          items: CREDENTIAL_SECTIONS,
        },
      ];
    }
    const order: SectionBand[] = [
      "basics",
      "session",
      "network",
      "protocols",
      "plugins",
    ];
    const grouped = order
      .map((band) => ({
        band,
        items: shown
          .filter((section) => section.band === band)
          .map((section) => ({
            id: section.id,
            label: section.label,
            icon: section.icon,
          })),
      }))
      .filter((group) => group.items.length > 0);

    if (pluginSections.length > 0) {
      grouped.push({
        band: "plugins",
        items: pluginSections.map((section) => ({
          id: `plugin:${section.pluginId}`,
          label: section.label,
          icon: section.icon,
        })),
      });
    }
    return grouped;
  }, [isHost, shown, pluginSections]);

  const ids = useMemo(
    () => bands.flatMap((band) => band.items.map((item) => item.id)),
    [bands],
  );
  const { active, scrollTo } = useScrollSpy(scrollRef, ids);

  const errors = isHost ? hostErrors : credErrors;
  const errorCount = Object.keys(errors).length;

  // A problem inside a section you cannot see would be invisible, so the nav
  // marks which section holds it.
  const errorSections = useMemo(() => {
    const map: Record<string, string> = {
      ip: "identity",
      protocols: "identity",
      username: "access",
      sshPort: "ports",
      rdpPort: "ports",
      vncPort: "ports",
      telnetPort: "ports",
      name: "credential-identity",
      password: "credential-secret",
      value: "credential-secret",
    };
    return new Set(
      Object.keys(errors)
        .map((key) => map[key])
        .filter(Boolean),
    );
  }, [errors]);

  const folderPaths = useMemo(
    () =>
      [
        ...new Set(
          credentials.map((c) => c.folder).filter((f): f is string => !!f),
        ),
      ].sort(),
    [credentials],
  );

  return (
    <div className="flex min-h-0 flex-1">
      <SectionNav
        bands={bands}
        active={active}
        errorSections={errorSections}
        onSelect={scrollTo}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollRef}
          className={`min-h-0 flex-1 overflow-y-auto ${PANEL.body}`}
        >
          <div className={`mx-auto flex max-w-3xl flex-col ${PANEL.gap}`}>
            {isHost ? (
              <>
                <HostEditorBody
                  form={hostForm}
                  setField={setHostField}
                  errors={hostErrors}
                  sectionIds={new Set(shown.map((s) => s.id))}
                  hosts={hosts}
                  credentials={credentials}
                  editingId={editingId}
                  pluginSections={pluginSections}
                />
                <AvailablePluginsNote
                  available={available}
                  onOpenPlugins={() => onOpenPlugins?.()}
                />
                {!advanced && (
                  <button
                    type="button"
                    onClick={() => scrollTo(ids[0] ?? "")}
                    className="flex items-center gap-2 px-1 text-[10px] text-muted-foreground"
                  >
                    <SlidersHorizontal className="size-3" />
                    More settings live under Advanced, in the header.
                  </button>
                )}
              </>
            ) : (
              <CredentialEditorBody
                form={credForm}
                setField={setCredField}
                errors={credErrors}
                folderPaths={folderPaths}
              />
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 border-t border-border px-3 py-2">
          {errorCount > 0 && (
            <span className="text-[10px] text-destructive">
              {errorCount === 1
                ? "One thing needs attention."
                : `${errorCount} things need attention.`}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={errorCount > 0}
              onClick={onSave}
              className="border-accent-brand/40 px-6 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
            >
              {isNew ? "Add" : "Save"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const WORKBENCH_PLUGIN_ICON = Puzzle;
export const WORKBENCH_BANDS = BAND_LABELS;
