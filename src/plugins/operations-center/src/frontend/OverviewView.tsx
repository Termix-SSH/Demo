import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  useSettings,
  useTranslation,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListRow,
  TileFrame,
  TileEditBar,
  TileGrid,
  TilePicker,
  appendTile,
  sanitizeTiles,
  type TilePickerEntry,
  type TileSlot,
} from "@termix-ssh/plugin-sdk/ui";
import {
  Activity,
  AlertTriangle,
  History,
  LayoutGrid,
  Rocket,
  ShieldQuestion,
} from "lucide-react";
import {
  listApprovals,
  listRollouts,
  listRuns,
  type Approval,
  type Catalog,
  type Run,
} from "./api";
import { AttentionCard } from "./AttentionCard";
import { StateBadge, when } from "./parts";
import { SignalCard } from "./tiles/DashboardTiles";
import type { Batch } from "../shared/types";

const DEFAULT: TileSlot[] = [
  { id: "attention", x: 0, y: 0, w: 7, h: 300 },
  { id: "approvals", x: 7, y: 0, w: 5, h: 300 },
  { id: "runs", x: 0, y: 300, w: 7, h: 320 },
  { id: "rollouts", x: 7, y: 300, w: 5, h: 320 },
];

function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Where the Operations tab opens: what needs a look, what waits for a
 * person, what ran lately and what is rolling out. Arranged like any grid.
 */
export function OverviewView({
  catalog,
  shell,
  isVisible,
  onView,
}: {
  catalog: Catalog | null;
  shell: ShellApi;
  isVisible: boolean;
  onView: (view: string, data?: Record<string, unknown>) => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings("user");
  const [editMode, setEditMode] = useState(false);
  const saved = useMemo(() => {
    const value = jsonValue(settings.values.opsOverviewLayout);
    return Array.isArray(value) ? sanitizeTiles(value) : null;
  }, [settings.values.opsOverviewLayout]);
  const slots = saved ?? DEFAULT;
  const save = (next: TileSlot[]) =>
    void settings.save({ opsOverviewLayout: next });

  const titleOf = (id: string) => {
    if (id.startsWith("signal:"))
      return catalog?.signals.find((s) => s.id === id.slice(7))?.title ?? id;
    return t(`overview.${id}`, { defaultValue: id });
  };

  const entries = useMemo((): TilePickerEntry[] => {
    const placed = new Set(slots.map((slot) => slot.id));
    const general = t("tiles.groupGeneral");
    const fixed: TilePickerEntry[] = [
      {
        id: "attention",
        title: t("overview.attention"),
        group: general,
        kind: "card",
        icon: <AlertTriangle />,
      },
      {
        id: "approvals",
        title: t("overview.approvals"),
        group: general,
        kind: "card",
        icon: <ShieldQuestion />,
      },
      {
        id: "runs",
        title: t("overview.runs"),
        group: general,
        kind: "card",
        icon: <History />,
      },
      {
        id: "rollouts",
        title: t("overview.rollouts"),
        group: general,
        kind: "card",
        icon: <Rocket />,
      },
    ];
    const names = new Map<string, string>();
    for (const action of catalog?.actions ?? [])
      names.set(action.pluginId, action.pluginName);
    const signals: TilePickerEntry[] = (catalog?.signals ?? []).map(
      (signal) => ({
        id: `signal:${signal.id}`,
        title: signal.title,
        group: names.get(signal.pluginId) ?? signal.pluginId,
        kind: "signal",
        icon: <Activity />,
      }),
    );
    return [...fixed, ...signals].map((entry) => ({
      ...entry,
      placed: placed.has(entry.id),
    }));
  }, [slots, catalog, t]);

  const renderTile = (id: string): ReactNode => {
    const title = titleOf(id);
    if (id.startsWith("signal:"))
      return (
        <TileFrame title={title} icon={<Activity />}>
          <SignalCard
            isVisible={isVisible}
            shell={shell}
            config={{ signal: id.slice(7) }}
          />
        </TileFrame>
      );
    switch (id) {
      case "attention":
        return (
          <TileFrame title={title} icon={<AlertTriangle />}>
            <AttentionCard isVisible={isVisible} shell={shell} />
          </TileFrame>
        );
      case "approvals":
        return (
          <TileFrame
            title={title}
            icon={<ShieldQuestion />}
            onTitleClick={() => onView("approvals")}
          >
            <ApprovalsTile
              isVisible={isVisible}
              catalog={catalog}
              onOpen={() => onView("approvals")}
            />
          </TileFrame>
        );
      case "runs":
        return (
          <TileFrame
            title={title}
            icon={<History />}
            onTitleClick={() => onView("history")}
          >
            <RecentRunsTile
              isVisible={isVisible}
              catalog={catalog}
              onOpen={(runId) => onView("history", { runId })}
            />
          </TileFrame>
        );
      case "rollouts":
        return (
          <TileFrame
            title={title}
            icon={<Rocket />}
            onTitleClick={() => onView("rollouts")}
          >
            <RolloutsTile
              isVisible={isVisible}
              onOpen={() => onView("rollouts")}
            />
          </TileFrame>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editMode ? (
        <TileEditBar
          onReset={() => void settings.save({ opsOverviewLayout: null })}
          onDone={() => setEditMode(false)}
        />
      ) : (
        <div className="flex shrink-0 justify-end border-b border-border px-3 py-1">
          <Button
            size="xs"
            variant="ghost"
            className="gap-1"
            onClick={() => setEditMode(true)}
          >
            <LayoutGrid className="size-3" />
            {t("tiles.customize")}
          </Button>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto thin-scrollbar">
          <TileGrid
            slots={slots}
            editMode={editMode}
            renderTile={renderTile}
            tileLabel={titleOf}
            onChange={save}
          />
        </div>
        {editMode && (
          <TilePicker
            entries={entries}
            onAdd={(entry) =>
              save(
                appendTile(slots, {
                  id: entry.id,
                  w: entry.kind === "signal" ? 4 : 6,
                  h: entry.kind === "signal" ? 220 : 300,
                }),
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function usePoll<T>(isVisible: boolean, read: () => Promise<T>, ms = 30000) {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    if (!isVisible) return;
    let stop = false;
    const load = () =>
      void read()
        .then((next) => !stop && setValue(next))
        .catch(() => {});
    load();
    const timer = setInterval(load, ms);
    return () => {
      stop = true;
      clearInterval(timer);
    };
    // read is a fresh closure each render; the tile only needs one poller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVisible, ms]);
  return value;
}

function ApprovalsTile({
  isVisible,
  catalog,
  onOpen,
}: {
  isVisible: boolean;
  catalog: Catalog | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const approvals = usePoll<Approval[]>(isVisible, listApprovals);
  const titleOf = (id: string) =>
    catalog?.actions.find((action) => action.id === id)?.title ?? id;
  if (!approvals)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("state.loading")}</p>
    );
  if (approvals.length === 0)
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t("overview.noApprovals")}
      </p>
    );
  return (
    <div className="flex flex-col">
      {approvals.slice(0, 10).map((approval) => (
        <ListRow
          key={approval.id}
          title={titleOf(approval.run.actionId)}
          meta={[
            approval.run.hostName,
            approval.requestedBy,
            when(approval.createdAt),
          ]
            .filter(Boolean)
            .join(" | ")}
          onClick={onOpen}
        />
      ))}
    </div>
  );
}

function RecentRunsTile({
  isVisible,
  catalog,
  onOpen,
}: {
  isVisible: boolean;
  catalog: Catalog | null;
  onOpen: (runId: string) => void;
}) {
  const { t } = useTranslation();
  const runs = usePoll<Run[]>(isVisible, () => listRuns({ limit: 12 }), 15000);
  const titleOf = (id: string) =>
    catalog?.actions.find((action) => action.id === id)?.title ?? id;
  if (!runs)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("state.loading")}</p>
    );
  if (runs.length === 0)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("history.empty")}</p>
    );
  return (
    <div className="flex flex-col">
      {runs.map((run) => (
        <ListRow
          key={run.id}
          title={titleOf(run.actionId)}
          meta={[run.hostName, run.username, when(run.createdAt)]
            .filter(Boolean)
            .join(" | ")}
          badges={<StateBadge state={run.status} />}
          onClick={() => onOpen(run.id)}
        />
      ))}
    </div>
  );
}

function RolloutsTile({
  isVisible,
  onOpen,
}: {
  isVisible: boolean;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const rollouts = usePoll<Batch[]>(isVisible, listRollouts);
  if (!rollouts)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("state.loading")}</p>
    );
  const active = rollouts.filter((batch) =>
    ["running", "paused", "draft"].includes(batch.status),
  );
  if (active.length === 0)
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t("overview.noRollouts")}
      </p>
    );
  return (
    <div className="flex flex-col">
      {active.slice(0, 10).map((batch) => (
        <ListRow
          key={batch.id}
          title={batch.name}
          meta={when(batch.createdAt)}
          badges={<StateBadge state={batch.status} />}
          onClick={onOpen}
        />
      ))}
    </div>
  );
}
