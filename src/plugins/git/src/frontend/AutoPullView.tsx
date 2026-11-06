import { useState } from "react";
import { useTranslation, useToast } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  NumberField,
  PanelList,
  SwitchRow,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { GitStatus, PullOutcome, RepoInfo } from "../shared/types";
import { errorMessage, runAuto, setAuto } from "./api";
import { ago } from "./format";

const TONE: Record<
  PullOutcome,
  "success" | "muted" | "warning" | "destructive"
> = {
  pulled: "success",
  uptodate: "muted",
  skipped: "warning",
  failed: "destructive",
};

/** Auto pull setup and the last runs of one repo. */
export function AutoPullView({
  hostId,
  repo,
  status,
  onChanged,
}: {
  hostId: number;
  repo: RepoInfo;
  status: GitStatus;
  onChanged: () => void;
}) {
  const { t, language } = useTranslation();
  const toast = useToast();
  const auto = repo.auto;
  const [enabled, setEnabled] = useState(auto?.enabled ?? false);
  const [interval, setInterval] = useState(auto?.intervalMin ?? 15);
  const [post, setPost] = useState(auto?.postCommand ?? "");
  const [busy, setBusy] = useState(false);
  const canEdit = status.canEdit;
  const dirty =
    enabled !== (auto?.enabled ?? false) ||
    interval !== (auto?.intervalMin ?? 15) ||
    post !== (auto?.postCommand ?? "");

  const save = async () => {
    setBusy(true);
    try {
      await setAuto(hostId, repo.path, {
        enabled,
        intervalMin: interval,
        postCommand: post.trim(),
      });
      toast.success(t("auto.saved"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("auto.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  const runNow = async () => {
    setBusy(true);
    try {
      const run = await runAuto(hostId, repo.path);
      const msg = t(`auto.outcome.${run.outcome}`);
      if (run.outcome === "failed") toast.error(`${msg}: ${run.message}`);
      else toast.success(msg);
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("auto.saveFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 border-b p-3">
        <p className="text-xs text-muted-foreground">{t("auto.intro")}</p>
        {!repo.upstream && (
          <p className="text-xs text-warning">{t("auto.noUpstream")}</p>
        )}
        <SwitchRow
          label={t("auto.enable")}
          description={t("auto.enableHint")}
          checked={enabled}
          onChange={setEnabled}
          disabled={!canEdit}
        />
        <NumberField
          label={t("auto.interval")}
          hint={t("auto.intervalHint")}
          value={interval}
          onChange={setInterval}
          min={1}
          max={10080}
          disabled={!canEdit}
        />
        {status.canRunCommands || post ? (
          <TextField
            label={t("auto.post")}
            hint={t("auto.postHint")}
            value={post}
            onChange={setPost}
            placeholder="docker compose up -d"
            mono
            disabled={!canEdit || !status.canRunCommands}
          />
        ) : null}
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || !dirty}
              onClick={() => void save()}
            >
              {t("common.save")}
            </Button>
            {auto && !dirty && (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !auto.enabled}
                onClick={() => void runNow()}
              >
                {t("auto.runNow")}
              </Button>
            )}
          </div>
        )}
        {auto?.enabled && auto.nextAt && (
          <p className="text-xs text-muted-foreground">
            {t("auto.next", { when: ago(auto.nextAt, language) })}
          </p>
        )}
      </div>
      <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
        {t("auto.runs")}
      </p>
      <PanelList
        empty={
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {t("auto.noRuns")}
          </p>
        }
      >
        {(auto?.runs ?? []).map((run, index) => (
          <ListRow
            key={`${run.at}:${index}`}
            stripe={index}
            title={run.message}
            badges={
              <ListBadge tone={TONE[run.outcome]}>
                {t(`auto.outcome.${run.outcome}`)}
              </ListBadge>
            }
            meta={ago(run.at, language)}
          />
        ))}
      </PanelList>
    </div>
  );
}
