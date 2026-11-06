import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, RefreshCw } from "lucide-react";
import {
  useHosts,
  usePermission,
  usePluginApi,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { RepoSummary } from "../shared/types";

const POLL_MS = 2 * 60_000;

type Entry = RepoSummary["repos"][number] & { hostId: number };

const needsAttention = (r: RepoSummary["repos"][number]) =>
  r.failing || r.conflicts > 0 || r.behind > 0 || r.changed + r.untracked > 0;

/** Dashboard card: repos that are behind, dirty or failing to pull. */
export function GitCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const api = usePluginApi();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [rows, setRows] = useState<RepoSummary[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (refresh = false) => {
      setLoading(true);
      try {
        const { data } = await api.get<RepoSummary[]>("/summary", {
          params: refresh ? { refresh: "1" } : undefined,
        });
        setRows(data);
      } catch {
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [api],
  );

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (!allowed) return null;
  if (!rows) {
    return <LoadingState compact label={t("card.loading")} />;
  }

  const total = rows.reduce((n, r) => n + r.repos.length, 0);
  const entries: Entry[] = rows
    .flatMap((r) => r.repos.map((x) => ({ ...x, hostId: r.hostId })))
    .filter(needsAttention)
    .sort(
      (a, b) =>
        Number(b.failing || b.conflicts > 0) -
        Number(a.failing || a.conflicts > 0),
    );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 px-3 pt-1">
        <span className="flex-1 text-xs text-muted-foreground">
          {t("card.summary", { count: total, attention: entries.length })}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={loading}
          onClick={() => void load(true)}
          title={t("card.refresh")}
          aria-label={t("card.refresh")}
        >
          <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">
            {total === 0 ? t("card.empty") : t("card.allClean")}
          </p>
        }
      >
        {entries.map((entry, index) => {
          const host = hosts.find((h) => Number(h.id) === entry.hostId);
          return (
            <ListRow
              key={`${entry.hostId}:${entry.path}`}
              stripe={index}
              tone={
                entry.failing || entry.conflicts ? "destructive" : "warning"
              }
              icon={<GitBranch className="size-3.5" />}
              title={entry.name}
              badges={
                <>
                  <ListBadge tone="brand">{entry.branch}</ListBadge>
                  {entry.behind > 0 && (
                    <ListBadge tone="warning">
                      <ArrowDown className="size-3" /> {entry.behind}
                    </ListBadge>
                  )}
                  {entry.ahead > 0 && (
                    <ListBadge>
                      <ArrowUp className="size-3" /> {entry.ahead}
                    </ListBadge>
                  )}
                  {entry.changed + entry.untracked > 0 && (
                    <ListBadge tone="warning">
                      {t("repos.changes", {
                        count: entry.changed + entry.untracked,
                      })}
                    </ListBadge>
                  )}
                  {entry.failing && (
                    <ListBadge tone="destructive">
                      {t("repos.autoFailing")}
                    </ListBadge>
                  )}
                </>
              }
              meta={host?.name || host?.ip || `#${entry.hostId}`}
              onClick={() => {
                if (host) tabs.openTab(host, "git");
              }}
            />
          );
        })}
      </PanelList>
    </div>
  );
}
