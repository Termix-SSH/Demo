import { useEffect, useState } from "react";
import { History, Plus, Workflow, Zap } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Facts, PANEL, PanelShell } from "@/components/panel-layout";
import { FakeSwitch } from "@/components/section-card";
import { TabStrip } from "@/components/tab-strip";
import { getAutomationRuns, getAutomations } from "@/demo/demo-api";
import type { DemoAutomation, DemoAutomationRun } from "@/demo/demo-data";
import { timeAgo } from "@/lib/relative-time";

/**
 * Mirrors the real AutomationsPanel: what runs, and what happened when it ran.
 *
 * The trigger is the first thing you look for on an automation, so it sits on
 * the row rather than behind an edit screen.
 */

type Section = "automations" | "runs";

const STATUS_CLASS: Record<DemoAutomationRun["status"], string> = {
  success: "text-accent-brand border-accent-brand/40 bg-accent-brand/10",
  failed: "text-destructive border-destructive/40 bg-destructive/10",
  skipped: "text-muted-foreground border-border bg-muted/30",
};

export function DemoAutomations({ chrome = true }: { chrome?: boolean }) {
  const [section, setSection] = useState<Section>("automations");
  const [rows, setRows] = useState<DemoAutomation[]>([]);
  const [runs, setRuns] = useState<DemoAutomationRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAutomations(), getAutomationRuns()]).then(
      ([automations, history]) => {
        if (cancelled) return;
        setRows(automations);
        setRuns(history);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const enabledCount = rows.filter((row) => row.enabled).length;

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Workflow className="size-4" />}
      title="Automations"
      status={`${enabledCount} of ${rows.length} on`}
      actions={
        <Button variant="ghost" size="icon-xs" title="New automation">
          <Plus className="size-4" />
        </Button>
      }
      tabs={
        <TabStrip
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
          tabs={[
            {
              id: "automations",
              label: "Automations",
              icon: <Workflow className="size-3" />,
            },
            {
              id: "runs",
              label: "Runs",
              icon: <History className="size-3" />,
            },
          ]}
        />
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {section === "automations" &&
        (rows.length === 0 ? (
          <EmptyState
            icon={Workflow}
            title="No automations"
            hint="Run snippets on a schedule and get told how they went."
          />
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className={`flex items-center gap-3 border border-border px-3 py-2 ${
                row.enabled ? "" : "opacity-60"
              }`}
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-semibold">
                  {row.name}
                </span>
                <Facts className="text-[10px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <Zap className="size-2.5" />
                    {row.trigger}
                  </span>
                  <span>
                    {row.stepCount} {row.stepCount === 1 ? "step" : "steps"}
                  </span>
                  {row.lastRun ? (
                    <span>Ran {timeAgo(row.lastRun, "just now")}</span>
                  ) : (
                    <span>Never run</span>
                  )}
                </Facts>
              </div>
              <FakeSwitch
                checked={row.enabled}
                onChange={(next) =>
                  setRows((prev) =>
                    prev.map((r) =>
                      r.id === row.id ? { ...r, enabled: next } : r,
                    ),
                  )
                }
              />
            </div>
          ))
        ))}

      {section === "runs" &&
        (runs.length === 0 ? (
          <EmptyState icon={History} title="Nothing has run yet" />
        ) : (
          runs.map((run) => (
            <div
              key={run.id}
              className="flex items-center gap-2 border border-border px-3 py-2"
            >
              <span
                className={`shrink-0 border px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATUS_CLASS[run.status]}`}
              >
                {run.status}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">
                  {run.automationName}
                </span>
                <Facts className="text-[10px] text-muted-foreground">
                  <span>{run.hostName}</span>
                  <span>{timeAgo(run.at, "just now")}</span>
                  <span>{run.durationSeconds}s</span>
                </Facts>
              </div>
            </div>
          ))
        ))}
    </PanelShell>
  );
}
