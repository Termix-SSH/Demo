import { useCallback, useEffect, useState } from "react";
import {
  useHosts,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow } from "@termix-ssh/plugin-sdk/ui";
import { AlertTriangle, CheckCircle2, ShieldQuestion } from "lucide-react";
import {
  getAttention,
  getCatalog,
  getSignals,
  listApprovals,
  listRuns,
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

/**
 * Needs attention: failing tiles, waiting approvals, failed runs, drifted hosts
 * and paused rollouts, each one click from where to fix it.
 */
export function AttentionCard({ isVisible, shell }: DashboardCardProps) {
  const { t, language } = useTranslation();
  const { hosts } = useHosts();
  const [items, setItems] = useState<Item[] | null>(null);

  const load = useCallback(async () => {
    const openOps =
      (view: string, data: Record<string, unknown> = {}) =>
      () =>
        shell.openSingletonTab("operations", { data: { view, ...data } });
    const hostOf = (id: number) => hosts.find((host) => Number(host.id) === id);
    const next: Item[] = [];

    const [catalog, signals, approvals, runs, own] = await Promise.all([
      getCatalog(language).catch(() => null),
      getSignals().catch(() => []),
      listApprovals().catch(() => []),
      listRuns({ status: "failed", limit: 20 }).catch(() => []),
      getAttention().catch(() => null),
    ]);

    if (approvals.length > 0) {
      next.push({
        id: "approvals",
        title: t("attention.approvals", { count: approvals.length }),
        tone: "warn",
        open: openOps("approvals"),
      });
    }
    for (const signal of signals) {
      const declared = catalog?.signals.find((entry) => entry.id === signal.id);
      for (const read of signal.hosts) {
        const status = read.value?.status;
        if (read.state !== "ok" || (status !== "warn" && status !== "fail"))
          continue;
        const host = hostOf(read.hostId);
        next.push({
          id: `${signal.id}|${read.hostId}`,
          title: `${declared?.title ?? signal.id}: ${read.value?.label ?? ""}`,
          meta: host ? hostLabel(host) : undefined,
          tone: status,
          open: () =>
            host ? shell.openTab(host as never, "host") : openOps("allHosts")(),
        });
      }
    }
    const recent = runs.filter(
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
    setItems(next);
  }, [hosts, language, shell, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  if (items === null) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t("attention.loading")}
      </p>
    );
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
