import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  EmptyState,
  FakeSwitch,
  useConfirm,
  useUiPreference,
  usePermissions,
  useServerStatus,
  deleteCredential,
  deleteSSHHost,
  getCredentialDetails,
  getCredentials,
  getSSHHosts,
  type SSHHostWithStatus,
  getFolderDefaultsId,
  invalidateHostsAndStatusCaches,
  registerTabCloseGuard,
  mapCredentials,
  sshHostToHost,
  hostProtocolFlags,
  type HostProtocols,
  type Credential,
  type Host,
  MANAGE_REQUEST_EVENT,
  takePendingManageRequest,
  type ManageMode,
  type ManageRequest,
  cn,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Server, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { HostDraft } from "@termix-ssh/plugin-sdk/frontend";
import { HostEditor } from "../sidebar/HostEditor";
import { CredentialEditorView } from "../sidebar/CredentialEditorView";
import {
  HostDefaultsEditorView,
  hostDefaultsTitle,
  type HostDefaultsEditorTarget,
} from "../sidebar/host-defaults/HostDefaultsEditorView";
import { canDeleteHost } from "../sidebar/host-permissions";
import { useHostPolicy } from "../sidebar/use-host-policy";
import { ManageList } from "./ManageList";
import { duplicateHost } from "../sidebar/duplicate-host";
import { ManagerTabs, type ManagerView } from "../original/manager/ManagerTabs";
import { HostViewer } from "../original/manager/HostViewer";
import { CredentialViewer } from "../original/manager/CredentialViewer";
import type { DefaultsRow } from "./defaults-rows";

type Editing =
  | {
      kind: "host";
      host: Host | null;
      draft?: HostDraft;
      key: number;
      protocols: HostProtocols;
    }
  | { kind: "credential"; credential: Credential | null; key: number }
  | { kind: "defaults"; target: HostDefaultsEditorTarget; rowKey: string };

const TAB_ID = "host-manager";

/** Fetches a credential with its secrets marked as stored, for the editor. */
async function loadCredentialForEdit(cred: Credential): Promise<Credential> {
  try {
    const full = (await getCredentialDetails(Number(cred.id))) as {
      hasKey?: boolean;
      hasKeyPassword?: boolean;
      password?: string;
      certPublicKey?: string;
    };
    return {
      ...cred,
      value: full.hasKey ? "existing_key" : (full.password ?? ""),
      password: full.password ?? "",
      passphrase: full.hasKeyPassword ? "existing_key_password" : "",
      publicKey: full.certPublicKey ?? cred.publicKey,
    };
  } catch {
    return cred;
  }
}

/** Below this the list and the editor take turns instead of sharing the tab. */
const SPLIT_MIN_WIDTH = 760;

/**
 * Hosts, credentials and host defaults, edited at full width: a list on the
 * left, the thing you picked on the right.
 */
export function ManageTab() {
  const { t } = useTranslation();
  const hostPolicy = useHostPolicy();
  // Read through a ref so openHost keeps its identity for the effects using it.
  const hostPolicyRef = useRef(hostPolicy);
  hostPolicyRef.current = hostPolicy;
  const confirm = useConfirm();
  const { has } = usePermissions();
  const { statuses } = useServerStatus();
  const presetMode = useUiPreference("hostEditor", "mode");

  const [mode, setMode] = useState<ManageMode>("hosts");
  // List and editor side by side only when the tab itself is wide enough.
  // The viewport says nothing when the sidebar or split view takes space.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(true);
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSplit(entry.contentRect.width >= SPLIT_MIN_WIDTH);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [hosts, setHosts] = useState<Host[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [dirty, setDirty] = useState(false);
  // A new host opens as the user's add host form setting says, an existing
  // one with every option. The switch in the header changes it for this host.
  const [advanced, setAdvanced] = useState(presetMode !== "simple");
  const editingHostKey =
    editing?.kind === "host"
      ? `${editing.host?.id ?? "new"}:${editing.key}`
      : "";
  useEffect(() => {
    if (!editingHostKey) return;
    setAdvanced(presetMode !== "simple" || !editingHostKey.startsWith("new:"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingHostKey]);
  // The host a credential was opened from, so Back returns to it.
  const [returnHost, setReturnHost] = useState<Host | "new" | null>(null);

  const hostsRef = useRef(hosts);
  hostsRef.current = hosts;
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const reloadHosts = useCallback(() => {
    return getSSHHosts()
      .then((raw) => {
        const list = raw.map(sshHostToHost);
        hostsRef.current = list;
        setHosts(list);
      })
      .catch(() => {});
  }, []);
  const reloadCredentials = useCallback(() => {
    return getCredentials()
      .then((res) => {
        const list = mapCredentials(res);
        credentialsRef.current = list;
        setCredentials(list);
      })
      .catch(() => {});
  }, []);

  const loaded = useRef<Promise<unknown>>(Promise.resolve());

  useEffect(() => {
    loaded.current = Promise.all([reloadHosts(), reloadCredentials()]);
  }, [reloadHosts, reloadCredentials]);

  useEffect(() => {
    window.addEventListener("termix:hosts-changed", reloadHosts);
    window.addEventListener("ssh-hosts:changed", reloadHosts);
    window.addEventListener("hosts:refresh", reloadHosts);
    window.addEventListener("termix:credentials-changed", reloadCredentials);
    return () => {
      window.removeEventListener("termix:hosts-changed", reloadHosts);
      window.removeEventListener("ssh-hosts:changed", reloadHosts);
      window.removeEventListener("hosts:refresh", reloadHosts);
      window.removeEventListener(
        "termix:credentials-changed",
        reloadCredentials,
      );
    };
  }, [reloadHosts, reloadCredentials]);

  /** Asks before throwing away unsaved changes. True means go ahead. */
  const confirmDiscard = useCallback(async () => {
    if (!dirtyRef.current) return true;
    return confirm({
      title: t("common.unsavedChanges"),
      description: t("hosts.unsavedChangesDescription"),
      confirmLabel: t("hosts.discardChanges"),
      cancelLabel: t("hosts.keepEditing"),
    });
  }, [confirm, t]);

  useEffect(
    () => registerTabCloseGuard(TAB_ID, confirmDiscard),
    [confirmDiscard],
  );

  // Bumped on every open, so a slow load never replaces a newer pick.
  const openSeq = useRef(0);

  const openHost = useCallback(
    (host: Host | null, draft?: HostDraft) => {
      const policy = hostPolicyRef.current;
      if (!host && !policy.manualCreate) {
        toast.error(t("hosts.addBlocked", { plugin: policy.blockedBy ?? "" }));
        return;
      }
      openSeq.current++;
      setMode("hosts");
      setReturnHost(null);
      setDirty(false);
      setEditing({
        kind: "host",
        host,
        draft,
        key: Date.now(),
        protocols: hostProtocolFlags(host),
      });
    },
    [t],
  );

  const openCredential = useCallback(async (credential: Credential | null) => {
    const seq = ++openSeq.current;
    setMode("credentials");
    setDirty(false);
    const full = credential ? await loadCredentialForEdit(credential) : null;
    if (seq !== openSeq.current) return;
    setEditing({ kind: "credential", credential: full, key: Date.now() });
  }, []);

  const openDefaults = useCallback(
    async (row: Pick<DefaultsRow, "level" | "folderName">) => {
      const seq = ++openSeq.current;
      setMode("defaults");
      setReturnHost(null);
      setDirty(false);
      const rowKey =
        row.level === "folder" ? `folder:${row.folderName}` : row.level;
      if (row.level === "folder" && row.folderName) {
        try {
          const folderId = await getFolderDefaultsId(row.folderName);
          if (seq !== openSeq.current) return;
          setEditing({
            kind: "defaults",
            rowKey,
            target: { level: "folder", folderId, folderName: row.folderName },
          });
        } catch {
          toast.error(t("hostDefaults.loadFailed"));
        }
        return;
      }
      setEditing({ kind: "defaults", rowKey, target: { level: row.level } });
    },
    [t],
  );

  const apply = useCallback(
    async (request: ManageRequest | null) => {
      if (!request) return;
      if (!(await confirmDiscard())) return;
      // A new host or credential needs no list, so it opens right away.
      const needsList =
        (request.kind === "host" && !!request.hostId) ||
        (request.kind === "credential" && !!request.credentialId);
      if (needsList) await loaded.current;
      if (request.kind === "host") {
        const find = () =>
          hostsRef.current.find((h) => h.id === request.hostId) ?? null;
        let host = request.hostId ? find() : null;
        // Our list can lag the sidebar's, so refetch once before giving up.
        if (request.hostId && !host) {
          invalidateHostsAndStatusCaches();
          await reloadHosts();
          host = find();
          if (!host) {
            toast.error(t("manage.hostNotFound"));
            return;
          }
        }
        openHost(host, request.draft);
      } else if (request.kind === "credential") {
        const find = () =>
          credentialsRef.current.find(
            (c) => String(c.id) === String(request.credentialId),
          ) ?? null;
        let credential = request.credentialId ? find() : null;
        if (request.credentialId && !credential) {
          await reloadCredentials();
          credential = find();
        }
        void openCredential(credential);
      } else if (request.kind === "defaults") {
        void openDefaults(request);
      } else {
        openSeq.current++;
        setDirty(false);
        setEditing(null);
        setMode(request.mode);
      }
    },
    [
      confirmDiscard,
      openHost,
      openCredential,
      openDefaults,
      reloadHosts,
      reloadCredentials,
      t,
    ],
  );

  // The request that opened this tab was parked before it mounted.
  useEffect(() => {
    void apply(takePendingManageRequest());
    const onRequest = () => void apply(takePendingManageRequest());
    window.addEventListener(MANAGE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(MANAGE_REQUEST_EVENT, onRequest);
  }, [apply]);

  const guarded =
    <A extends unknown[]>(fn: (...args: A) => void) =>
    async (...args: A) => {
      if (await confirmDiscard()) fn(...args);
    };

  const close = () => {
    openSeq.current++;
    setDirty(false);
    setEditing(null);
  };

  const backFromCredential = () => {
    if (returnHost) {
      const host = returnHost;
      setReturnHost(null);
      openHost(host === "new" ? null : host);
      return;
    }
    close();
  };

  const editCredentialFromHost = async (credentialId: string) => {
    const cred = credentials.find((c) => String(c.id) === String(credentialId));
    if (!cred || editing?.kind !== "host") return;
    if (!(await confirmDiscard())) return;
    setReturnHost(editing.host ?? "new");
    await openCredential(cred);
  };

  const deleteHost = async (host: Host) => {
    const ok = await confirm({
      title: t("hosts.deleteHostConfirm", { name: host.name || host.ip }),
      description: t("manage.cannotBeUndone"),
    });
    if (!ok) return;
    try {
      await deleteSSHHost(Number(host.id));
      setHosts((prev) => prev.filter((h) => h.id !== host.id));
      window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
      toast.success(t("hosts.deletedCount", { count: 1 }));
      if (editing?.kind === "host" && editing.host?.id === host.id) close();
    } catch {
      toast.error(t("hosts.failedToDeleteCount", { count: 1 }));
    }
  };

  const deleteCredentialItem = async (cred: Credential) => {
    const ok = await confirm({
      title: t("credentials.deleteCredentialConfirm", { name: cred.name }),
      description: t("manage.cannotBeUndone"),
    });
    if (!ok) return;
    try {
      await deleteCredential(Number(cred.id));
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(t("credentials.deletedCredential", { name: cred.name }));
      if (editing?.kind === "credential" && editing.credential?.id === cred.id)
        close();
    } catch {
      toast.error(t("credentials.failedToDeleteCredential"));
    }
  };

  const deleteCurrent = async () => {
    if (editing?.kind === "host" && editing.host) {
      await deleteHost(editing.host);
    } else if (editing?.kind === "credential" && editing.credential) {
      await deleteCredentialItem(editing.credential);
    }
  };

  const cloneHost = async (host: Host) => {
    try {
      await duplicateHost(host, t);
      await reloadHosts();
      window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
      toast.success(t("hosts.duplicatedHost", { name: host.name }));
    } catch {
      toast.error(t("hosts.failedToDuplicateHost"));
    }
  };

  const isOnline = useCallback(
    (host: Host) => statuses.get(Number(host.id))?.status === "online",
    [statuses],
  );

  const existingFolders = useMemo(
    () =>
      [
        ...new Set(
          credentials.map((c) => c.folder).filter((f): f is string => !!f),
        ),
      ].sort(),
    [credentials],
  );

  const selectedKey = !editing
    ? null
    : editing.kind === "host"
      ? editing.host
        ? `h:${editing.host.id}`
        : null
      : editing.kind === "credential"
        ? editing.credential
          ? `c:${editing.credential.id}`
          : null
        : editing.rowKey;

  const canDelete =
    (editing?.kind === "host" &&
      !!editing.host &&
      canDeleteHost(editing.host)) ||
    (editing?.kind === "credential" && !!editing.credential);

  const renderEditor = () => {
    if (!editing) return null;
    if (editing.kind === "defaults") {
      return (
        <HostDefaultsEditorView
          key={editing.rowKey}
          target={editing.target}
          onClose={guarded(close)}
          onDirtyChange={setDirty}
          hosts={hosts}
          credentials={credentials}
        />
      );
    }
    if (editing.kind === "credential") {
      return (
        <CredentialEditorView
          key={`c:${editing.credential?.id ?? "new"}:${editing.key}`}
          credential={editing.credential}
          existingFolders={existingFolders}
          saveAsNewHost={returnHost ?? undefined}
          onBack={backFromCredential}
          onSave={(saved, options) => {
            const id = String((saved as { id: number | string }).id);
            void reloadCredentials();
            if (options?.assignToHost && returnHost) {
              const host = returnHost;
              setReturnHost(null);
              setDirty(false);
              setMode("hosts");
              const next =
                host === "new" ? null : { ...host, credentialId: id };
              setEditing({
                kind: "host",
                host: next,
                key: Date.now(),
                protocols: hostProtocolFlags(next),
              });
              return;
            }
            if (returnHost) {
              backFromCredential();
              return;
            }
            close();
          }}
        />
      );
    }
    return (
      <HostEditor
        key={`h:${editing.host?.id ?? "new"}:${editing.key}`}
        host={editing.host}
        draft={editing.host ? undefined : editing.draft}
        advanced={advanced}
        onShowAll={() => setAdvanced(true)}
        onBack={guarded(close)}
        onSave={(saved) => {
          const updated = sshHostToHost(saved as unknown as SSHHostWithStatus);
          setHosts((prev) => {
            const idx = prev.findIndex((h) => h.id === updated.id);
            if (idx < 0) return [...prev, updated];
            const next = [...prev];
            next[idx] = updated;
            return next;
          });
          window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
          close();
        }}
        protocols={editing.protocols}
        onProtocolChange={(p) =>
          setEditing((current) =>
            current?.kind === "host"
              ? { ...current, protocols: { ...current.protocols, ...p } }
              : current,
          )
        }
        onDirtyChange={setDirty}
        hosts={hosts}
        credentials={credentials}
        onEditCredential={(id) => void editCredentialFromHost(id)}
      />
    );
  };

  const view: ManagerView =
    editing?.kind === "host"
      ? "host-editor"
      : editing?.kind === "credential"
        ? "credential-editor"
        : mode === "defaults" || editing?.kind === "defaults"
          ? "defaults"
          : mode === "credentials"
            ? "credentials"
            : "hosts";

  const pick = (next: ManagerView) => {
    if (next === view) return;
    void guarded(() => {
      if (next === "host-editor") openHost(null);
      else if (next === "credential-editor") void openCredential(null);
      else {
        close();
        setMode(next);
      }
    })();
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background text-foreground">
      <div className="flex flex-wrap items-center gap-2 px-3 pt-3">
        <ManagerTabs
          view={view}
          editingHost={editing?.kind === "host" && !!editing.host}
          editingCredential={
            editing?.kind === "credential" && !!editing.credential
          }
          canAddHost={hostPolicy.manualCreate}
          onPick={pick}
        />
        <div className="ml-auto flex items-center gap-2">
          {editing?.kind === "host" && (
            <label className="flex items-center gap-2 px-1">
              <span className="text-xs text-muted-foreground">
                {t("manage.advanced")}
              </span>
              <FakeSwitch checked={advanced} onChange={setAdvanced} />
            </label>
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              title={t("common.delete")}
              aria-label={t("common.delete")}
              onClick={() => void deleteCurrent()}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      <div className="mx-3 mt-3 h-0.5 shrink-0 bg-border" />

      {view === "hosts" && (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <HostViewer
            hosts={hosts}
            canAdd={hostPolicy.manualCreate}
            onAdd={() => openHost(null)}
            onEdit={(host) => openHost(host)}
            onDuplicate={(host) => void cloneHost(host)}
            onDelete={(host) => void deleteHost(host)}
            onRefresh={() => {
              invalidateHostsAndStatusCaches();
              void reloadHosts();
            }}
          />
        </div>
      )}

      {view === "credentials" && (
        <div className="flex min-h-0 flex-1 flex-col p-3">
          <CredentialViewer
            credentials={credentials}
            onAdd={() => void openCredential(null)}
            onEdit={(cred) => void openCredential(cred)}
            onDelete={(cred) => void deleteCredentialItem(cred)}
            onRefresh={() => void reloadCredentials()}
          />
        </div>
      )}

      {(view === "host-editor" || view === "credential-editor") && (
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {renderEditor()}
        </div>
      )}

      {view === "defaults" && (
        <div ref={bodyRef} className="flex min-h-0 flex-1">
          <ManageList
            editing={!!editing}
            split={split}
            mode={mode}
            onMode={(next) =>
              void guarded(() => {
                setMode(next);
                close();
              })()
            }
            hosts={hosts}
            credentials={credentials}
            canEditInstanceDefaults={has("admin.settings.manage")}
            isOnline={isOnline}
            selectedKey={selectedKey}
            onPickHost={(host) => void guarded(() => openHost(host))()}
            onPickCredential={(cred) =>
              void guarded(() => void openCredential(cred))()
            }
            onPickDefaults={(row) =>
              void guarded(() => void openDefaults(row))()
            }
            onAdd={() => void guarded(() => openHost(null))()}
          />
          {editing?.kind === "defaults" ? (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              {renderEditor()}
            </div>
          ) : (
            <div
              className={cn(
                "min-h-0 flex-1 items-center justify-center",
                split ? "flex" : "hidden",
              )}
            >
              <EmptyState
                icon={Server}
                title={t("manage.pickDefaults")}
                hint={t("manage.pickHint")}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
