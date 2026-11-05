import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useHosts,
  useTranslation,
  type DashboardCardEntry,
  type DashboardCardProps,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, StatusDot } from "@termix-ssh/plugin-sdk/ui";
import { getCatalog, getSignals, type Catalog, type SignalRead } from "../api";
import { appliesTo, hostLabel } from "../hosts";
import { Choice } from "../parts";
import { ActionTile } from "./ActionTile";
import { SignalView, statusOf } from "./SignalView";

/** Dashboard card ids, declared in the manifest. */
export const SIGNAL_CARD = "ops-signal";
export const ACTION_CARD = "ops-action";

const RANK: Record<string, number> = { fail: 0, warn: 1, unknown: 2, ok: 3 };

/** What the dashboard's add list offers: every signal and every action. */
export async function signalEntries(
  language: string,
): Promise<DashboardCardEntry[]> {
  const catalog = await getCatalog(language).catch(() => null);
  if (!catalog) return [];
  const names = pluginNames(catalog);
  return catalog.signals.map((signal) => ({
    key: signal.id,
    title: signal.title,
    group: names.get(signal.pluginId) ?? signal.pluginId,
    kind: "signal",
    config: { signal: signal.id },
    defaultSize: { w: signal.scope === "host" ? 4 : 3 },
  }));
}

export async function actionEntries(
  language: string,
): Promise<DashboardCardEntry[]> {
  const catalog = await getCatalog(language).catch(() => null);
  if (!catalog) return [];
  return catalog.actions
    .filter((action) => action.scope !== "resource")
    .map((action) => ({
      key: action.id,
      title: action.title,
      description: action.description,
      group: action.pluginName,
      kind: "action",
      config: { action: action.id },
      defaultSize: { w: 3 },
    }));
}

function pluginNames(catalog: Catalog) {
  const names = new Map<string, string>();
  for (const action of catalog.actions)
    names.set(action.pluginId, action.pluginName);
  return names;
}

function useCatalog(): Catalog | null {
  const { language } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    void getCatalog(language)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [language]);
  return catalog;
}

function HostChoice({
  hosts,
  value,
  onChange,
  allowAll,
}: {
  hosts: PluginHostRecord[];
  value: number | undefined;
  onChange: (hostId: number | undefined) => void;
  allowAll?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Choice
      label={t("tiles.host")}
      className="w-full"
      value={value === undefined ? "" : String(value)}
      onChange={(next) => onChange(next ? Number(next) : undefined)}
      options={[
        ...(allowAll || value === undefined
          ? [
              {
                value: "",
                label: allowAll ? t("tiles.allHosts") : t("tiles.pickHost"),
              },
            ]
          : []),
        ...hosts.map((host) => ({
          value: String(host.id),
          label: hostLabel(host),
        })),
      ]}
    />
  );
}

/**
 * One signal on the dashboard: for a host signal, how every host is doing
 * (worst first) or just one host; for a server signal, its reading.
 */
export function SignalCard({
  isVisible,
  shell,
  config,
  setConfig,
  editMode,
}: DashboardCardProps) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const { hosts } = useHosts();
  const signalId = String(config?.signal ?? "");
  const hostId = typeof config?.hostId === "number" ? config.hostId : undefined;
  const signal = catalog?.signals.find((entry) => entry.id === signalId);
  const [read, setRead] = useState<SignalRead | null>(null);

  const load = useCallback(async () => {
    const list = await getSignals(
      hostId !== undefined ? [hostId] : undefined,
    ).catch(() => null);
    setRead(list?.find((entry) => entry.id === signalId) ?? null);
  }, [hostId, signalId]);
  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const rows = useMemo(
    () =>
      (read?.hosts ?? [])
        .map((entry) => ({
          entry,
          host: hosts.find((host) => Number(host.id) === entry.hostId),
          status: entry.state === "ok" ? statusOf(entry.value) : "unknown",
        }))
        .filter((row) => row.host)
        .sort((a, b) => RANK[a.status] - RANK[b.status]),
    [read, hosts],
  );

  if (catalog && !signal)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("tiles.gone")}</p>
    );

  const picker =
    editMode && signal?.scope === "host" ? (
      <div className="p-2">
        <HostChoice
          hosts={hosts}
          allowAll
          value={hostId}
          onChange={(next) =>
            setConfig?.({
              signal: signalId,
              ...(next !== undefined ? { hostId: next } : {}),
            })
          }
        />
      </div>
    ) : null;

  if (!signal || signal.scope === "server" || hostId !== undefined) {
    const one =
      hostId !== undefined
        ? read?.hosts.find((entry) => entry.hostId === hostId)
        : undefined;
    return (
      <div className="flex h-full flex-col">
        {picker}
        <SignalView
          kind={signal?.kind ?? "status"}
          result={hostId !== undefined ? one?.value : read?.result}
          state={
            hostId !== undefined
              ? (one?.state ?? "loading")
              : read
                ? "ok"
                : "loading"
          }
        />
      </div>
    );
  }

  const tally = { ok: 0, warn: 0, fail: 0 } as Record<string, number>;
  for (const row of rows) if (row.status in tally) tally[row.status]++;

  return (
    <div className="flex h-full flex-col">
      {picker}
      <div className="flex gap-3 border-b border-border px-3 py-1.5 text-xs">
        <span className="text-destructive">
          {t("tiles.failCount", { count: tally.fail })}
        </span>
        <span className="text-amber-600 dark:text-amber-400">
          {t("tiles.warnCount", { count: tally.warn })}
        </span>
        <span className="text-emerald-600 dark:text-emerald-400">
          {t("tiles.okCount", { count: tally.ok })}
        </span>
      </div>
      <div className="flex flex-col">
        {rows.slice(0, 20).map(({ entry, host, status }) => (
          <ListRow
            key={entry.hostId}
            title={hostLabel(host!)}
            meta={
              entry.state === "ok"
                ? (entry.value?.label ?? String(entry.value?.value ?? ""))
                : t(`state.${entry.state}`)
            }
            badges={<StatusDot state={status} />}
            onClick={() => shell.openTab(host as never, "host")}
          />
        ))}
        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">
            {read ? t("tiles.noHosts") : t("state.loading")}
          </p>
        )}
      </div>
    </div>
  );
}

/** One action as a button on the dashboard, for a host picked once. */
export function ActionCard({ config, setConfig }: DashboardCardProps) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const { hosts } = useHosts();
  const actionId = String(config?.action ?? "");
  const hostId = typeof config?.hostId === "number" ? config.hostId : undefined;
  const action = catalog?.actions.find((entry) => entry.id === actionId);
  if (!catalog)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("state.loading")}</p>
    );
  if (!action)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("tiles.gone")}</p>
    );
  const fits = hosts.filter((host) => appliesTo(action, host));
  const needsHost = action.scope !== "server";
  return (
    <div className="flex h-full flex-col">
      {needsHost && (
        <div className="p-2 pb-0">
          <HostChoice
            hosts={fits}
            value={hostId}
            onChange={(next) =>
              setConfig?.({
                action: actionId,
                ...(next !== undefined ? { hostId: next } : {}),
              })
            }
          />
        </div>
      )}
      {(!needsHost || hostId !== undefined) && (
        <ActionTile
          key={`${actionId}-${hostId}`}
          action={action}
          hostId={hostId}
        />
      )}
    </div>
  );
}
