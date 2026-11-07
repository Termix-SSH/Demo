import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Boxes, X } from "lucide-react";
import {
  useCurrentUser,
  useHosts,
  useTabs,
  useToast,
  useTranslation,
  type CompanionProps,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ManagerCardShell,
  PanelList,
  PanelSearch,
  ToolbarBand,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { ManagersView, ProcessList, ProcessRow } from "../shared/types";
import { errorMessage, getApps, getProcesses, signalProcess } from "./api";
import { appTone, filterRows, processTone, sortRows, span } from "./format";
import { canEditHost, processesEnabled } from "./enabled";
import { LogPane } from "./LogPane";

const POLL_MS = 10_000;

/** Process list for the small surfaces, refreshed while visible. */
export function useProcesses(
  hostId: number | null,
  enabled: boolean,
  visible: boolean,
) {
  const { t } = useTranslation();
  const [list, setList] = useState<ProcessList | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!enabled || hostId == null) return;
    setLoading(true);
    try {
      setList(await getProcesses(hostId));
      setError("");
    } catch (e) {
      setError(errorMessage(e, t("list.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [enabled, hostId, t]);

  useEffect(() => {
    if (!visible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [visible, load]);

  return { list, error, loading, reload: load };
}

function useStop(hostId: number | null, onDone: () => void) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  return async (p: ProcessRow) => {
    if (hostId == null) return;
    const ok = await confirm({
      title: t("signal.confirm.TERM", { pid: p.pid }),
      description: t("signal.confirmDesc", { name: p.command }),
      confirmLabel: t("signal.TERM"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await signalProcess(hostId, p.pid, "TERM", p.command);
      toast.success(t("signal.sent", { signal: "TERM", pid: p.pid }));
      onDone();
    } catch (e) {
      toast.error(errorMessage(e, t("signal.failed")));
    }
  };
}

function Rows({
  rows,
  canEdit,
  onStop,
  onOpen,
}: {
  rows: ProcessRow[];
  canEdit: boolean;
  onStop: (p: ProcessRow) => void;
  onOpen: (p: ProcessRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("list.empty")}</p>
      }
    >
      {rows.map((p, index) => (
        <ListRow
          key={p.pid}
          stripe={index}
          tone={processTone(p)}
          icon={<Activity className="size-3.5" />}
          title={<span className="font-mono text-xs">{p.command}</span>}
          badges={<ListBadge tone="muted">{p.pid}</ListBadge>}
          meta={`${p.user} | ${p.cpu.toFixed(1)}% | ${p.mem.toFixed(1)}% ${t("list.mem")} | ${span(p.age)}`}
          onClick={() => onOpen(p)}
          trailing={
            canEdit ? (
              <Button
                variant="ghost"
                size="icon"
                title={t("signal.TERM")}
                onClick={(e) => {
                  e.stopPropagation();
                  onStop(p);
                }}
              >
                <X className="size-4" />
              </Button>
            ) : undefined
          }
        />
      ))}
    </PanelList>
  );
}

/** The Processes card Host Metrics shows in its manager cards. */
export function ProcessCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const user = useCurrentUser();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && processesEnabled(host);
  const { list, error, loading, reload } = useProcesses(hostId, on, true);
  const [filter, setFilter] = useState("");
  const stop = useStop(hostId, () => void reload());

  const rows = useMemo(
    () =>
      sortRows(filterRows(list?.processes ?? [], filter), "cpu").slice(0, 25),
    [list, filter],
  );

  if (!host || hostId == null) return null;
  return (
    <ManagerCardShell
      title={t("card.metricsTitle")}
      icon={<Activity className="size-3.5" />}
      loading={loading}
      error={error ? { message: error } : null}
      onRefresh={() => void reload()}
      empty={!on}
      emptyMessage={t("manager.disabled")}
    >
      <PanelSearch
        value={filter}
        onChange={setFilter}
        placeholder={t("list.search")}
      />
      <Rows
        rows={rows}
        canEdit={canEditHost(host, !!user?.isAdmin)}
        onStop={(p) => void stop(p)}
        onOpen={() => tabs.openTab(host as never, "process-manager")}
      />
    </ManagerCardShell>
  );
}

/** A tile for the host page: the busiest processes and any app that is down. */
export function HostTile({
  hostId,
  host,
  isVisible = true,
}: {
  hostId: number;
  host?: PluginHostRecord;
  isVisible?: boolean;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const on = processesEnabled(host);
  const { list, error } = useProcesses(hostId, on, isVisible);
  const [apps, setApps] = useState<ManagersView | null>(null);

  useEffect(() => {
    if (!on || !isVisible) return;
    void getApps(hostId)
      .then(setApps)
      .catch(() => setApps(null));
  }, [on, isVisible, hostId]);

  if (!on) {
    return (
      <div className="flex h-full flex-col p-3 text-xs text-muted-foreground">
        {t("manager.disabled")}
      </div>
    );
  }
  const down = (apps?.apps ?? []).filter((a) => a.health === "down");
  const rows = sortRows(list?.processes ?? [], "cpu").slice(0, 6);
  return (
    <div className="flex h-full min-h-0 flex-col overflow-auto">
      {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
      {down.length > 0 && (
        <div className="border-b border-border px-3 py-1.5">
          {down.map((app) => (
            <div
              key={`${app.manager}:${app.key}`}
              className="flex gap-2 text-xs"
            >
              <Boxes className="size-3.5 text-destructive" />
              <span className="font-mono">{app.name}</span>
              <ListBadge tone={appTone(app)}>{app.status}</ListBadge>
            </div>
          ))}
        </div>
      )}
      <Rows
        rows={rows}
        canEdit={false}
        onStop={() => undefined}
        onOpen={() => host && tabs.openTab(host, "process-manager")}
      />
    </div>
  );
}

/** A compact list beside a terminal, with the picked process's log. */
export function ProcessesCompanion({
  host,
  isVisible,
}: Pick<CompanionProps, "host" | "isVisible">) {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const tabs = useTabs();
  const hostId = host ? Number(host.id) : null;
  const { list, error, reload } = useProcesses(
    hostId,
    !!host && processesEnabled(host),
    isVisible,
  );
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<ProcessRow | null>(null);
  const stop = useStop(hostId, () => void reload());

  const rows = useMemo(
    () =>
      sortRows(filterRows(list?.processes ?? [], filter), "cpu").slice(0, 100),
    [list, filter],
  );
  if (!host) return null;
  const canEdit = canEditHost(host, !!user?.isAdmin);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ToolbarBand className="flex-nowrap">
        <PanelSearch
          value={filter}
          onChange={setFilter}
          placeholder={t("list.search")}
          className="min-w-0 flex-1"
        />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => tabs.openTab(host, "process-manager")}
        >
          {t("companion.open")}
        </Button>
      </ToolbarBand>
      {error && <p className="px-3 py-1 text-xs text-destructive">{error}</p>}
      <div className="min-h-0 flex-1 overflow-auto">
        <Rows
          rows={rows}
          canEdit={canEdit}
          onStop={(p) => void stop(p)}
          onOpen={setPicked}
        />
      </div>
      {picked && (
        <div className="flex h-56 min-h-0 flex-col border-t border-border">
          <div className="flex items-center justify-between px-3 py-1 text-xs">
            <span className="font-mono">
              {picked.command} ({picked.pid})
            </span>
            <Button variant="ghost" size="xs" onClick={() => setPicked(null)}>
              {t("companion.close")}
            </Button>
          </div>
          <LogPane
            host={host}
            target={{ kind: "journal-pid", pid: picked.pid }}
            isVisible={isVisible}
            compact
          />
        </div>
      )}
    </div>
  );
}
