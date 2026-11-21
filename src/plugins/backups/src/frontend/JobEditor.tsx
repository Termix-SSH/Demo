import { useEffect, useState } from "react";
import {
  Bell,
  Boxes,
  Database,
  DatabaseBackup,
  FolderOpen,
  History,
  Plus,
  RotateCcw,
  Settings2,
  Terminal,
} from "lucide-react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FormFooter,
  InlineView,
  NumberField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import {
  EMPTY_KEEP,
  type AlertChannelOption,
  type DatabaseLoginOption,
  type JobInput,
  type JobSourceInput,
  type JobView,
  type KeepPolicy,
  type RepositoryView,
} from "../shared/types";
import {
  createJob,
  deleteJob,
  errorMessage,
  getDatabaseLogins,
  listAlertChannels,
  listRepositories,
  updateJob,
} from "./api";
import { ScheduleCard } from "./ScheduleCard";
import { SourceCard, newSource } from "./SourceCard";

function draftOf(job: JobView | null): JobInput {
  if (!job) {
    return {
      name: "",
      repositoryId: 0,
      enabled: true,
      sources: [newSource("paths")],
      hooks: { pre: "", post: "" },
      cron: "0 2 * * *",
      timezone: "",
      keep: { ...EMPTY_KEEP, daily: 7, weekly: 4, monthly: 6 },
      alerts: { onFailure: true, staleDays: 3 },
      oneFileSystem: false,
      backupOptions: "",
      retries: 0,
      retryDelayMinutes: 10,
      mirrors: [],
      runnerHostId: null,
    };
  }
  return {
    name: job.name,
    repositoryId: job.repositoryId,
    enabled: job.enabled,
    sources: job.sources.map((source) =>
      source.kind === "database" ? { ...source, password: "" } : source,
    ),
    hooks: job.hooks,
    cron: job.cron,
    timezone: job.timezone,
    keep: job.keep,
    alerts: job.alerts,
    oneFileSystem: job.oneFileSystem,
    backupOptions: job.backupOptions,
    retries: job.retries,
    retryDelayMinutes: job.retryDelayMinutes,
    mirrors: job.mirrors,
    runnerHostId: job.runnerHostId ?? null,
  };
}

const KEEP_KEYS: (keyof KeepPolicy)[] = [
  "last",
  "daily",
  "weekly",
  "monthly",
  "yearly",
];

/** Add or change one backup job on a host. */
export function JobEditor({
  hostId: fixedHost,
  job,
  onClose,
  onSaved,
}: {
  /** Null lets the user pick the host, for a job added from the Backups tab. */
  hostId: number | null;
  job: JobView | null;
  onClose: () => void;
  onSaved: (job: JobView | null) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { hosts } = useHosts();
  const [hostId, setHostId] = useState(job?.hostId ?? fixedHost ?? 0);
  const host = hosts.find((h) => Number(h.id) === hostId);
  const hostName = host?.name || host?.ip || "";
  const [draft, setDraft] = useState<JobInput>(() => draftOf(job));
  const [repos, setRepos] = useState<RepositoryView[] | null>(null);
  const [logins, setLogins] = useState<DatabaseLoginOption[] | null>(null);
  const [channels, setChannels] = useState<AlertChannelOption[]>([]);

  useEffect(() => {
    void listAlertChannels()
      .then(setChannels)
      .catch(() => setChannels([]));
  }, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void listRepositories()
      .then((list) => {
        setRepos(list);
        setDraft((d) =>
          d.repositoryId || list.length === 0
            ? d
            : {
                ...d,
                repositoryId:
                  list.find(
                    (r) => r.kind !== "local" || r.location.hostId === hostId,
                  )?.id ?? 0,
              },
        );
      })
      .catch(() => setRepos([]));
    if (!hostId) return;
    void getDatabaseLogins(hostId)
      .then((res) => setLogins(res.available ? res.logins : null))
      .catch(() => setLogins(null));
  }, [hostId]);

  const set = (patch: Partial<JobInput>) =>
    setDraft((d) => ({ ...d, ...patch }));
  const setSource = (index: number, next: JobSourceInput) =>
    set({ sources: draft.sources.map((s, i) => (i === index ? next : s)) });

  const resticHost = draft.runnerHostId ?? hostId;
  const usable = (repos ?? []).filter(
    (r) => r.kind !== "local" || r.location.hostId === resticHost,
  );
  const sshHosts = hosts.filter((h) => h.enableSsh !== false);
  const lockedRepo = job !== null && !job.canEditRepo;
  const canSave =
    hostId > 0 &&
    !!draft.name.trim() &&
    draft.repositoryId > 0 &&
    draft.sources.length > 0 &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError("");
    try {
      const saved = job
        ? await updateJob(job.id, draft)
        : await createJob(hostId, draft);
      toast.success(t("editor.saved"));
      onSaved(saved);
    } catch (e) {
      setError(errorMessage(e, t("editor.saveFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!job) return;
    const ok = await confirm({
      title: t("editor.deleteTitle", { name: job.name }),
      description: t("editor.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await deleteJob(job.id);
      toast.success(t("editor.deleted"));
      onSaved(null);
    } catch (e) {
      toast.error(errorMessage(e, t("editor.deleteFailed")));
    }
  }

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onClose()}
      icon={<DatabaseBackup className="size-4" />}
      title={job ? job.name : t("editor.newTitle")}
      status={hostName}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          disabled={!canSave}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          onDelete={job ? () => void remove() : undefined}
          deleteLabel={t("common.delete")}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
        />
      }
    >
      <SectionCard title={t("editor.general")} icon={<Settings2 />}>
        <div className="flex flex-col gap-3 py-2">
          {!job && !fixedHost && (
            <SelectField
              label={t("editor.host")}
              value={hostId ? String(hostId) : ""}
              placeholder={t("editor.pickHost")}
              onChange={(value) => setHostId(Number(value))}
              options={sshHosts.map((h) => ({
                value: String(h.id),
                label: h.name || h.ip || `#${h.id}`,
              }))}
            />
          )}
          <TextField
            label={t("editor.name")}
            value={draft.name}
            placeholder={t("editor.namePlaceholder")}
            onChange={(name) => set({ name })}
          />
          <SelectField
            label={t("editor.runner")}
            value={String(draft.runnerHostId ?? 0)}
            hint={
              draft.runnerHostId
                ? t("editor.runnerHint")
                : t("editor.runnerSelf")
            }
            onChange={(value) =>
              set({ runnerHostId: Number(value) > 0 ? Number(value) : null })
            }
            options={[
              { value: "0", label: t("editor.runnerThisHost") },
              ...sshHosts
                .filter((h) => Number(h.id) !== hostId)
                .map((h) => ({
                  value: String(h.id),
                  label: h.name || h.ip || `#${h.id}`,
                })),
            ]}
          />
          {repos !== null && usable.length === 0 ? (
            <p className="text-xs text-warning">{t("editor.noRepos")}</p>
          ) : (
            <SelectField
              label={t("editor.repository")}
              value={String(draft.repositoryId || "")}
              placeholder={t("editor.pickRepository")}
              disabled={lockedRepo}
              hint={lockedRepo ? t("editor.repoLocked") : undefined}
              onChange={(value) => set({ repositoryId: Number(value) })}
              options={(lockedRepo && job
                ? [{ id: job.repositoryId, name: job.repositoryName }]
                : usable
              ).map((r) => ({ value: String(r.id), label: r.name }))}
            />
          )}
          {draft.repositoryId > 0 &&
            usable.some((r) => r.id !== draft.repositoryId) && (
              <div className="flex flex-col gap-1">
                <p className="text-sm font-medium">{t("mirrors.title")}</p>
                <p className="text-xs text-muted-foreground">
                  {t("mirrors.hint")}
                </p>
                {usable
                  .filter((r) => r.id !== draft.repositoryId)
                  .map((r) => (
                    <SwitchRow
                      key={r.id}
                      label={r.name}
                      description={t(`repos.kinds.${r.kind}`)}
                      checked={draft.mirrors.includes(r.id)}
                      onChange={(on) =>
                        set({
                          mirrors: on
                            ? [...draft.mirrors, r.id]
                            : draft.mirrors.filter((id) => id !== r.id),
                        })
                      }
                    />
                  ))}
              </div>
            )}
          <SwitchRow
            label={t("editor.enabled")}
            description={t("editor.enabledHint")}
            checked={draft.enabled}
            onChange={(enabled) => set({ enabled })}
          />
          <SwitchRow
            label={t("editor.oneFileSystem")}
            description={t("editor.oneFileSystemHint")}
            checked={draft.oneFileSystem}
            onChange={(oneFileSystem) => set({ oneFileSystem })}
          />
        </div>
      </SectionCard>

      {hostId > 0 &&
        draft.sources.map((source, index) => (
          <SourceCard
            key={source.id}
            hostId={hostId}
            source={source}
            logins={logins}
            onChange={(next) => setSource(index, next)}
            onRemove={() =>
              set({ sources: draft.sources.filter((_, i) => i !== index) })
            }
          />
        ))}

      <SectionCard title={t("sources.add")} icon={<Plus />}>
        <div className="flex flex-wrap gap-2 py-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({ sources: [...draft.sources, newSource("paths")] })
            }
          >
            <FolderOpen className="size-3.5" />
            {t("sources.addPaths")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({ sources: [...draft.sources, newSource("database")] })
            }
          >
            <Database className="size-3.5" />
            {t("sources.addDatabase")}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              set({ sources: [...draft.sources, newSource("docker")] })
            }
          >
            <Boxes className="size-3.5" />
            {t("sources.addDocker")}
          </Button>
        </div>
      </SectionCard>

      <ScheduleCard
        cron={draft.cron}
        timezone={draft.timezone}
        onChange={(next) => set(next)}
      />

      <SectionCard title={t("keep.title")} icon={<History />}>
        <div className="flex flex-col gap-2 py-2">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            {KEEP_KEYS.map((key) => (
              <NumberField
                key={key}
                label={t(`keep.${key}`)}
                value={draft.keep[key]}
                min={0}
                onChange={(value) =>
                  set({
                    keep: {
                      ...draft.keep,
                      [key]: Math.max(0, Math.floor(value) || 0),
                    },
                  })
                }
              />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{t("keep.hint")}</p>
        </div>
      </SectionCard>

      <SectionCard title={t("retries.title")} icon={<RotateCcw />}>
        <div className="flex flex-col gap-2 py-2">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label={t("retries.count")}
              value={draft.retries}
              min={0}
              max={10}
              onChange={(value) =>
                set({
                  retries: Math.min(10, Math.max(0, Math.floor(value) || 0)),
                })
              }
            />
            <NumberField
              label={t("retries.delay")}
              value={draft.retryDelayMinutes}
              min={1}
              max={1440}
              disabled={draft.retries === 0}
              onChange={(value) =>
                set({
                  retryDelayMinutes: Math.min(
                    1440,
                    Math.max(1, Math.floor(value) || 1),
                  ),
                })
              }
            />
          </div>
          <p className="text-xs text-muted-foreground">{t("retries.hint")}</p>
        </div>
      </SectionCard>

      <SectionCard title={t("hooks.title")} icon={<Terminal />}>
        <div className="grid grid-cols-1 gap-3 py-2 md:grid-cols-2">
          <TextAreaField
            label={t("hooks.pre")}
            hint={t("hooks.preHint")}
            value={draft.hooks.pre}
            rows={4}
            mono
            onChange={(pre) => set({ hooks: { ...draft.hooks, pre } })}
          />
          <TextAreaField
            label={t("hooks.post")}
            hint={t("hooks.postHint")}
            value={draft.hooks.post}
            rows={4}
            mono
            onChange={(post) => set({ hooks: { ...draft.hooks, post } })}
          />
        </div>
        <div className="pb-2">
          <TextField
            label={t("hooks.options")}
            hint={t("hooks.optionsHint")}
            value={draft.backupOptions}
            placeholder="--exclude-caches --limit-upload 2048"
            onChange={(backupOptions) => set({ backupOptions })}
          />
        </div>
      </SectionCard>

      <SectionCard title={t("alerts.title")} icon={<Bell />}>
        <div className="flex flex-col gap-3 py-2">
          <SwitchRow
            label={t("alerts.onFailure")}
            description={t("alerts.onFailureHint")}
            checked={draft.alerts.onFailure}
            onChange={(onFailure) =>
              set({ alerts: { ...draft.alerts, onFailure } })
            }
          />
          <SwitchRow
            label={t("alerts.onWarning")}
            description={t("alerts.onWarningHint")}
            checked={draft.alerts.onWarning ?? draft.alerts.onFailure}
            onChange={(onWarning) =>
              set({ alerts: { ...draft.alerts, onWarning } })
            }
          />
          <SwitchRow
            label={t("alerts.onSuccess")}
            description={t("alerts.onSuccessHint")}
            checked={draft.alerts.onSuccess === true}
            onChange={(onSuccess) =>
              set({ alerts: { ...draft.alerts, onSuccess } })
            }
          />
          {channels.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium">{t("alerts.channels")}</p>
              <p className="text-xs text-muted-foreground">
                {t("alerts.channelsHint")}
              </p>
              {channels.map((channel) => {
                const picked = draft.alerts.channelIds ?? [];
                return (
                  <SwitchRow
                    key={channel.id}
                    label={channel.name}
                    description={
                      channel.enabled
                        ? channel.type
                        : `${channel.type} | ${t("alerts.channelOff")}`
                    }
                    checked={picked.includes(channel.id)}
                    onChange={(on) =>
                      set({
                        alerts: {
                          ...draft.alerts,
                          channelIds: on
                            ? [...picked, channel.id]
                            : picked.filter((id) => id !== channel.id),
                        },
                      })
                    }
                  />
                );
              })}
            </div>
          )}
          <NumberField
            label={t("alerts.staleDays")}
            hint={t("alerts.staleDaysHint")}
            value={draft.alerts.staleDays}
            min={0}
            max={365}
            onChange={(value) =>
              set({
                alerts: {
                  ...draft.alerts,
                  staleDays: Math.min(365, Math.max(0, Math.floor(value) || 0)),
                },
              })
            }
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
