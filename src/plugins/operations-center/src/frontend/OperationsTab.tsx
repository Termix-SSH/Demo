import { useCallback, useEffect, useState } from "react";
import { useTranslation, type TabProps } from "@termix-ssh/plugin-sdk/frontend";
import { Button, PanelShell, Segmented } from "@termix-ssh/plugin-sdk/ui";
import { Activity, RefreshCw } from "lucide-react";
import { errorText, getCatalog, type Catalog, type CatalogAction } from "./api";
import { AllHostsView } from "./AllHostsView";
import { ApprovalsView } from "./ApprovalsView";
import type { FormValues } from "./ActionForm";
import { DriftView } from "./DriftView";
import { HistoryView } from "./HistoryView";
import { RolloutsView, type RolloutDraft } from "./RolloutsView";
import { RulesView } from "./RulesView";
import { RunView } from "./RunView";

export const VIEWS = [
  "run",
  "allHosts",
  "history",
  "approvals",
  "rollouts",
  "drift",
  "rules",
] as const;
export type View = (typeof VIEWS)[number];

interface TabData {
  view?: View;
  actionId?: string;
  hostId?: number;
  resourceKey?: string;
  resource?: string;
  runId?: string;
}

/** The Operations tab: run, see and control every action in Termix. */
export function OperationsTab({ tab, shell }: TabProps) {
  const { t, language } = useTranslation();
  const data = (tab.data ?? {}) as TabData;
  const [view, setView] = useState<View>(data.view ?? "run");
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<RolloutDraft | null>(null);
  const [openRun, setOpenRun] = useState<string | null>(data.runId ?? null);

  useEffect(() => {
    if (data.view) setView(data.view);
    if (data.runId) setOpenRun(data.runId);
  }, [data.view, data.runId]);

  const load = useCallback(
    async (fresh = false) => {
      try {
        setCatalog(await getCatalog(language, fresh));
        setError("");
      } catch (e) {
        setError(errorText(e, t("tab.failed")));
      }
    },
    [language, t],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const actions = catalog?.actions ?? [];
  const toRollout = (
    action: CatalogAction,
    input: FormValues,
    resourceKey?: string,
  ) => {
    setDraft({ actionId: action.id, input, resourceKey });
    setView("rollouts");
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <PanelShell
        icon={<Activity className="size-4" />}
        title={t("tab.title")}
        actions={
          <Button
            variant="ghost"
            size="icon"
            title={t("tab.refresh")}
            className="text-accent-brand"
            onClick={() => void load(true)}
          >
            <RefreshCw className="size-4" />
          </Button>
        }
        toolbar={
          <Segmented<View>
            value={view}
            onChange={setView}
            options={VIEWS.map((value) => ({
              value,
              label: t(`views.${value}`),
            }))}
          />
        }
        className="gap-2 p-2.5"
      >
        {error && <p className="text-sm text-destructive">{error}</p>}
        {view === "run" && (
          <RunView
            key={data.actionId ?? "run"}
            actions={actions}
            initialActionId={data.actionId}
            initialHostId={data.hostId}
            initialResourceKey={data.resourceKey}
            onRollout={toRollout}
            onOpenRun={(id) => {
              setOpenRun(id);
              setView("history");
            }}
          />
        )}
        {view === "allHosts" && (
          <AllHostsView
            resources={catalog?.resources ?? []}
            actions={actions}
            initialResource={data.resource}
            shell={shell}
          />
        )}
        {view === "history" && (
          <HistoryView
            actions={actions}
            openRunId={openRun}
            onCloseRun={() => setOpenRun(null)}
          />
        )}
        {view === "approvals" && <ApprovalsView actions={actions} />}
        {view === "rollouts" && (
          <RolloutsView
            actions={actions}
            draft={draft}
            onDraftUsed={() => setDraft(null)}
          />
        )}
        {view === "drift" && <DriftView actions={actions} />}
        {view === "rules" && <RulesView />}
      </PanelShell>
    </div>
  );
}
