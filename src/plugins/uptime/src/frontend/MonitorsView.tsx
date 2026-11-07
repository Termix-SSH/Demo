import { useEffect, useMemo, useState } from "react";
import { Activity, HeartPulse } from "lucide-react";
import {
  useHosts,
  useTranslation,
  usePluginPanelView,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  DataView,
  EmptyState,
  LoadingState,
  PanelSearch,
  Segmented,
  StatTile,
  StatusBadge,
  StatusDot,
  TileStack,
  TileWall,
  ViewToggle,
  type DataColumn,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { MonitorView } from "../shared/types";
import type { Permissions } from "./api";
import { AddFromHosts } from "./AddFromHosts";
import { BeatBar } from "./BeatBar";
import {
  latencyText,
  percentText,
  targetOf,
  toneOf,
  uptimeTone,
} from "./format";
import { MonitorDetail } from "./MonitorDetail";
import { MonitorEditor } from "./MonitorEditor";

type Filter = "all" | "problems" | "paused";

function average(values: Array<number | null>): number | null {
  const known = values.filter((value): value is number => value !== null);
  if (known.length === 0) return null;
  const sum = known.reduce((total, value) => total + value, 0);
  return Math.round((sum / known.length) * 100) / 100;
}

export function MonitorsView({
  monitors,
  permissions,
  reload,
  presetHostId,
}: {
  monitors: MonitorView[] | null;
  permissions: Permissions;
  reload: () => Promise<void>;
  presetHostId?: number;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const panel = usePluginPanelView("monitors");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [addingHosts, setAddingHosts] = useState(false);

  useEffect(() => {
    if (presetHostId !== undefined) setAdding(true);
  }, [presetHostId]);

  const hostName = (id: number | null) => {
    const host = hosts.find((item) => Number(item.id) === id);
    return host ? String(host.name || host.ip) : "";
  };

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (monitors ?? []).filter((monitor) => {
      if (
        filter === "problems" &&
        !["down", "pending"].includes(monitor.status)
      )
        return false;
      if (filter === "paused" && monitor.status !== "paused") return false;
      if (!needle) return true;
      return [monitor.name, monitor.groupName, ...monitor.tags, monitor.type]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [monitors, filter, query]);

  const open = monitors?.find((monitor) => monitor.id === openId) ?? null;
  if (monitors === null) return <LoadingState label={t("common.loading")} />;

  const count = (...statuses: string[]) =>
    monitors.filter((monitor) => statuses.includes(monitor.status)).length;
  const problems = count("down", "pending");
  const month = average(monitors.map((monitor) => monitor.uptime.month));

  const columns: DataColumn<MonitorView>[] = [
    {
      key: "name",
      header: t("list.name"),
      width: "minmax(0,2fr)",
      cell: (monitor) => (
        <span className="flex min-w-0 items-center gap-2">
          <StatusDot tone={toneOf(monitor.status)} />
          <span className="truncate">{monitor.name}</span>
        </span>
      ),
    },
    {
      key: "target",
      header: t("list.target"),
      width: "minmax(0,2fr)",
      hideBelow: "md",
      cell: (monitor) => (
        <span className="truncate text-muted-foreground">
          {targetOf(monitor, hostName(monitor.hostId))}
        </span>
      ),
    },
    {
      key: "beats",
      header: t("list.checks"),
      width: "minmax(0,2fr)",
      hideBelow: "lg",
      cell: (monitor) => <BeatBar beats={monitor.beats} />,
    },
    {
      key: "uptime",
      header: t("list.uptime"),
      width: "90px",
      align: "end",
      cell: (monitor) => percentText(monitor.uptime.day),
    },
    {
      key: "latency",
      header: t("list.latency"),
      width: "90px",
      align: "end",
      hideBelow: "md",
      cell: (monitor) => latencyText(monitor.latencyMs),
    },
  ];

  const renderCard = (monitor: MonitorView) => (
    <button
      type="button"
      className="flex w-full min-w-0 cursor-pointer flex-col gap-2 p-3 text-left hover:bg-muted/40"
      onClick={() => setOpenId(monitor.id)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {monitor.name}
        </span>
        <StatusBadge tone={toneOf(monitor.status)}>
          {t(`status.${monitor.status}`)}
        </StatusBadge>
      </span>
      <span className="truncate text-xs text-muted-foreground">
        {targetOf(monitor, hostName(monitor.hostId)) ||
          t(`types.${monitor.type}`)}
      </span>
      <BeatBar beats={monitor.beats} />
      <span className="flex justify-between text-xs text-muted-foreground">
        <span>
          {t("list.uptimeDay", { value: percentText(monitor.uptime.day) })}
        </span>
        <span>{latencyText(monitor.latencyMs)}</span>
      </span>
    </button>
  );

  return (
    <>
      <TileStack>
        <TileWall gridClassName="grid-cols-2 md:grid-cols-4">
          <StatTile
            label={t("stats.up")}
            icon={<Activity className="size-3.5" />}
            value={count("up")}
            tone={count("up") ? "ok" : "default"}
          />
          <StatTile
            label={t("stats.down")}
            value={problems}
            tone={problems ? "bad" : "default"}
            onClick={() => setFilter("problems")}
          />
          <StatTile
            label={t("stats.paused")}
            value={count("paused", "maintenance")}
            onClick={() => setFilter("paused")}
          />
          <StatTile
            label={t("stats.month")}
            value={percentText(month)}
            tone={uptimeTone(month)}
          />
        </TileWall>
        <ToolbarBand>
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              { value: "all", label: t("filter.all") },
              {
                value: "problems",
                label: t("filter.problems"),
                count: problems,
              },
              { value: "paused", label: t("filter.paused") },
            ]}
          />
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder={t("list.search")}
            fill
          />
          <ViewToggle
            view={panel.view}
            onView={panel.setView}
            columns={panel.columns}
            onColumns={panel.setColumns}
          />
          {permissions.manage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAddingHosts(true)}
              >
                {t("list.addHosts")}
              </Button>
              <AddButton
                label={t("list.add")}
                onClick={() => setAdding(true)}
              />
            </>
          ) : null}
        </ToolbarBand>
        <DataView
          items={shown}
          view={panel.view}
          getKey={(monitor) => String(monitor.id)}
          renderCard={renderCard}
          columns={{ base: 1 }}
          size={panel.columns}
          minCardWidth={300}
          listColumns={columns}
          onRowClick={(monitor) => setOpenId(monitor.id)}
          empty={
            <EmptyState
              icon={HeartPulse}
              title={t(monitors.length ? "list.noMatch" : "list.empty")}
              hint={monitors.length ? undefined : t("list.emptyHint")}
            />
          }
        />
      </TileStack>
      {/* Overlays stay outside the stack so they don't add empty sections. */}
      <MonitorEditor
        open={adding}
        presetHostId={presetHostId}
        permissions={permissions}
        onClose={() => setAdding(false)}
        onSaved={reload}
      />
      <AddFromHosts
        open={addingHosts}
        onClose={() => setAddingHosts(false)}
        onSaved={reload}
      />
      {open ? (
        <MonitorDetail
          monitor={open}
          permissions={permissions}
          hostName={hostName(open.hostId)}
          onClose={() => setOpenId(null)}
          reload={reload}
        />
      ) : null}
    </>
  );
}
