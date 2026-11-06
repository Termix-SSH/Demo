import { useCallback, useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  EmptyState,
  InlineView,
  PanelFrame,
  PanelShell,
  RefreshButton,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { ActionResult, GitStatus, RepoInfo } from "../shared/types";
import {
  errorCode,
  errorMessage,
  getRepos,
  getStatus,
  removeRepo,
} from "./api";
import { AddRepoView } from "./AddRepoView";
import { RepoList } from "./RepoList";
import { RepoView } from "./RepoView";
import type { Runner } from "./runner";

type Screen =
  { kind: "list" } | { kind: "add" } | { kind: "repo"; path: string };

/** Hook shared by the tab and the terminal panel for running changes. */
export function useRunner(): {
  runner: Runner;
  output: React.ReactNode;
} {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    output: string;
  } | null>(null);

  const run: Runner["run"] = async (title, work, done) => {
    setBusy(true);
    try {
      const out: ActionResult = await work();
      if (out.ok) {
        toast.success(done);
        return true;
      }
      setResult({ title, output: out.output });
      return false;
    } catch (e) {
      toast.error(
        errorCode(e) === "sudo"
          ? t("tab.sudo")
          : errorMessage(e, t("actions.failed")),
      );
      return false;
    } finally {
      setBusy(false);
    }
  };

  const output = (
    <InlineView
      open={result !== null}
      onOpenChange={(open) => !open && setResult(null)}
      title={result?.title ?? ""}
      status={t("actions.failed")}
      bare
    >
      <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
        {result?.output || t("actions.noOutput")}
      </pre>
    </InlineView>
  );

  return { runner: { busy, run }, output };
}

/** The git repos of one host: state at a glance and the tools for each. */
export function GitTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [repos, setRepos] = useState<RepoInfo[] | null>(null);
  const [error, setError] = useState("");
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const { runner, output } = useRunner();

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      const [s, r] = await Promise.all([getStatus(hostId), getRepos(hostId)]);
      setStatus(s);
      setRepos(r);
      setError("");
    } catch (e) {
      setError(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
          : errorCode(e) === "sudo"
            ? t("tab.sudo")
            : errorMessage(e, t("tab.error")),
      );
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <GitBranch className="size-4" />;

  if (!status || !repos) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <LoadingState />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const back = () => {
    setScreen({ kind: "list" });
    void load();
  };

  if (screen.kind === "add") {
    return (
      <PanelFrame>
        <AddRepoView
          hostId={hostId}
          status={status}
          runner={runner}
          onClose={back}
        />
        {output}
      </PanelFrame>
    );
  }

  if (screen.kind === "repo") {
    const repo = repos.find((r) => r.path === screen.path);
    if (repo) {
      return (
        <PanelFrame>
          <RepoView
            hostId={hostId}
            repo={repo}
            status={status}
            runner={runner}
            loading={loading}
            onBack={back}
            onChanged={() => void load()}
          />
          {output}
        </PanelFrame>
      );
    }
  }

  const remove = async (repo: RepoInfo) => {
    try {
      await removeRepo(hostId, repo.path);
      toast.success(t("repos.removed", { name: repo.name }));
      void load();
    } catch (e) {
      toast.error(errorMessage(e, t("actions.failed")));
    }
  };

  const statusLine = [
    status.installed ? `git ${status.version}`.trim() : t("tab.notInstalled"),
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <RefreshButton
              onClick={() => void load()}
              loading={loading}
              label={t("tab.refresh")}
            />
            {status.canEdit && status.installed && (
              <AddButton
                label={t("repos.add")}
                onClick={() => setScreen({ kind: "add" })}
              />
            )}
          </>
        }
      >
        <div className="flex flex-1 shrink-0 flex-col">
          {!status.installed ? (
            <EmptyState
              title={t("tab.notInstalledTitle")}
              hint={t("tab.notInstalledHint")}
            />
          ) : (
            <>
              {repos.length === 0 && !status.canEdit && (
                <Alert className="border-x-0 border-t-0 text-xs">
                  {t("repos.viewOnly")}
                </Alert>
              )}
              <RepoList
                repos={repos}
                canEdit={status.canEdit && !status.readOnly}
                onOpen={(repo) => setScreen({ kind: "repo", path: repo.path })}
                onRemove={(repo) => void remove(repo)}
              />
            </>
          )}
        </div>
      </PanelShell>
      {output}
    </PanelFrame>
  );
}
