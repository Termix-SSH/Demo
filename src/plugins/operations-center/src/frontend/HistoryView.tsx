import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
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
import { hostLabel } from "./hosts";
import { Choice, Pager, StateBadge, useRunPages, when } from "./parts";

const PAGE = 25;

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
  const { hosts } = useHosts();
  const [runs, setRuns] = useState<Run[]>([]);
  const [more, setMore] = useState(false);
  const [status, setStatus] = useState("");
  const [actionId, setActionId] = useState("");
  const [pickedHost, setPickedHost] = useState("");
  const [open, setOpen] = useState<Run | null>(null);
  const titleOf = (id: string) =>
    actions.find((action) => action.id === id)?.title ?? id;
  const forHost = hostId ?? (pickedHost ? Number(pickedHost) : undefined);
  const pages = useRunPages(`${status}|${actionId}|${forHost ?? ""}`);

  const actionOptions = useMemo(
    () =>
      [...actions]
        .sort(
          (a, b) =>
            a.pluginName.localeCompare(b.pluginName) ||
            a.title.localeCompare(b.title),
        )
        .map((action) => ({
          value: action.id,
          label: `${action.title} | ${action.pluginName}`,
        })),
    [actions],
  );
  const hostOptions = useMemo(
    () =>
      hosts
        .map((host) => ({ value: String(host.id), label: hostLabel(host) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [hosts],
  );

  const load = useCallback(async () => {
    try {
      const list = await listRuns({
        hostId: forHost,
        status: status || undefined,
        actionId: actionId || undefined,
        before: pages.before,
        limit: PAGE + 1,
      });
      setMore(list.length > PAGE);
      setRuns(list.slice(0, PAGE));
    } catch (error) {
      toast.error(errorText(error, t("history.failed")));
    }
  }, [forHost, status, actionId, pages.before, t, toast]);

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
      <div className="flex flex-wrap gap-2">
        <Choice
          label={t("history.action")}
          className="w-64"
          value={actionId}
          onChange={setActionId}
          options={[
            { value: "", label: t("history.allActions") },
            ...actionOptions,
          ]}
        />
        {hostId === undefined && (
          <Choice
            label={t("history.host")}
            className="w-48"
            value={pickedHost}
            onChange={setPickedHost}
            options={[
              { value: "", label: t("history.allHosts") },
              ...hostOptions,
            ]}
          />
        )}
        <Choice
          label={t("history.status")}
          className="w-40"
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
      {runs.length === 0 && pages.page === 0 ? (
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
          <Pager
            page={pages.page}
            hasNext={more}
            onPage={(next) => pages.go(next, runs[runs.length - 1]?.createdAt)}
          />
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
