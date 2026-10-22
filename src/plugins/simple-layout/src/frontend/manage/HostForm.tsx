import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Lock } from "lucide-react";
import { toast } from "sonner";
import {
  Field,
  FieldPair,
  FormFooter,
  Input,
  PasswordInput,
  SelectField,
  Switch,
  Textarea,
  TextField,
  createSSHHost,
  getHostEditorSection,
  hostProtocolFlags,
  listHostProtocols,
  makeHostSshSubTabs,
  makeHostTabs,
  resolveHostDefaults,
  updatePluginHostSettings,
  updateSSHHost,
  useEditorDefaultKeys,
  useHostEditorSections,
  withProtocolSettings,
  type Host,
  type HostProtocols,
  type ResolvedHostDefault,
  type SSHHost,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useTranslation,
  type HostDraft,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  applyDefaultToForm,
  changedKeys,
  classifyForm,
  isOwnDefault,
  ownPluginValues,
  withAllNamespaces,
  withOwnKeys,
} from "./form/form-mapping";
import {
  applyHostDraft,
  buildHostEditorPayload,
  createHostEditorForm,
  type HostEditorForm,
} from "./form/host-editor-data";
import { canEditHost, isLockedHost } from "./permissions";

export interface CredentialOption {
  id: string;
  name: string;
  username: string;
}

interface Props {
  host: Host | null;
  /** Fields a plugin filled in for a new host. */
  draft?: HostDraft;
  credentials: CredentialOption[];
  folders: string[];
  onBack: () => void;
  onSaved: (saved: SSHHost) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onDelete?: () => void;
}

function validPort(port: unknown): boolean {
  const n = Number(port);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}

/**
 * Add or edit a host. The basics come first. Everything else a plugin adds
 * sits under More options, drawn by the plugin's own section.
 */
export function HostForm({
  host,
  draft,
  credentials,
  folders,
  onBack,
  onSaved,
  onDirtyChange,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  // Re-render when a plugin adds or removes a section.
  useHostEditorSections();
  const defaultKeys = useEditorDefaultKeys();
  const trackedKeys = useRef<string[]>([]);
  trackedKeys.current = [...defaultKeys.keys()];

  const [form, setForm] = useState<HostEditorForm>(() =>
    applyHostDraft(createHostEditorForm(host), host ? undefined : draft),
  );
  const [protocols, setProtocols] = useState<HostProtocols>(() =>
    hostProtocolFlags(host),
  );
  const [resolved, setResolved] = useState<Record<string, ResolvedHostDefault>>(
    {},
  );
  const [saving, setSaving] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [moreTab, setMoreTab] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const locked = host ? isLockedHost(host) : false;
  const readOnly = host ? !canEditHost(host) : false;

  /** A value the user changed is the host's own from then on. */
  const markOwn = (before: HostEditorForm, after: HostEditorForm) => {
    if (after.defaultOverrides === null) return after;
    const changed = changedKeys(before, after, trackedKeys.current);
    if (changed.length === 0) return after;
    return {
      ...after,
      defaultOverrides: withOwnKeys(after.defaultOverrides, changed),
    };
  };

  const setField = <K extends keyof HostEditorForm>(
    key: K,
    value: HostEditorForm[K],
  ) => {
    onDirtyChange?.(true);
    setForm((prev) => markOwn(prev, { ...prev, [key]: value }));
  };

  const updateForm = (
    patch: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    onDirtyChange?.(true);
    setForm((current) =>
      markOwn(current, {
        ...current,
        ...patch(current as unknown as Record<string, unknown>),
      } as HostEditorForm),
    );
  };

  // An existing host: what its defaults would give, so unchanged values keep following them.
  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    resolveHostDefaults({ hostId: Number(host.id) })
      .then((values) => {
        if (cancelled) return;
        setResolved(values);
        setForm((current) =>
          current.defaultOverrides !== null
            ? current
            : {
                ...current,
                defaultOverrides: classifyForm(
                  current,
                  values,
                  trackedKeys.current,
                ),
              },
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [host]);

  // A new host starts from the defaults of the folder it is placed in.
  const placement = host ? null : form.folder;
  useEffect(() => {
    if (placement === null) return;
    let cancelled = false;
    resolveHostDefaults({ folder: placement || undefined })
      .then((values) => {
        if (cancelled) return;
        setResolved(values);
        setForm((current) => {
          let next = current;
          for (const [key, entry] of Object.entries(values)) {
            if (isOwnDefault(current.defaultOverrides, key)) continue;
            next = applyDefaultToForm(next, key, entry.value);
          }
          return next;
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [placement]);

  const flags = protocols as unknown as Record<string, boolean>;
  const moreTabs = useMemo(
    () =>
      [...makeHostSshSubTabs(t, flags), ...makeHostTabs(t, flags)].filter(
        (tab, index, all) =>
          tab.id !== "general" &&
          tab.id !== "ssh" &&
          all.findIndex((other) => other.id === tab.id) === index,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [t, JSON.stringify(flags)],
  );
  const activeMore = moreTabs.find((tab) => tab.id === moreTab) ?? moreTabs[0];

  const errors = {
    ip: !form.ip.trim() ? t("hostForm.addressRequired") : "",
    port:
      protocols.enableSsh && !validPort(form.sshPort)
        ? t("hostForm.portInvalid")
        : "",
    credential:
      form.authType === "credential" && !form.credentialId
        ? t("hostForm.credentialRequired")
        : "",
  };
  const hasErrors = Object.values(errors).some(Boolean);

  const save = async () => {
    setTried(true);
    if (hasErrors) return;
    setSaving(true);
    try {
      const withOverrides = {
        ...form,
        defaultOverrides: form.defaultOverrides
          ? withAllNamespaces(form.defaultOverrides, defaultKeys)
          : null,
      };
      const data = buildHostEditorPayload(withOverrides, protocols);
      let saved: SSHHost = host
        ? await updateSSHHost(Number(host.id), data)
        : await createSSHHost(data);

      // Plugin settings go through each plugin's own route, after the host exists.
      const values = ownPluginValues(
        withProtocolSettings(form.pluginSettings, protocols),
        withOverrides.defaultOverrides,
        defaultKeys,
      );
      const savedValues: Record<string, Record<string, unknown>> = {};
      for (const [pluginId, fields] of Object.entries(values ?? {})) {
        if (!fields || Object.keys(fields).length === 0) continue;
        try {
          savedValues[pluginId] = await updatePluginHostSettings(
            pluginId,
            Number(saved.id),
            fields,
          );
        } catch {
          toast.error(t("hostForm.pluginSaveFailed"));
        }
      }
      saved = {
        ...saved,
        pluginSettings: { ...(saved.pluginSettings ?? {}), ...savedValues },
      };

      toast.success(host ? t("hostForm.updated") : t("hostForm.created"));
      onDirtyChange?.(false);
      window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
      onSaved(saved);
    } catch {
      toast.error(t("hostForm.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const authOptions = [
    { value: "password", label: t("hostForm.authPassword") },
    { value: "key", label: t("hostForm.authKey") },
    { value: "credential", label: t("hostForm.authCredential") },
  ] as { value: string; label: string }[];
  // An auth type a plugin added stays selectable so it is not lost on save.
  if (!authOptions.some((option) => option.value === form.authType)) {
    authOptions.push({ value: form.authType, label: form.authType });
  }

  const sshOff = !protocols.enableSsh;
  const otherProtocols = listHostProtocols();

  return (
    <div className="flex flex-col gap-5 p-4 md:p-6 max-w-2xl w-full mx-auto">
      {locked && host?.lock && (
        <div className="flex items-start gap-2 border border-accent-brand/30 bg-accent-brand/5 p-3 text-xs text-muted-foreground">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-accent-brand" />
          {t("hostForm.managed", { plugin: host.lock.pluginName })}
        </div>
      )}
      {!locked && readOnly && (
        <div className="border border-border p-3 text-xs text-muted-foreground">
          {t("hostForm.readOnly")}
        </div>
      )}

      <fieldset disabled={readOnly} className="flex flex-col gap-4 min-w-0">
        <TextField
          label={t("hostForm.name")}
          value={form.name}
          onChange={(value) => setField("name", value)}
          placeholder={t("hostForm.namePlaceholder")}
        />

        <FieldPair>
          <TextField
            label={t("hostForm.address")}
            value={form.ip}
            onChange={(value) => setField("ip", value)}
            placeholder="192.168.1.10"
            error={tried ? errors.ip : ""}
            mono
          />
          {!sshOff && (
            <TextField
              label={t("hostForm.port")}
              value={String(form.sshPort)}
              onChange={(value) =>
                setField("sshPort", value === "" ? 0 : Number(value) || 0)
              }
              error={tried ? errors.port : ""}
              mono
            />
          )}
        </FieldPair>

        {!sshOff && (
          <>
            <TextField
              label={t("hostForm.username")}
              value={form.username}
              onChange={(value) => setField("username", value)}
              placeholder="root"
              mono
            />

            <SelectField
              label={t("hostForm.signIn")}
              value={form.authType}
              onChange={(value) =>
                setField("authType", value as HostEditorForm["authType"])
              }
              options={authOptions}
            />

            {form.authType === "password" && (
              <Field label={t("hostForm.password")}>
                <PasswordInput
                  value={form.password}
                  onChange={(e) => setField("password", e.target.value)}
                />
              </Field>
            )}

            {form.authType === "key" && (
              <>
                <Field
                  label={t("hostForm.privateKey")}
                  hint={t("hostForm.privateKeyHint")}
                >
                  <Textarea
                    value={form.key === "existing_key" ? "" : String(form.key)}
                    placeholder={
                      form.key === "existing_key"
                        ? t("hostForm.keySaved")
                        : "-----BEGIN OPENSSH PRIVATE KEY-----"
                    }
                    onChange={(e) =>
                      setField("key", e.target.value || "existing_key")
                    }
                    className="min-h-28 font-mono text-xs"
                  />
                </Field>
                <Field label={t("hostForm.keyPassphrase")}>
                  <PasswordInput
                    value={
                      form.keyPassword === "existing_key_password"
                        ? ""
                        : form.keyPassword
                    }
                    placeholder={
                      form.keyPassword === "existing_key_password"
                        ? t("hostForm.keySaved")
                        : ""
                    }
                    onChange={(e) => setField("keyPassword", e.target.value)}
                  />
                </Field>
              </>
            )}

            {form.authType === "credential" && (
              <SelectField
                label={t("hostForm.credential")}
                value={form.credentialId}
                onChange={(value) => setField("credentialId", value)}
                options={credentials.map((credential) => ({
                  value: String(credential.id),
                  label: `${credential.name} (${credential.username})`,
                }))}
                placeholder={t("hostForm.credentialPlaceholder")}
                error={tried ? errors.credential : ""}
              />
            )}
          </>
        )}

        <Field label={t("hostForm.folder")} hint={t("hostForm.folderHint")}>
          <>
            <Input
              list="simple-layout-folders"
              value={form.folder}
              onChange={(e) => setField("folder", e.target.value)}
            />
            <datalist id="simple-layout-folders">
              {folders.map((folder) => (
                <option key={folder} value={folder} />
              ))}
            </datalist>
          </>
        </Field>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <button
            type="button"
            className="flex items-center gap-1.5 self-start text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setShowMore((open) => !open)}
            aria-expanded={showMore}
          >
            {showMore ? (
              <ChevronDown className="size-3.5" />
            ) : (
              <ChevronRight className="size-3.5" />
            )}
            {t("hostForm.moreOptions")}
          </button>

          {showMore && (
            <div className="flex flex-col gap-4 pt-2">
              <div className="flex flex-col gap-2">
                <SwitchRow
                  label={t("hostForm.useSsh")}
                  checked={protocols.enableSsh}
                  onChange={(value) => {
                    onDirtyChange?.(true);
                    setProtocols((prev) => ({ ...prev, enableSsh: value }));
                  }}
                />
                {otherProtocols.map((protocol) => (
                  <SwitchRow
                    key={protocol.id}
                    label={t(protocol.titleKey)}
                    checked={!!protocols[protocol.settingKey]}
                    onChange={(value) => {
                      onDirtyChange?.(true);
                      setProtocols((prev) => ({
                        ...prev,
                        [protocol.settingKey]: value,
                      }));
                    }}
                  />
                ))}
              </div>

              {moreTabs.length > 0 && activeMore && (
                <>
                  <div className="flex flex-wrap gap-1 border-b border-border">
                    {moreTabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setMoreTab(tab.id)}
                        className={`px-2.5 py-1.5 text-xs border-b-2 ${
                          tab.id === activeMore.id
                            ? "border-accent-brand text-foreground"
                            : "border-transparent text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <PluginSection
                    id={activeMore.id}
                    form={form}
                    setField={
                      setField as unknown as (k: string, v: unknown) => void
                    }
                    updateForm={updateForm}
                    host={host}
                    credentials={credentials}
                    protocols={flags}
                  />
                </>
              )}
            </div>
          )}
        </div>
      </fieldset>

      <FormFooter
        onCancel={onBack}
        onSave={() => void save()}
        saving={saving}
        disabled={readOnly}
        onDelete={onDelete}
        deleteLabel={t("hostForm.delete")}
        saveLabel={host ? t("hostForm.save") : t("hostForm.add")}
        cancelLabel={t("hostForm.cancel")}
      />
    </div>
  );
}

function SwitchRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      {label}
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function PluginSection({
  id,
  form,
  setField,
  updateForm,
  host,
  credentials,
  protocols,
}: {
  id: string;
  form: HostEditorForm;
  setField: (key: string, value: unknown) => void;
  updateForm: (
    patch: (current: Record<string, unknown>) => Record<string, unknown>,
  ) => void;
  host: Host | null;
  credentials: CredentialOption[];
  protocols: Record<string, boolean>;
}) {
  const section = getHostEditorSection(id);
  if (!section) return null;
  const Section = section.component;
  return (
    <Section
      form={form}
      setField={setField}
      updateForm={updateForm}
      host={host ?? undefined}
      credentials={credentials}
      protocols={protocols}
      mode="host"
    />
  );
}
