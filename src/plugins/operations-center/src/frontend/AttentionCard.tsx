import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useHosts,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import { AlertTriangle, CheckCircle2, ShieldQuestion } from "lucide-react";
import {
  getAttention,
  getCatalog,
  getSignals,
  listApprovals,
  listRuns,
  WARMING_POLL_MS,
  type Catalog,
  type SignalRead,
} from "./api";
import { hostLabel } from "./hosts";

interface Item {
  id: string;
  title: string;
  meta?: string;
  tone: "warn" | "fail";
  open: () => void;
}

const SINCE_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 30_000;

interface Sources {
  catalog?: Catalog | null;
  signals?: SignalRead[];
  approvals?: Awaited<ReturnType<typeof listApprovals>>;
  runs?: Awaited<ReturnType<typeof listRuns>>;
  own?: Awaited<ReturnType<typeof getAttention>> | null;
}

/**
 * Needs attention: failing tiles, waiting approvals, failed runs, drifted hosts
 * and paused rollouts, each one click from where to fix it.
 */
export function AttentionCard({ isVisible, shell }: DashboardCardProps) {
  const { t, language } = useTranslation();
  const { hosts } = useHosts();
  const [data, setData] = useState<Sources>({});
  const shellRef = useRef(shell);
  shellRef.current = shell;

  // Each source shows as soon as it answers; the slow ones fill in after.
  const load = useCallback(() => {
    const take =
      <K extends keyof Sources>(key: K) =>
      (value: Sources[K]) =>
        setData((prev) => ({ ...prev, [key]: value }));
    return Promise.all([
      getCatalog(language)
        .catch(() => null)
        .then(take("catalog")),
      getSignals()
        .catch(() => [])
        .then(take("signals")),
      listApprovals()
        .catch(() => [])
        .then(take("approvals")),
      listRuns({ status: "failed", limit: 20 })
        .catch(() => [])
        .then(take("runs")),
      getAttention()
        .catch(() => null)
        .then(take("own")),
    ]);
  }, [language]);

  const warming = !!data.signals?.some((signal) =>
    signal.hosts.some((read) => read.state === "loading"),
  );

  useEffect(() => {
    if (!isVisible) return;
    void load();
  }, [isVisible, load]);
  useEffect(() => {
    if (!isVisible) return;
    const timer = setInterval(
      () => void load(),
      warming ? WARMING_POLL_MS : POLL_MS,
    );
    return () => clearInterval(timer);
  }, [isVisible, load, warming]);

  const items = useMemo(() => {
    const openOps =
      (view: string, extra: Record<string, unknown> = {}) =>
      () =>
        shellRef.current.openSingletonTab("operations", {
          data: { view, ...extra },
        });
    const hostOf = (id: number) => hosts.find((host) => Number(host.id) === id);
    const next: Item[] = [];
    const { catalog, signals, approvals, runs, own } = data;

    if (approvals && approvals.length > 0) {
      next.push({
        id: "approvals",
        title: t("attention.approvals", { count: approvals.length }),
        tone: "warn",
        open: openOps("approvals"),
      });
    }
    for (const signal of signals ?? []) {
      const declared = catalog?.signals.find((entry) => entry.id === signal.id);
      for (const read of signal.hosts) {
        const status = read.value?.status;
        if (read.state !== "ok" || (status !== "warn" && status !== "fail"))
          continue;
        const host = hostOf(read.hostId);
        const name = declared?.title ?? signal.id;
        // Label first, then a plain value, and no colon when there is neither.
        const shown =
          read.value?.label ??
          (typeof read.value?.value === "number" ||
          typeof read.value?.value === "string"
            ? String(read.value.value)
            : "");
        next.push({
          id: `${signal.id}|${read.hostId}`,
          title: shown ? `${name}: ${shown}` : name,
          meta: host ? hostLabel(host) : undefined,
          tone: status,
          open: () =>
            host
              ? shellRef.current.openTab(host as never, "host")
              : openOps("allHosts")(),
        });
      }
    }
    const recent = (runs ?? []).filter(
      (run) => Date.now() - Date.parse(run.createdAt) < SINCE_MS,
    );
    if (recent.length > 0) {
      next.push({
        id: "failed",
        title: t("attention.failed", { count: recent.length }),
        tone: "fail",
        open: openOps("history"),
      });
    }
    if (own && own.drifted > 0) {
      next.push({
        id: "drift",
        title: t("attention.drifted", { count: own.drifted }),
        tone: "warn",
        open: openOps("drift"),
      });
    }
    for (const rollout of own?.rollouts ?? []) {
      next.push({
        id: `rollout|${rollout.id}`,
        title: t("attention.rollout", { name: rollout.name }),
        meta: rollout.reason ?? undefined,
        tone: "warn",
        open: openOps("rollouts"),
      });
    }
    return next;
  }, [data, hosts, t]);

  const done =
    "catalog" in data &&
    "signals" in data &&
    "approvals" in data &&
    "runs" in data &&
    "own" in data;

  if (items.length === 0 && (!done || warming)) {
    return <LoadingState compact label={t("attention.loading")} />;
  }
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <CheckCircle2 className="size-4 text-emerald-500" />
        {t("attention.allGood")}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 overflow-auto p-1">
      {items.map((item) => (
        <ListRow
          key={item.id}
          title={item.title}
          meta={item.meta}
          icon={
            item.id === "approvals" ? (
              <ShieldQuestion className="size-4 text-amber-500" />
            ) : (
              <AlertTriangle
                className={`size-4 ${item.tone === "fail" ? "text-destructive" : "text-amber-500"}`}
              />
            )
          }
          onClick={item.open}
        />
      ))}
    </div>
  );
}
