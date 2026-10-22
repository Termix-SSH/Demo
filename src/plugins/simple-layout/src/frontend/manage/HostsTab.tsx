import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  KeyRound,
  Plus,
  Search,
  Server,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  EmptyState,
  Input,
  ListRow,
  ListRowAction,
  MANAGE_REQUEST_EVENT,
  PanelList,
  Segmented,
  deleteCredential,
  deleteSSHHost,
  getCredentials,
  getHostPolicy,
  mapCredentials,
  registerTabCloseGuard,
  takePendingManageRequest,
  useConfirm,
  useHostStatus,
  useShellController,
  type Credential,
  type Host,
  type HostPolicy,
  type ManageRequest,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useTranslation,
  type HostDraft,
} from "@termix-ssh/plugin-sdk/frontend";
import { CredentialForm } from "./CredentialForm";
import { HostForm } from "./HostForm";
import { canDeleteHost, canEditHost } from "./permissions";

const TAB_ID = "host-manager";

type Mode = "hosts" | "credentials";
type Editing =
  | { kind: "host"; host: Host | null; draft?: HostDraft }
  | { kind: "credential"; credential: Credential | null };

/** Hosts and credentials: a short list, and a form that replaces it. */
export function HostsTab() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { hosts } = useShellController();
  const [mode, setMode] = useState<Mode>("hosts");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [policy, setPolicy] = useState<HostPolicy>({ manualCreate: true });
  const [query, setQuery] = useState("");
  const dirty = useRef(false);
  const hostsRef = useRef(hosts.list);
  hostsRef.current = hosts.list;
  const credentialsRef = useRef(credentials);
  credentialsRef.current = credentials;

  const loadCredentials = useCallback(async () => {
    try {
      const list = mapCredentials(await getCredentials());
      credentialsRef.current = list;
      setCredentials(list);
    } catch {
      toast.error(t("manage.loadFailed"));
    }
  }, [t]);

  useEffect(() => {
    void loadCredentials();
    getHostPolicy()
      .then((next) => next && setPolicy(next))
      .catch(() => {});
    window.addEventListener("termix:credentials-changed", loadCredentials);
    return () =>
      window.removeEventListener("termix:credentials-changed", loadCredentials);
  }, [loadCredentials]);

  /** Asks before throwing away unsaved changes. True means go ahead. */
  const confirmDiscard = useCallback(async () => {
    if (!dirty.current) return true;
    return confirm({
      title: t("manage.unsavedTitle"),
      description: t("manage.unsavedHint"),
      confirmLabel: t("manage.discard"),
      cancelLabel: t("manage.keepEditing"),
    });
  }, [confirm, t]);

  useEffect(
    () => registerTabCloseGuard(TAB_ID, confirmDiscard),
    [confirmDiscard],
  );

  const setDirty = (value: boolean) => {
    dirty.current = value;
  };

  const close = () => {
    setDirty(false);
    setEditing(null);
  };

  const openHost = useCallback(
    (host: Host | null, draft?: HostDraft) => {
      if (!host && !policy.manualCreate) {
        toast.error(t("manage.addBlocked", { plugin: policy.blockedBy ?? "" }));
        return;
      }
      setMode("hosts");
      setDirty(false);
      setEditing({ kind: "host", host, draft });
    },
    [policy, t],
  );

  const apply = useCallback(
    async (request: ManageRequest | null) => {
      if (!request) return;
      if (!(await confirmDiscard())) return;
      if (request.kind === "host") {
        const host = request.hostId
          ? (hostsRef.current.find((h) => h.id === request.hostId) ?? null)
          : null;
        openHost(host, request.draft);
      } else if (request.kind === "credential") {
        const credential = request.credentialId
          ? (credentialsRef.current.find(
              (c) => String(c.id) === String(request.credentialId),
            ) ?? null)
          : null;
        setMode("credentials");
        setDirty(false);
        setEditing({ kind: "credential", credential });
      } else {
        // Host defaults are not part of this layout.
        setMode(
          request.kind === "browse" && request.mode === "credentials"
            ? "credentials"
            : "hosts",
        );
        close();
      }
    },
    [confirmDiscard, openHost],
  );

  // A request that opened this tab was parked before it mounted.
  useEffect(() => {
    void apply(takePendingManageRequest());
    const onRequest = () => void apply(takePendingManageRequest());
    window.addEventListener(MANAGE_REQUEST_EVENT, onRequest);
    return () => window.removeEventListener(MANAGE_REQUEST_EVENT, onRequest);
  }, [apply]);

  const switchMode = async (next: Mode) => {
    if (next === mode) return;
    if (!(await confirmDiscard())) return;
    setMode(next);
    close();
  };

  const folders = useMemo(
    () =>
      [
        ...new Set(
          [
            ...hosts.list.map((h) => h.folder),
            ...credentials.map((c) => c.folder),
          ].filter((f): f is string => !!f),
        ),
      ].sort(),
    [hosts.list, credentials],
  );

  const removeHost = async (host: Host) => {
    const ok = await confirm({
      title: t("manage.deleteHostTitle", { name: host.name || host.ip }),
      description: t("manage.cannotUndo"),
    });
    if (!ok) return;
    try {
      await deleteSSHHost(Number(host.id));
      window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
      await hosts.reload();
      toast.success(t("manage.hostDeleted"));
      close();
    } catch {
      toast.error(t("manage.deleteFailed"));
    }
  };

  const removeCredential = async (credential: Credential) => {
    const ok = await confirm({
      title: t("manage.deleteCredentialTitle", { name: credential.name }),
      description: t("manage.cannotUndo"),
    });
    if (!ok) return;
    try {
      await deleteCredential(Number(credential.id));
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(t("manage.credentialDeleted"));
      close();
    } catch {
      toast.error(t("manage.deleteFailed"));
    }
  };

  if (editing) {
    const title =
      editing.kind === "host"
        ? editing.host
          ? editing.host.name || editing.host.ip
          : t("manage.newHost")
        : editing.credential
          ? editing.credential.name
          : t("manage.newCredential");
    return (
      <div className="flex flex-1 min-h-0 flex-col overflow-y-auto">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={async () => {
              if (await confirmDiscard()) close();
            }}
          >
            <ArrowLeft className="size-3.5" />
            {t("manage.back")}
          </Button>
          <h1 className="truncate text-sm font-semibold">{title}</h1>
        </div>
        {editing.kind === "host" ? (
          <HostForm
            key={editing.host?.id ?? "new"}
            host={editing.host}
            draft={editing.draft}
            credentials={credentials}
            folders={folders}
            onBack={close}
            onSaved={() => {
              void hosts.reload();
              close();
            }}
            onDirtyChange={setDirty}
            onDelete={
              editing.host && canDeleteHost(editing.host)
                ? () => void removeHost(editing.host as Host)
                : undefined
            }
          />
        ) : (
          <CredentialForm
            key={editing.credential?.id ?? "new"}
            credential={editing.credential}
            onBack={close}
            onSaved={close}
            onDirtyChange={setDirty}
            onDelete={
              editing.credential
                ? () => void removeCredential(editing.credential as Credential)
                : undefined
            }
          />
        )}
      </div>
    );
  }

  const q = query.trim().toLowerCase();
  const shownHosts = hosts.list.filter(
    (h) =>
      !q ||
      [h.name, h.ip, h.username, h.folder].some((v) =>
        v?.toLowerCase().includes(q),
      ),
  );
  const shownCredentials = credentials.filter(
    (c) => !q || [c.name, c.username].some((v) => v?.toLowerCase().includes(q)),
  );

  return (
    <div className="flex flex-1 min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-1.5">
        <Segmented
          value={mode}
          onChange={(next) => void switchMode(next)}
          options={[
            { value: "hosts", label: t("manage.hosts") },
            { value: "credentials", label: t("manage.credentials") },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("manage.search")}
              className="h-8 w-44 pl-7 text-xs"
            />
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            onClick={() =>
              mode === "hosts"
                ? openHost(null)
                : setEditing({ kind: "credential", credential: null })
            }
          >
            <Plus className="size-3.5" />
            {mode === "hosts" ? t("manage.addHost") : t("manage.addCredential")}
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="mx-auto w-full max-w-4xl p-4">
          {mode === "hosts" ? (
            <PanelList
              empty={
                <EmptyState
                  icon={Server}
                  title={
                    hosts.list.length === 0
                      ? t("manage.noHosts")
                      : t("manage.noMatches")
                  }
                />
              }
            >
              {shownHosts.map((host) => (
                <HostRow
                  key={host.id}
                  host={host}
                  onOpen={() => openHost(host)}
                  onDelete={() => void removeHost(host)}
                />
              ))}
            </PanelList>
          ) : (
            <PanelList
              empty={
                <EmptyState
                  icon={KeyRound}
                  title={
                    credentials.length === 0
                      ? t("manage.noCredentials")
                      : t("manage.noMatches")
                  }
                />
              }
            >
              {shownCredentials.map((credential) => (
                <ListRow
                  key={credential.id}
                  title={credential.name}
                  icon={<KeyRound className="size-3.5" />}
                  meta={credential.username}
                  onClick={() => {
                    setDirty(false);
                    setEditing({ kind: "credential", credential });
                  }}
                  actions={
                    <ListRowAction
                      label={t("manage.delete")}
                      tone="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void removeCredential(credential);
                      }}
                    >
                      <Trash2 />
                    </ListRowAction>
                  }
                />
              ))}
            </PanelList>
          )}
        </div>
      </div>
    </div>
  );
}

function HostRow({
  host,
  onOpen,
  onDelete,
}: {
  host: Host;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const status = useHostStatus(Number(host.id), host.statusCheckEnabled);
  return (
    <ListRow
      title={host.name || host.ip}
      icon={
        <Server
          className={`size-3.5 ${status === "online" ? "text-success" : "text-muted-foreground"}`}
        />
      }
      meta={`${host.username ? `${host.username}@` : ""}${host.ip}${host.folder ? ` | ${host.folder}` : ""}`}
      onClick={onOpen}
      actions={
        canDeleteHost(host) ? (
          <ListRowAction
            label={t("manage.delete")}
            tone="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <Trash2 />
          </ListRowAction>
        ) : canEditHost(host) ? null : undefined
      }
    />
  );
}
