import { useCallback, useEffect, useState, type ComponentType } from "react";
import {
  usePluginPanelView,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  PanelShell,
  RefreshButton,
  SideNav,
  ViewToggle,
} from "@termix-ssh/plugin-sdk/ui";
import {
  Activity,
  GitCompare,
  History,
  LayoutDashboard,
  ListChecks,
  Rocket,
  Server,
  ShieldQuestion,
  Zap,
} from "lucide-react";
import { errorText, getCatalog, type Catalog, type CatalogAction } from "./api";
import { AllHostsView } from "./AllHostsView";
import { ApprovalsView } from "./ApprovalsView";
import type { FormValues } from "./ActionForm";
import { DriftView } from "./DriftView";
import { HistoryView } from "./HistoryView";
import { RolloutsView, type RolloutDraft } from "./RolloutsView";
import { RulesView } from "./RulesView";
import { RunView } from "./RunView";
import { HostCardsView } from "./HostCardsView";
import { OverviewView } from "./OverviewView";
import { useOpsSummary, type OpsSummary } from "./ops-summary";

export const VIEWS = [
  "overview",
  "run",
  "allHosts",
  "history",
  "approvals",
  "rollouts",
  "drift",
  "rules",
] as const;
export type View = (typeof VIEWS)[number];

const ICONS: Record<View, ComponentType<{ className?: string }>> = {
  overview: LayoutDashboard,
  run: Zap,
  allHosts: Server,
  history: History,
  approvals: ShieldQuestion,
  rollouts: Rocket,
  drift: GitCompare,
  rules: ListChecks,
};

/** The number a view's nav entry shows, and whether it is bad news. */
function badgeFor(view: View, summary: OpsSummary | null) {
  if (!summary) return null;
  if (view === "approvals" && summary.approvals)
    return { count: summary.approvals, tone: "warn" };
  if (view === "history" && summary.failed)
    return { count: summary.failed, tone: "fail" };
  if (view === "rollouts" && summary.rollouts)
    return { count: summary.rollouts, tone: "info" };
  if (view === "drift" && summary.drifted)
    return { count: summary.drifted, tone: "warn" };
  return null;
}

const TONE: Record<string, string> = {
  warn: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  fail: "bg-destructive/15 text-destructive",
  info: "bg-accent-brand/15 text-accent-brand",
};

interface TabData {
  view?: View;
  actionId?: string;
  hostId?: number;
  resourceKey?: string;
  resource?: string;
  runId?: string;
}

/** The Operations tab: run, see and control every action in Termix. */
export function OperationsTab({ tab, shell, isVisible }: TabProps) {
  const { t, language } = useTranslation();
  const data = (tab.data ?? {}) as TabData;
  const [view, setView] = useState<View>(data.view ?? "overview");
  const { summary, reload } = useOpsSummary(isVisible !== false);
  const hostsView = usePluginPanelView("hosts");
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

  const go = (next: string, extra: Record<string, unknown> = {}) => {
    if (typeof extra.runId === "string") setOpenRun(extra.runId);
    setView(next as View);
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <PanelShell
        icon={<Activity className="size-4" />}
        title={t("tab.title")}
        status={t(`views.${view}`)}
        scroll={false}
        actions={
          <>
            {view === "allHosts" && (
              <ViewToggle
                view={hostsView.view}
                onView={hostsView.setView}
                columns={
                  hostsView.view === "grid" ? hostsView.columns : undefined
                }
                onColumns={
                  hostsView.view === "grid" ? hostsView.setColumns : undefined
                }
              />
            )}
            <RefreshButton
              label={t("tab.refresh")}
              onClick={() => {
                void load(true);
                void reload();
              }}
            />
          </>
        }
      >
        <div className="flex h-full min-h-0 flex-col md:flex-row">
          <SideNav
            label={t("tab.view")}
            active={view}
            onSelect={(next) => setView(next as View)}
            entries={VIEWS.map((value) => {
              const badge = badgeFor(value, summary);
              return {
                id: value,
                icon: ICONS[value],
                label: t(`views.${value}`),
                badge: badge && (
                  <span className={`px-1 ${TONE[badge.tone]}`}>
                    {badge.count}
                  </span>
                ),
              };
            })}
          />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto thin-scrollbar">
            {error && (
              <p className="border-b border-border px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            )}
            {view === "overview" && (
              <OverviewView
                catalog={catalog}
                shell={shell}
                isVisible={isVisible !== false}
                onView={go}
              />
            )}
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
            {view === "allHosts" &&
              (hostsView.view === "grid" ? (
                <HostCardsView
                  catalog={catalog}
                  shell={shell}
                  isVisible={isVisible !== false}
                />
              ) : (
                <AllHostsView
                  resources={catalog?.resources ?? []}
                  actions={actions}
                  initialResource={data.resource}
                  shell={shell}
                />
              ))}
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
          </div>
        </div>
      </PanelShell>
    </div>
  );
}
