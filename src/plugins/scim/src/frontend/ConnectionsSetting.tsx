import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Copy, KeyRound, Pencil, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import {
  AddButton,
  Button,
  FakeSwitch,
  FormFooter,
  InlineView,
  Input,
  ListRow,
  ListRowAction,
  LoadingState,
  SettingRow,
  ToolbarSelect,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { usePluginApi, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  createScimApi,
  type OnDelete,
  type ScimConnection,
  type ScimEvent,
  type ScimGroup,
  type TermixRole,
} from "./scim-api";
import { docsUrl } from "./docs";

type ScimApi = ReturnType<typeof createScimApi>;

function errorMessage(error: unknown, fallback: string): string {
  const err = error as {
    response?: { data?: { error?: string } };
    message?: string;
  };
  return err.response?.data?.error || err.message || fallback;
}

function formatTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(
    value.includes("T") ? value : `${value.replace(" ", "T")}Z`,
  );
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      <label className="text-xs font-semibold">{label}</label>
      {children}
      {hint && (
        <p className="text-[10px] text-muted-foreground leading-snug">{hint}</p>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
        {title}
      </span>
      {children}
    </div>
  );
}

/** A value to paste into the identity provider, with a copy button. */
function CopyValue({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  const { t } = useTranslation();
  return (
    <Field label={label} hint={hint}>
      <div className="flex gap-2">
        <Input
          readOnly
          value={value}
          className="font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button
          variant="outline"
          size="sm"
          title={t("setup.copy")}
          onClick={() => {
            void navigator.clipboard?.writeText(value);
            toast.success(t("setup.copied"));
          }}
        >
          <Copy className="size-3" />
        </Button>
      </div>
    </Field>
  );
}

function TokenNotice({
  baseUrl,
  token,
  onDone,
}: {
  baseUrl: string;
  token: string;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 p-3 border border-accent-brand/40 bg-background">
      <p className="text-xs">{t("setup.tokenOnce")}</p>
      <CopyValue label={t("setup.baseUrl")} value={baseUrl} />
      <CopyValue label={t("setup.token")} value={token} />
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={onDone}
      >
        {t("setup.done")}
      </Button>
    </div>
  );
}

function GroupRoles({
  api,
  connection,
  roles,
}: {
  api: ScimApi;
  connection: ScimConnection;
  roles: TermixRole[];
}) {
  const { t } = useTranslation();
  const [groups, setGroups] = useState<ScimGroup[] | null>(null);

  const load = useCallback(async () => {
    try {
      setGroups(await api.groups(connection.id));
    } catch (error) {
      setGroups([]);
      toast.error(errorMessage(error, t("groups.loadFailed")));
    }
    // api is rebuilt each render from the same client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const options = [
    { value: "", label: t("groups.noRole") },
    ...roles
      .filter((role) => role.name !== "admin" || connection.allowAdmin)
      .map((role) => ({
        value: role.name,
        label: role.displayName || role.name,
      })),
  ];

  async function change(group: ScimGroup, roleName: string) {
    try {
      await api.setGroupRole(connection.id, group.id, roleName || null);
      toast.success(t("groups.saved"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("groups.saveFailed")));
    }
  }

  if (groups === null) return <LoadingState compact />;
  if (groups.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">{t("groups.none")}</span>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {groups.map((group) => (
        <ListRow
          key={group.id}
          title={group.displayName}
          meta={t("groups.members", { count: group.memberCount })}
          trailing={
            <ToolbarSelect
              label={t("groups.role")}
              value={group.roleName ?? ""}
              options={options}
              onChange={(value) => void change(group, value)}
            />
          }
        />
      ))}
    </div>
  );
}

function RecentEvents({
  api,
  connectionId,
}: {
  api: ScimApi;
  connectionId: number;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<ScimEvent[] | null>(null);

  useEffect(() => {
    api
      .events(connectionId)
      .then(setEvents)
      .catch(() => setEvents([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionId]);

  if (events === null) return <LoadingState compact />;
  if (events.length === 0) {
    return (
      <span className="text-xs text-muted-foreground">{t("events.none")}</span>
    );
  }
  return (
    <div className="flex flex-col border border-border">
      {events.map((event) => (
        <div
          key={event.id}
          className="flex items-center gap-2 px-3 py-1.5 border-b border-border last:border-0 text-xs"
        >
          <span className="text-muted-foreground shrink-0">
            {formatTime(event.createdAt)}
          </span>
          <span className="shrink-0">
            {t(`events.actions.${event.action}`, event.action)}
          </span>
          <span className="flex-1 min-w-0 truncate">{event.target}</span>
          {!event.ok && (
            <span
              className="text-destructive truncate"
              title={event.detail ?? undefined}
            >
              {t("events.failed")}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

interface Draft {
  name: string;
  enabled: boolean;
  onDelete: OnDelete;
  adoptExisting: boolean;
  allowAdmin: boolean;
  defaultRoles: string;
}

const EMPTY_DRAFT: Draft = {
  name: "",
  enabled: true,
  onDelete: "disable",
  adoptExisting: false,
  allowAdmin: false,
  defaultRoles: "",
};

function ConnectionEditor({
  open,
  onOpenChange,
  connection,
  roles,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: ScimConnection | null;
  roles: TermixRole[];
  onSaved: (created?: { connection: ScimConnection; token: string }) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const api = createScimApi(usePluginApi());
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setToken(null);
    setDraft(
      connection
        ? {
            name: connection.name,
            enabled: connection.enabled,
            onDelete: connection.onDelete,
            adoptExisting: connection.adoptExisting,
            allowAdmin: connection.allowAdmin,
            defaultRoles: connection.defaultRoles,
          }
        : EMPTY_DRAFT,
    );
  }, [open, connection]);

  const set =
    <K extends keyof Draft>(key: K) =>
    (value: Draft[K]) =>
      setDraft((prev) => ({ ...prev, [key]: value }));

  async function save() {
    if (!draft.name.trim()) {
      toast.error(t("connections.nameRequired"));
      return;
    }
    setSaving(true);
    try {
      const input = { ...draft, name: draft.name.trim() };
      if (connection) {
        await api.update(connection.id, input);
        onSaved();
      } else {
        onSaved(await api.create(input));
      }
      toast.success(t("connections.saved"));
      onOpenChange(false);
    } catch (error) {
      toast.error(errorMessage(error, t("connections.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function rotate() {
    if (!connection) return;
    const ok = await confirm({
      title: t("setup.newTokenConfirm"),
      confirmLabel: t("setup.newToken"),
    });
    if (!ok) return;
    try {
      setToken(await api.newToken(connection.id));
    } catch (error) {
      toast.error(errorMessage(error, t("setup.newTokenFailed")));
    }
  }

  return (
    <InlineView
      open={open}
      onOpenChange={onOpenChange}
      title={connection ? t("connections.edit") : t("connections.add")}
      footer={
        <FormFooter
          onCancel={() => onOpenChange(false)}
          onSave={() => void save()}
          saveLabel={t("connections.save")}
          saving={saving}
        />
      }
    >
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 flex flex-col gap-6">
        <p className="text-xs text-muted-foreground">
          {t("connections.dialogDesc")}{" "}
          <a
            href={docsUrl()}
            target="_blank"
            rel="noreferrer"
            className="text-accent-brand hover:underline"
          >
            {t("connections.docsLink")}
          </a>
        </p>

        <Section title={t("connections.sectionGeneral")}>
          <Field label={t("connections.name")}>
            <Input
              value={draft.name}
              onChange={(e) => set("name")(e.target.value)}
              placeholder={t("connections.namePlaceholder")}
            />
          </Field>
          <div className="border border-border px-3">
            <SettingRow
              label={t("connections.enabled")}
              description={t("connections.enabledDesc")}
            >
              <FakeSwitch checked={draft.enabled} onChange={set("enabled")} />
            </SettingRow>
          </div>
        </Section>

        {connection && (
          <Section title={t("setup.title")}>
            <CopyValue
              label={t("setup.baseUrl")}
              value={connection.baseUrl}
              hint={t("setup.baseUrlHint")}
            />
            {token ? (
              <TokenNotice
                baseUrl={connection.baseUrl}
                token={token}
                onDone={() => setToken(null)}
              />
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="self-start text-xs"
                onClick={() => void rotate()}
              >
                <KeyRound className="size-3" />
                {t("setup.newToken")}
              </Button>
            )}
          </Section>
        )}

        <Section title={t("connections.sectionAccounts")}>
          <div className="border border-border px-3">
            <SettingRow
              label={t("connections.onDelete")}
              description={t("connections.onDeleteDesc")}
            >
              <ToolbarSelect
                label={t("connections.onDelete")}
                value={draft.onDelete}
                onChange={set("onDelete")}
                options={[
                  { value: "disable", label: t("connections.onDeleteDisable") },
                  { value: "delete", label: t("connections.onDeleteDelete") },
                ]}
              />
            </SettingRow>
            <SettingRow
              label={t("connections.adoptExisting")}
              description={t("connections.adoptExistingDesc")}
            >
              <FakeSwitch
                checked={draft.adoptExisting}
                onChange={set("adoptExisting")}
              />
            </SettingRow>
          </div>
        </Section>

        <Section title={t("connections.sectionRoles")}>
          <Field
            label={t("connections.defaultRoles")}
            hint={t("connections.defaultRolesDesc")}
          >
            <Input
              value={draft.defaultRoles}
              onChange={(e) => set("defaultRoles")(e.target.value)}
              placeholder="operator, viewer"
            />
          </Field>
          <div className="border border-border px-3">
            <SettingRow
              label={t("connections.allowAdmin")}
              description={t("connections.allowAdminDesc")}
            >
              <FakeSwitch
                checked={draft.allowAdmin}
                onChange={set("allowAdmin")}
              />
            </SettingRow>
          </div>
          {connection && (
            <Field label={t("groups.title")} hint={t("groups.hint")}>
              <GroupRoles api={api} connection={connection} roles={roles} />
            </Field>
          )}
        </Section>

        {connection && (
          <Section title={t("events.title")}>
            <RecentEvents api={api} connectionId={connection.id} />
          </Section>
        )}
      </div>
    </InlineView>
  );
}

/** The "connections" custom field on the plugin's admin settings page. */
export function ConnectionsSetting() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const api = createScimApi(usePluginApi());
  const [data, setData] = useState<{
    supported: boolean;
    connections: ScimConnection[];
  } | null>(null);
  const [roles, setRoles] = useState<TermixRole[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ScimConnection | null>(null);
  const [created, setCreated] = useState<{
    connection: ScimConnection;
    token: string;
  } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api.list());
    } catch (error) {
      setData({ supported: true, connections: [] });
      toast.error(errorMessage(error, t("connections.loadFailed")));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
    api
      .roles()
      .then(setRoles)
      .catch(() => setRoles([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  async function toggle(connection: ScimConnection) {
    try {
      await api.update(connection.id, { enabled: !connection.enabled });
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("connections.saveFailed")));
    }
  }

  async function remove(connection: ScimConnection) {
    const ok = await confirm({
      title: t("connections.deleteConfirm"),
      confirmLabel: t("connections.delete"),
    });
    if (!ok) return;
    try {
      await api.remove(connection.id);
      toast.success(t("connections.deleted"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("connections.deleteFailed")));
    }
  }

  if (data === null) return <LoadingState compact />;

  return (
    <div className="flex flex-col gap-3 py-3 border-b border-border last:border-0">
      {!data.supported && (
        <p className="text-xs text-destructive">
          {t("connections.unsupported")}
        </p>
      )}
      {created && (
        <TokenNotice
          baseUrl={created.connection.baseUrl}
          token={created.token}
          onDone={() => setCreated(null)}
        />
      )}
      {data.connections.length === 0 ? (
        <span className="text-xs text-muted-foreground">
          {t("connections.none")}
        </span>
      ) : (
        <div className="flex flex-col gap-2">
          {data.connections.map((connection) => (
            <ListRow
              key={connection.id}
              icon={<UserCog className="size-4" />}
              title={connection.name}
              dimmed={!connection.enabled}
              meta={[
                t("connections.users", { count: connection.userCount }),
                t("connections.groups", { count: connection.groupCount }),
                connection.lastRequestAt
                  ? t("connections.lastRequest", {
                      time: formatTime(connection.lastRequestAt),
                    })
                  : t("connections.neverUsed"),
              ].join(" | ")}
              trailing={
                <FakeSwitch
                  checked={connection.enabled}
                  onChange={() => void toggle(connection)}
                  aria-label={t("connections.enabled")}
                />
              }
              actions={
                <>
                  <ListRowAction
                    label={t("connections.edit")}
                    onClick={() => {
                      setEditing(connection);
                      setEditorOpen(true);
                    }}
                  >
                    <Pencil className="size-3" />
                  </ListRowAction>
                  <ListRowAction
                    label={t("connections.delete")}
                    tone="destructive"
                    onClick={() => void remove(connection)}
                  >
                    <Trash2 className="size-3" />
                  </ListRowAction>
                </>
              }
            />
          ))}
        </div>
      )}
      <AddButton
        label={t("connections.add")}
        className="self-start"
        onClick={() => {
          setEditing(null);
          setEditorOpen(true);
        }}
      />
      <ConnectionEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        connection={editing}
        roles={roles}
        onSaved={(made) => {
          if (made) setCreated(made);
          void load();
        }}
      />
    </div>
  );
}
