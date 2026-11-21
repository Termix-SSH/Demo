import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  cn,
  getLiveHostStatus,
  getStatusClasses,
  LoadingState,
  useHostStatus,
  useShellController,
  useStatusColorScheme,
  type Host,
} from "@termix-ssh/plugin-sdk/ui";

type Status = "online" | "offline" | "unknown";

const COUNT_REFRESH_MS = 5000;

function checksOn(host: Host): boolean {
  return host.statusCheckEnabled !== false;
}

/** Hosts grouped by folder, folders and hosts sorted by name. */
export function groupByFolder(
  hosts: Host[],
): Array<{ folder: string; hosts: Host[] }> {
  const groups = new Map<string, Host[]>();
  for (const host of hosts) {
    const folder = host.folder?.trim() ?? "";
    const list = groups.get(folder) ?? [];
    list.push(host);
    groups.set(folder, list);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b)))
    .map(([folder, list]) => ({
      folder,
      hosts: list.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

export function countStatuses(
  hosts: Host[],
  read: (host: Host) => Status | null,
): Record<Status, number> {
  const counts: Record<Status, number> = { online: 0, offline: 0, unknown: 0 };
  for (const host of hosts) counts[read(host) ?? "unknown"]++;
  return counts;
}

function HostTile({ host }: { host: Host }) {
  const { t } = useTranslation();
  const scheme = useStatusColorScheme();
  const status: Status =
    useHostStatus(Number(host.id), checksOn(host)) ?? "unknown";
  return (
    <div
      data-status={status}
      className={cn(
        "flex min-w-0 items-center gap-3 border px-4 py-3",
        getStatusClasses(status, scheme, "badge"),
      )}
    >
      <span
        className={cn(
          "size-3 shrink-0 rounded-full",
          getStatusClasses(status, scheme, "dot"),
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-lg font-semibold text-foreground">
          {host.name}
        </span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {host.ip}
        </span>
      </span>
      <span className="shrink-0 text-sm font-medium">
        {t(`board.${status}`)}
      </span>
    </div>
  );
}

/** A big read only grid of every host and whether it is online. */
export function StatusBoard() {
  const { t } = useTranslation();
  const { hosts } = useShellController();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), COUNT_REFRESH_MS);
    return () => clearInterval(timer);
  }, []);

  const groups = useMemo(() => groupByFolder(hosts.list), [hosts.list]);
  const counts = countStatuses(hosts.list, (host) =>
    checksOn(host) ? getLiveHostStatus(Number(host.id)) : null,
  );

  if (!hosts.loaded) return <LoadingState label={t("board.loading")} />;
  if (hosts.list.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-2xl text-muted-foreground">
        {t("board.noHosts")}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <div className="flex shrink-0 items-baseline gap-8 border-b border-border px-6 py-4">
        {(["online", "offline", "unknown"] as const).map((status) => (
          <div key={status} className="flex items-baseline gap-2">
            <span
              className="text-4xl font-bold tabular-nums"
              data-count={status}
            >
              {counts[status]}
            </span>
            <span className="text-sm text-muted-foreground">
              {t(`board.${status}`)}
            </span>
          </div>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {t("board.updated", { time: now.toLocaleTimeString() })}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {groups.map((group) => (
          <section key={group.folder || "-"} className="mb-4">
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.folder || t("board.noFolder")}
            </h3>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-2">
              {group.hosts.map((host) => (
                <HostTile key={host.id} host={host} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
