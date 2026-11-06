import { useState } from "react";
import { ArchiveRestore } from "lucide-react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  FormFooter,
  InlineView,
  SectionCard,
  Segmented,
  SelectField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import {
  OVERWRITE_POLICIES,
  type JobView,
  type OverwritePolicy,
  type SnapshotView,
} from "../shared/types";
import { errorMessage, restoreSnapshot } from "./api";
import { formatDate } from "./format";

/** Where and how to restore a snapshot, or picked files of it. */
export function RestoreForm({
  job,
  snapshot,
  includes,
  localRepo,
  onClose,
  onStarted,
}: {
  job: JobView;
  snapshot: SnapshotView;
  includes: string[];
  /** A folder repository can only be read from its own host. */
  localRepo: boolean;
  onClose: () => void;
  onStarted: (runId: number) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { hosts } = useHosts();
  const [hostId, setHostId] = useState(job.hostId);
  const [where, setWhere] = useState<"original" | "folder">("folder");
  const [path, setPath] = useState(`/tmp/restore-${snapshot.shortId}`);
  const [overwrite, setOverwrite] = useState<OverwritePolicy>("if-changed");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const sshHosts = hosts.filter(
    (h) => h.enableSsh !== false || Number(h.id) === job.hostId,
  );
  const target = where === "original" ? "/" : path.trim();
  const canStart = !saving && target.startsWith("/");

  async function start() {
    if (!canStart) return;
    setSaving(true);
    setError("");
    try {
      const run = await restoreSnapshot(job.id, snapshot.id, {
        hostId,
        path: target,
        includes,
        overwrite,
      });
      toast.success(t("restore.started"));
      onStarted(run.id);
    } catch (e) {
      setError(errorMessage(e, t("restore.failed")));
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onClose()}
      icon={<ArchiveRestore className="size-4" />}
      title={t("restore.title")}
      status={formatDate(snapshot.time)}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void start()}
          saving={saving}
          disabled={!canStart}
          saveLabel={t("restore.start")}
          cancelLabel={t("common.cancel")}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
        />
      }
    >
      <SectionCard title={t("restore.what")} icon={<ArchiveRestore />}>
        <div className="py-2 text-xs">
          {includes.length === 0 ? (
            <p>{t("restore.everything")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5 font-mono">
              {includes.slice(0, 20).map((p) => (
                <li key={p} className="truncate">
                  {p}
                </li>
              ))}
              {includes.length > 20 && (
                <li className="text-muted-foreground">
                  {t("restore.more", { count: includes.length - 20 })}
                </li>
              )}
            </ul>
          )}
        </div>
      </SectionCard>
      <SectionCard title={t("restore.where")} icon={<ArchiveRestore />}>
        <div className="flex flex-col gap-3 py-2">
          <SelectField
            label={t("restore.host")}
            value={String(hostId)}
            disabled={localRepo}
            hint={localRepo ? t("restore.localOnly") : t("restore.hostHint")}
            onChange={(value) => setHostId(Number(value))}
            options={sshHosts.map((h) => ({
              value: String(h.id),
              label: h.name || h.ip || `#${h.id}`,
            }))}
          />
          <Segmented<"folder" | "original">
            value={where}
            onChange={setWhere}
            options={[
              { value: "folder", label: t("restore.toFolder") },
              { value: "original", label: t("restore.toOriginal") },
            ]}
          />
          {where === "folder" ? (
            <TextField
              label={t("restore.folder")}
              value={path}
              mono
              hint={t("restore.folderHint")}
              onChange={setPath}
            />
          ) : (
            <Alert className="text-xs">{t("restore.originalWarning")}</Alert>
          )}
          <SelectField<OverwritePolicy>
            label={t("restore.overwrite")}
            value={overwrite}
            onChange={setOverwrite}
            options={OVERWRITE_POLICIES.map((value) => ({
              value,
              label: t(`restore.overwriteOptions.${value}`),
            }))}
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
