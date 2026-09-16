import { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyRound,
  LibraryBig,
  Plus,
  Puzzle,
  Server,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { EmptyState } from "@/components/empty-state";
import { PANEL } from "@/components/panel-layout";
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
import { ManageList } from "@/demo/hosts/ManageList";
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
        <ManageList
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
