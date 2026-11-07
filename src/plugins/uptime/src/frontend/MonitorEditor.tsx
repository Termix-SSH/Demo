import { useEffect, useMemo, useState } from "react";
import { Clock, Globe, Save, Server } from "lucide-react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FormFooter,
  InlineView,
  NumberField,
  SectionCard,
  SelectField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import {
  MONITOR_TYPES,
  REMOTE_TYPES,
  SSH_TYPES,
  type CheckResult,
  type MonitorConfig,
  type MonitorInput,
  type MonitorSecrets,
  type MonitorType,
  type MonitorView,
} from "../shared/types";
import {
  createMonitor,
  errorMessage,
  testMonitor,
  updateMonitor,
  type Permissions,
} from "./api";
import { TypeFields } from "./TypeFields";

export const NO_HOST = "none";

interface Form {
  name: string;
  type: MonitorType;
  groupName: string;
  tags: string;
  config: MonitorConfig;
  secrets: MonitorSecrets;
  headers: string;
  hostId: string;
  fromHostId: string;
  intervalSec: number;
  retries: number;
  retryIntervalSec: number;
  timeoutSec: number;
  resendMinutes: number;
}

function blank(presetHostId?: number): Form {
  return {
    name: "",
    type: presetHostId ? "host" : "http",
    groupName: "",
    tags: "",
    config: { method: "GET", acceptedStatus: "200-299", followRedirects: true },
    secrets: {},
    headers: "",
    hostId: presetHostId ? String(presetHostId) : NO_HOST,
    fromHostId: NO_HOST,
    intervalSec: 60,
    retries: 1,
    retryIntervalSec: 30,
    timeoutSec: 10,
    resendMinutes: 0,
  };
}

function fromMonitor(monitor: MonitorView): Form {
  return {
    name: monitor.name,
    type: monitor.type,
    groupName: monitor.groupName,
    tags: monitor.tags.join(", "),
    config: monitor.config,
    secrets: {},
    headers: "",
    hostId: monitor.hostId ? String(monitor.hostId) : NO_HOST,
    fromHostId: monitor.fromHostId ? String(monitor.fromHostId) : NO_HOST,
    intervalSec: monitor.intervalSec,
    retries: monitor.retries,
    retryIntervalSec: monitor.retryIntervalSec,
    timeoutSec: monitor.timeoutSec,
    resendMinutes: monitor.resendMinutes,
  };
}

/** "Name: value" lines into a header map. */
export function parseHeaders(text: string): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const at = line.indexOf(":");
    if (at > 0) headers[line.slice(0, at).trim()] = line.slice(at + 1).trim();
  }
  return headers;
}

function toInput(form: Form): MonitorInput {
  const secrets: MonitorSecrets = { ...form.secrets };
  if (form.headers.trim()) secrets.headers = parseHeaders(form.headers);
  return {
    name: form.name,
    type: form.type,
    groupName: form.groupName,
    tags: form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
    config: form.config,
    // Left out keeps the stored login when nothing was typed.
    secrets: Object.keys(secrets).length ? secrets : undefined,
    hostId: form.hostId === NO_HOST ? null : Number(form.hostId),
    fromHostId: form.fromHostId === NO_HOST ? null : Number(form.fromHostId),
    intervalSec: form.intervalSec,
    retries: form.retries,
    retryIntervalSec: form.retryIntervalSec,
    timeoutSec: form.timeoutSec,
    resendMinutes: form.resendMinutes,
  };
}

export function MonitorEditor({
  open,
  monitor,
  presetHostId,
  permissions,
  onClose,
  onSaved,
}: {
  open: boolean;
  monitor?: MonitorView;
  presetHostId?: number;
  permissions: Permissions;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const [form, setForm] = useState<Form>(() =>
    monitor ? fromMonitor(monitor) : blank(presetHostId),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [pushUrl, setPushUrl] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(monitor ? fromMonitor(monitor) : blank(presetHostId));
    setError("");
    setResult(null);
    setPushUrl("");
    // Only a fresh open resets the form, not a poll that replaces monitor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const hostOptions = useMemo(
    () => [
      { value: NO_HOST, label: t("editor.noHost") },
      ...hosts.map((host) => ({
        value: String(host.id),
        label: String(host.name || host.ip),
      })),
    ],
    [hosts, t],
  );

  const set = (patch: Partial<Form>) =>
    setForm((current) => ({ ...current, ...patch }));
  const setConfig = (patch: Partial<MonitorConfig>) =>
    setForm((current) => ({
      ...current,
      config: { ...current.config, ...patch },
    }));

  const ssh = SSH_TYPES.includes(form.type);
  const needsHost = ssh || form.type === "host";
  const canRemote = REMOTE_TYPES.includes(form.type);
  const types = MONITOR_TYPES.filter(
    (type) => type !== "command" || permissions.runCommands,
  );

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const input = toInput(form);
      if (monitor) {
        await updateMonitor(monitor.id, input);
      } else {
        const created = await createMonitor(input);
        if (created.pushUrl) {
          // Shown once, so the view stays open to copy it.
          setPushUrl(created.pushUrl);
          await onSaved();
          return;
        }
      }
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("editor.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const test = async () => {
    setTesting(true);
    setResult(null);
    setError("");
    try {
      setResult(
        await testMonitor({ ...toInput(form), monitorId: monitor?.id }),
      );
    } catch (e) {
      setError(errorMessage(e, t("editor.testFailed")));
    } finally {
      setTesting(false);
    }
  };

  const footer = (
    <FormFooter
      onCancel={onClose}
      onSave={pushUrl ? onClose : () => void save()}
      saveLabel={pushUrl ? t("common.done") : t("common.save")}
      cancelLabel={t("common.cancel")}
      saving={saving}
      status={
        error ? (
          <span className="text-destructive">{error}</span>
        ) : result ? (
          <span className={result.ok ? "text-green-500" : "text-destructive"}>
            {result.ok ? t("editor.testOk") : t("editor.testBad")} |{" "}
            {result.message}
          </span>
        ) : null
      }
      extra={
        form.type !== "push" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() => void test()}
          >
            {testing ? t("editor.testing") : t("editor.test")}
          </Button>
        ) : null
      }
    />
  );

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={monitor ? t("editor.editTitle") : t("editor.addTitle")}
      stacked
      footer={footer}
    >
      <SectionCard title={t("editor.what")} icon={<Globe className="size-4" />}>
        <div className="flex flex-col gap-3">
          {pushUrl ? (
            <div className="flex flex-col gap-1 text-xs">
              <p>{t("editor.pushOnce")}</p>
              <code className="break-all">{pushUrl}</code>
            </div>
          ) : null}
          <TextField
            label={t("editor.name")}
            value={form.name}
            onChange={(name) => set({ name })}
          />
          <SelectField<MonitorType>
            label={t("editor.type")}
            value={form.type}
            disabled={!!monitor}
            onChange={(type) => set({ type })}
            options={types.map((value) => ({
              value,
              label: t(`types.${value}`),
            }))}
            hint={t(`typeHints.${form.type}`)}
          />
          {needsHost ? (
            <SelectField
              label={t("editor.host")}
              value={form.hostId}
              onChange={(hostId) => set({ hostId })}
              options={hostOptions}
            />
          ) : null}
          <TypeFields
            type={form.type}
            config={form.config}
            secrets={form.secrets}
            headers={form.headers}
            hasSecrets={!!monitor?.hasSecrets}
            onConfig={setConfig}
            onSecrets={(secrets) =>
              set({ secrets: { ...form.secrets, ...secrets } })
            }
            onHeaders={(headers) => set({ headers })}
          />
        </div>
      </SectionCard>
      {canRemote ? (
        <SectionCard
          title={t("editor.from")}
          icon={<Server className="size-4" />}
        >
          <div className="flex flex-col gap-3 py-2">
            <SelectField
              label={t("editor.fromHost")}
              value={form.fromHostId}
              onChange={(fromHostId) => set({ fromHostId })}
              options={hostOptions.map((option) =>
                option.value === NO_HOST
                  ? { ...option, label: t("editor.fromServer") }
                  : option,
              )}
              hint={t("editor.fromHint")}
            />
          </div>
        </SectionCard>
      ) : null}
      <SectionCard
        title={t("editor.timing")}
        icon={<Clock className="size-4" />}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <NumberField
            label={t("editor.interval")}
            value={form.intervalSec}
            onChange={(intervalSec) => set({ intervalSec })}
            min={ssh ? 60 : permissions.minIntervalSec}
          />
          {form.type !== "push" ? (
            <NumberField
              label={t("editor.timeout")}
              value={form.timeoutSec}
              onChange={(timeoutSec) => set({ timeoutSec })}
              min={1}
            />
          ) : (
            <NumberField
              label={t("editor.grace")}
              value={form.config.graceSec ?? 60}
              onChange={(graceSec) => setConfig({ graceSec })}
              min={0}
            />
          )}
          <NumberField
            label={t("editor.retries")}
            value={form.retries}
            onChange={(retries) => set({ retries })}
            min={0}
            max={10}
            hint={t("editor.retriesHint")}
          />
          <NumberField
            label={t("editor.retryInterval")}
            value={form.retryIntervalSec}
            onChange={(retryIntervalSec) => set({ retryIntervalSec })}
            min={5}
          />
          <NumberField
            label={t("editor.resend")}
            value={form.resendMinutes}
            onChange={(resendMinutes) => set({ resendMinutes })}
            min={0}
            hint={t("editor.resendHint")}
          />
        </div>
      </SectionCard>
      <SectionCard title={t("editor.more")} icon={<Save className="size-4" />}>
        <div className="flex flex-col gap-3">
          <TextField
            label={t("editor.group")}
            value={form.groupName}
            onChange={(groupName) => set({ groupName })}
          />
          <TextField
            label={t("editor.tags")}
            value={form.tags}
            onChange={(tags) => set({ tags })}
            hint={t("editor.tagsHint")}
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
