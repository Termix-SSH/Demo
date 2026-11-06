import { useCallback, useEffect, useState } from "react";
import { Workflow } from "lucide-react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  EmptyState,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type { AnsibleStatus } from "../shared/types";
import { AdhocView } from "./AdhocView";
import { errorCode, errorMessage, getStatus } from "./api";
import { FactsView } from "./FactsView";
import { FileEditor } from "./FileEditor";
import { Loading } from "./Loading";
import { PlaybooksView } from "./PlaybooksView";
import { RunDetail } from "./RunDetail";
import { RunForm } from "./RunForm";
import { RunsView } from "./RunsView";

type View = "playbooks" | "runs" | "adhoc" | "facts";
type Screen =
  | { kind: "list" }
  | { kind: "file"; path: string }
  | { kind: "run"; playbook: string }
  | { kind: "detail"; id: string };

/** Playbooks, runs, ad-hoc commands and facts for one control host. */
export function AnsibleTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<AnsibleStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("playbooks");
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      setError(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
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
  const icon = <Workflow className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <Loading />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const back = () => {
    setScreen({ kind: "list" });
    setTick((n) => n + 1);
  };

  if (screen.kind === "file") {
    return (
      <PanelFrame>
        <FileEditor
          hostId={hostId}
          path={screen.path}
          canEdit={status.canEdit}
          onClose={back}
        />
      </PanelFrame>
    );
  }
  if (screen.kind === "run") {
    return (
      <PanelFrame>
        <RunForm
          hostId={hostId}
          playbook={screen.playbook}
          onClose={back}
          onStarted={(run) => setScreen({ kind: "detail", id: run.id })}
        />
      </PanelFrame>
    );
  }
  if (screen.kind === "detail") {
    return (
      <PanelFrame>
        <RunDetail
          hostId={hostId}
          runId={screen.id}
          canEdit={status.canEdit}
          onClose={() => {
            setView("runs");
            back();
          }}
        />
      </PanelFrame>
    );
  }

  const statusLine = [
    status.installed ? status.version : t("tab.notInstalled"),
    status.projectDir,
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const tabs = [
    { id: "playbooks", label: t("tab.viewPlaybooks") },
    { id: "runs", label: t("tab.viewRuns") },
    ...(status.canEdit
      ? [
          { id: "adhoc", label: t("tab.viewAdhoc") },
          { id: "facts", label: t("tab.viewFacts") },
        ]
      : []),
  ];

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void load();
                setTick((n) => n + 1);
              }}
              loading={loading}
              label={t("tab.refresh")}
            />
            {status.canEdit && view === "playbooks" && (
              <AddButton
                label={t("files.add")}
                onClick={() => setScreen({ kind: "file", path: "" })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={tabs}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        <div className="flex shrink-0 flex-col">
          {!status.installed ? (
            <NoticePanel icon={Workflow} title={t("tab.notInstalledTitle")}>
              {t("tab.notInstalledHint")}
            </NoticePanel>
          ) : (
            <>
              {!status.sshpass && view !== "playbooks" && view !== "runs" && (
                <Alert className="border-x-0 border-t-0 text-xs">
                  {t("tab.noSshpass")}
                </Alert>
              )}
              {view === "playbooks" && (
                <PlaybooksView
                  key={tick}
                  hostId={hostId}
                  status={status}
                  isVisible={isVisible}
                  onEdit={(path) => setScreen({ kind: "file", path })}
                  onRun={(playbook) => setScreen({ kind: "run", playbook })}
                />
              )}
              {view === "runs" && (
                <RunsView
                  key={tick}
                  hostId={hostId}
                  isVisible={isVisible}
                  onOpen={(run) => setScreen({ kind: "detail", id: run.id })}
                />
              )}
              {view === "adhoc" && (
                <AdhocView
                  hostId={hostId}
                  onStarted={(run) => setScreen({ kind: "detail", id: run.id })}
                />
              )}
              {view === "facts" && <FactsView hostId={hostId} />}
            </>
          )}
        </div>
      </PanelShell>
    </PanelFrame>
  );
}
