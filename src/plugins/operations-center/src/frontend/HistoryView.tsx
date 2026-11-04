import { useCallback, useEffect, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  InlineView,
  ListRow,
} from "@termix-ssh/plugin-sdk/ui";
import { History } from "lucide-react";
import {
  cancelRun,
  errorText,
  getRun,
  listRuns,
  undoRun,
  type CatalogAction,
  type Run,
} from "./api";
import { Choice, StateBadge, when } from "./parts";

function originLabel(t: (key: string) => string, run: Run): string {
  const origin = run.origin;
  if (!origin) return "";
  if (origin.kind === "plugin") return t(`origin.${origin.via ?? "plugin"}`);
  return t(`origin.${origin.kind}`);
}

/** Every run the user may see, newest first, with each one's detail. */
export function HistoryView({
  actions,
  hostId,
  openRunId,
  onCloseRun,
}: {
  actions: CatalogAction[];
  hostId?: number;
  openRunId?: string | null;
  onCloseRun?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [runs, setRuns] = useState<Run[]>([]);
  const [status, setStatus] = useState("");
  const [open, setOpen] = useState<Run | null>(null);
  const titleOf = (id: string) =>
    actions.find((action) => action.id === id)?.title ?? id;

  const load = useCallback(async () => {
    try {
      setRuns(
        await listRuns({ hostId, status: status || undefined, limit: 100 }),
      );
    } catch (error) {
      toast.error(errorText(error, t("history.failed")));
    }
  }, [hostId, status, t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  useEffect(() => {
    if (!openRunId) return;
    void getRun(openRunId)
      .then(setOpen)
      .catch(() => {});
  }, [openRunId]);

  const close = () => {
    setOpen(null);
    onCloseRun?.();
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      if (open) setOpen(await getRun(open.id));
    } catch (error) {
      toast.error(errorText(error, t("history.failed")));
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex gap-2">
        <Choice
          label={t("history.status")}
          value={status}
          onChange={setStatus}
          options={[
            { value: "", label: t("history.all") },
            ...[
              "success",
              "failed",
              "pending_approval",
              "running",
              "interrupted",
              "rejected",
            ].map((value) => ({ value, label: t(`state.${value}`) })),
          ]}
        />
      </div>
      {runs.length === 0 ? (
        <EmptyState icon={History} title={t("history.empty")} />
      ) : (
        <div className="flex flex-col gap-1 overflow-auto">
          {runs.map((run) => (
            <ListRow
              key={run.id}
              title={titleOf(run.actionId)}
              meta={[
                run.hostName,
                run.username,
                originLabel(t, run),
                when(run.createdAt),
              ]
                .filter(Boolean)
                .join(" | ")}
              badges={
                <>
                  <StateBadge state={run.status} />
                  {run.dryRun && <StateBadge state="dry_run" />}
                </>
              }
              onClick={() => setOpen(run)}
            />
          ))}
        </div>
      )}

      <InlineView
        open={!!open}
        onOpenChange={(next) => !next && close()}
        title={open ? titleOf(open.actionId) : ""}
        status={open ? <StateBadge state={open.status} /> : undefined}
        actions={
          open && (
            <>
              {open.status === "running" ||
              open.status === "pending_approval" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void act(() => cancelRun(open.id))}
                >
                  {t("history.cancel")}
                </Button>
              ) : null}
              {open.undoAvailable && open.status === "success" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void act(() => undoRun(open.id))}
                >
                  {t("history.undo")}
                </Button>
              )}
            </>
          )
        }
      >
        {open && (
          <div className="flex flex-col gap-2 text-xs">
            <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
              <dt className="text-muted-foreground">{t("history.host")}</dt>
              <dd>{open.hostName ?? "-"}</dd>
              <dt className="text-muted-foreground">{t("history.by")}</dt>
              <dd>
                {open.username} | {originLabel(t, open)}
              </dd>
              <dt className="text-muted-foreground">{t("history.started")}</dt>
              <dd>{when(open.createdAt)}</dd>
              <dt className="text-muted-foreground">{t("history.finished")}</dt>
              <dd>{when(open.finishedAt) || "-"}</dd>
              <dt className="text-muted-foreground">{t("history.result")}</dt>
              <dd>{open.summary ?? open.error ?? "-"}</dd>
            </dl>
            <h4 className="font-medium">{t("history.input")}</h4>
            <pre className="overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]">
              {JSON.stringify(open.input ?? {}, null, 2)}
            </pre>
            {open.output !== undefined && open.output !== null && (
              <>
                <h4 className="font-medium">{t("history.output")}</h4>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]">
                  {JSON.stringify(open.output, null, 2)}
                </pre>
              </>
            )}
          </div>
        )}
      </InlineView>
    </div>
  );
}
