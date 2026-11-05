import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useHosts,
  useHostStatus,
  usePluginPanelView,
  useTranslation,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  Input,
  StatusDot,
  TileWall,
} from "@termix-ssh/plugin-sdk/ui";
import { Server } from "lucide-react";
import { getSignals, type Catalog, type SignalRead } from "./api";
import { hostLabel, splitTags } from "./hosts";
import { statusOf } from "./tiles/SignalView";

const RANK: Record<string, number> = { fail: 0, warn: 1, unknown: 2, ok: 3 };
const DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-destructive",
  unknown: "bg-muted-foreground",
};
const COLUMNS: Record<string, string> = {
  "1": "grid-cols-1",
  "2": "grid-cols-2",
  "3": "grid-cols-3",
  "4": "grid-cols-4",
  "5": "grid-cols-5",
  "6": "grid-cols-6",
};

/** Every host as a card with its status tiles, worst first. A click opens its page. */
export function HostCardsView({
  catalog,
  shell,
  isVisible,
}: {
  catalog: Catalog | null;
  shell: ShellApi;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const panel = usePluginPanelView("hosts");
  const [signals, setSignals] = useState<SignalRead[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const list = await getSignals().catch(() => null);
    if (list) setSignals(list);
  }, []);
  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const cards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hosts
      .filter(
        (host) =>
          !needle ||
          hostLabel(host).toLowerCase().includes(needle) ||
          String(host.ip ?? "").includes(needle) ||
          splitTags(host.tags).some((tag) =>
            tag.toLowerCase().includes(needle),
          ),
      )
      .map((host) => {
        const tiles = signals
          .map((signal) => {
            const read = signal.hosts.find(
              (entry) => entry.hostId === Number(host.id),
            );
            if (!read || read.state !== "ok") return null;
            return {
              id: signal.id,
              title:
                catalog?.signals.find((s) => s.id === signal.id)?.title ??
                signal.id,
              status: statusOf(read.value),
              label: read.value?.label ?? String(read.value?.value ?? ""),
            };
          })
          .filter((tile): tile is NonNullable<typeof tile> => !!tile);
        const worst = tiles.reduce(
          (best, tile) => (RANK[tile.status] < RANK[best] ? tile.status : best),
          "ok",
        );
        return { host, tiles, worst: tiles.length ? worst : "unknown" };
      })
      .sort(
        (a, b) =>
          RANK[a.worst] - RANK[b.worst] ||
          hostLabel(a.host).localeCompare(hostLabel(b.host)),
      );
  }, [hosts, signals, catalog, query]);

  const grid =
    panel.columns === "auto"
      ? "grid-cols-[repeat(auto-fill,minmax(16rem,1fr))]"
      : (COLUMNS[panel.columns] ?? "grid-cols-3");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-3 py-2">
        <Input
          className="w-64"
          value={query}
          placeholder={t("hostCards.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {cards.length === 0 ? (
        <EmptyState icon={Server} title={t("hostCards.none")} />
      ) : (
        <div className="min-h-0 overflow-auto thin-scrollbar">
          <TileWall gridClassName={grid}>
            {cards.map(({ host, tiles, worst }) => (
              <HostCard
                key={host.id}
                host={host}
                tiles={tiles}
                worst={worst}
                onOpen={() => shell.openTab(host as never, "host")}
              />
            ))}
          </TileWall>
        </div>
      )}
    </div>
  );
}

function HostCard({
  host,
  tiles,
  worst,
  onOpen,
}: {
  host: PluginHostRecord;
  tiles: { id: string; title: string; status: string; label: string }[];
  worst: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const online = useHostStatus(Number(host.id))?.status;
  const problems = tiles.filter((tile) => tile.status !== "ok");
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex min-w-0 flex-col gap-2 p-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="flex items-center gap-2">
        <StatusDot state={online} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {hostLabel(host)}
        </span>
        <span className={`size-1.5 shrink-0 rounded-full ${DOT[worst]}`} />
      </div>
      <span className="truncate text-[11px] text-muted-foreground">
        {[host.ip, splitTags(host.tags).join(", ")].filter(Boolean).join(" | ")}
      </span>
      {tiles.length === 0 ? (
        <span className="text-[11px] text-muted-foreground">
          {t("hostCards.noTiles")}
        </span>
      ) : problems.length === 0 ? (
        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">
          {t("hostCards.allGood", { count: tiles.length })}
        </span>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {problems.slice(0, 4).map((tile) => (
            <li key={tile.id} className="flex items-center gap-1.5 text-[11px]">
              <span
                className={`size-1.5 shrink-0 rounded-full ${DOT[tile.status]}`}
              />
              <span className="truncate">
                {tile.title}
                {tile.label ? ` | ${tile.label}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </button>
  );
}
