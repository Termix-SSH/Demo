import { useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CloudDownload,
  GitBranch,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type { GitStatus, RepoInfo } from "../shared/types";
import { fetchRepo, pullRepo, pushRepo } from "./api";
import { AutoPullView } from "./AutoPullView";
import { BranchesView } from "./BranchesView";
import { ChangesView } from "./ChangesView";
import { HistoryView } from "./HistoryView";
import type { Runner } from "./runner";
import { StashView } from "./StashView";

type View = "changes" | "branches" | "history" | "stash" | "auto";

/** One repo: changes, branches, history, stash and auto pull. */
export function RepoView({
  hostId,
  repo,
  status,
  runner,
  loading,
  onBack,
  onChanged,
}: {
  hostId: number;
  repo: RepoInfo;
  status: GitStatus;
  runner: Runner;
  loading: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<View>("changes");
  const [tick, setTick] = useState(0);
  const canEdit = status.canEdit && !status.readOnly;

  const changed = () => {
    setTick((n) => n + 1);
    onChanged();
  };

  const net = (
    title: string,
    work: () => ReturnType<typeof fetchRepo>,
    done: string,
  ) => void runner.run(title, work, done).then((ok) => ok && changed());

  const line = [
    repo.branch || t("repos.detached"),
    repo.upstream,
    repo.ahead ? t("repo.ahead", { count: repo.ahead }) : "",
    repo.behind ? t("repo.behind", { count: repo.behind }) : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <PanelShell
      icon={<GitBranch className="size-4" />}
      leading={<BackButton onClick={onBack} label={t("common.back")} />}
      title={repo.name}
      status={line}
      actions={
        <>
          <RefreshButton
            onClick={changed}
            loading={loading}
            label={t("tab.refresh")}
          />
          {canEdit && (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={runner.busy}
                onClick={() =>
                  net(
                    t("repo.fetch"),
                    () => fetchRepo(hostId, repo.path),
                    t("repo.fetched"),
                  )
                }
              >
                <CloudDownload className="size-4" />
                {t("repo.fetch")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={runner.busy}
                onClick={() =>
                  net(
                    t("repo.pull"),
                    () => pullRepo(hostId, repo.path),
                    t("repo.pulled"),
                  )
                }
              >
                <ArrowDownToLine className="size-4" />
                {t("repo.pull")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={runner.busy}
                onClick={() =>
                  net(
                    t("repo.push"),
                    () => pushRepo(hostId, repo.path),
                    t("repo.pushed"),
                  )
                }
              >
                <ArrowUpFromLine className="size-4" />
                {t("repo.push")}
              </Button>
            </>
          )}
        </>
      }
      tabs={
        <TabStrip
          tabs={[
            { id: "changes", label: t("repo.viewChanges") },
            { id: "branches", label: t("repo.viewBranches") },
            { id: "history", label: t("repo.viewHistory") },
            { id: "stash", label: t("repo.viewStash") },
            { id: "auto", label: t("repo.viewAuto") },
          ]}
          activeTab={view}
          onTabChange={(id) => setView(id as View)}
        />
      }
    >
      <div className="flex flex-1 shrink-0 flex-col">
        {view === "changes" ? (
          <ChangesView
            hostId={hostId}
            path={repo.path}
            canEdit={canEdit}
            runner={runner}
            tick={tick}
            onChanged={changed}
          />
        ) : view === "branches" ? (
          <BranchesView
            hostId={hostId}
            path={repo.path}
            canEdit={canEdit}
            runner={runner}
            tick={tick}
            onChanged={changed}
          />
        ) : view === "history" ? (
          <HistoryView hostId={hostId} path={repo.path} tick={tick} />
        ) : view === "stash" ? (
          <StashView
            hostId={hostId}
            path={repo.path}
            canEdit={canEdit}
            runner={runner}
            tick={tick}
            onChanged={changed}
          />
        ) : (
          <AutoPullView
            hostId={hostId}
            repo={repo}
            status={status}
            onChanged={changed}
          />
        )}
      </div>
    </PanelShell>
  );
}
