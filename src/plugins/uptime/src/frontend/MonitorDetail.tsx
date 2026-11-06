import { useEffect, useState } from "react";
import { Bell, BellOff, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InfoGrid,
  InlineView,
  LineChart,
  Segmented,
  StatTile,
  StatusBadge,
  TileFrame,
  TileStack,
  TileWall,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  BeatView,
  HistoryPoint,
  HistoryRange,
  IncidentView,
  MonitorView,
} from "../shared/types";
import {
  deleteMonitor,
  errorMessage,
  getHistory,
  getMonitor,
  listIncidents,
  newPushUrl,
  pauseMonitor,
  runMonitor,
  setWatching,
  type Permissions,
} from "./api";
import { BeatBar } from "./BeatBar";
import {
  latencyText,
  lengthText,
  percentText,
  targetOf,
  toneOf,
  uptimeTone,
  whenText,
} from "./format";
import { MonitorEditor } from "./MonitorEditor";
import { ShareEditor } from "./ShareEditor";

const RANGES: HistoryRange[] = ["day", "week", "month", "quarter"];

function ResponseChart({ points }: { points: HistoryPoint[] }) {
  const { t } = useTranslation();
  const data = points.map((point) => point.ms);
  const top = Math.max(10, ...data.map((value) => value ?? 0));
  if (points.length < 2) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("detail.noChart")}</p>
    );
  }
  return (
    <LineChart
      height={200}
      domain={[0, Math.ceil(top * 1.1)]}
      timestamps={points.map((point) => new Date(point.t * 1000).toISOString())}
      yFormatter={(value) => `${Math.round(value)} ms`}
      series={[
        {
          key: "ms",
          label: t("list.latency"),
          color: "var(--accent-brand)",
          data,
        },
      ]}
    />
  );
}

export function MonitorDetail({
  monitor,
  permissions,
  hostName,
  onClose,
  reload,
}: {
  monitor: MonitorView;
  permissions: Permissions;
  hostName: string;
  onClose: () => void;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [range, setRange] = useState<HistoryRange>("day");
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [incidents, setIncidents] = useState<IncidentView[]>([]);
  const [beats, setBeats] = useState<BeatView[]>(monitor.beats);
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pushUrl, setPushUrl] = useState("");

  useEffect(() => {
    void getHistory(monitor.id, range)
      .then(setPoints)
      .catch(() => setPoints([]));
  }, [monitor.id, range, monitor.lastCheckAt]);

  useEffect(() => {
    void getMonitor(monitor.id)
      .then((full) => setBeats(full.beats))
      .catch(() => undefined);
    void listIncidents({ monitorId: monitor.id, limit: 20 })
      .then(setIncidents)
      .catch(() => undefined);
  }, [monitor.id, monitor.lastCheckAt]);

  const canEdit = permissions.manage && monitor.access !== "view";

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await reload();
    } catch (e) {
      toast.error(errorMessage(e, t("detail.failed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    const yes = await confirm({
      title: t("detail.deleteTitle", { name: monitor.name }),
      description: t("detail.deleteHint"),
      confirmLabel: t("common.delete"),
    });
    if (!yes) return;
    await act(async () => {
      await deleteMonitor(monitor.id);
      onClose();
    });
  };

  const regenerate = async () => {
    const yes = await confirm({
      title: t("detail.newUrlTitle"),
      description: t("detail.newUrlHint"),
      confirmLabel: t("detail.newUrl"),
    });
    if (yes) await act(async () => setPushUrl(await newPushUrl(monitor.id)));
  };

  const info = [
    { label: t("detail.type"), value: t(`types.${monitor.type}`) },
    {
      label: t("detail.target"),
      value: targetOf(monitor, hostName),
      mono: true,
    },
    { label: t("detail.lastCheck"), value: whenText(monitor.lastCheckAt) },
    { label: t("detail.message"), value: monitor.message },
    {
      label: t("detail.every"),
      value: t("detail.seconds", { count: monitor.intervalSec }),
    },
    { label: t("detail.group"), value: monitor.groupName },
    { label: t("detail.tags"), value: monitor.tags.join(", ") },
    {
      label: t("detail.cert"),
      value: monitor.cert
        ? t("detail.certValue", {
            days: monitor.cert.daysLeft,
            issuer: monitor.cert.issuer,
          })
        : "",
    },
  ];

  return (
    <InlineView
      open
      onOpenChange={(next) => !next && onClose()}
      title={monitor.name}
      width="wide"
      stacked
      status={
        <StatusBadge tone={toneOf(monitor.status)}>
          {t(`status.${monitor.status}`)}
        </StatusBadge>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            title={t(monitor.watching ? "detail.alertsOff" : "detail.alertsOn")}
            aria-label={t(
              monitor.watching ? "detail.alertsOff" : "detail.alertsOn",
            )}
            onClick={() =>
              act(() => setWatching(monitor.id, !monitor.watching))
            }
          >
            {monitor.watching ? (
              <Bell className="size-4" />
            ) : (
              <BellOff className="size-4" />
            )}
          </Button>
          {canEdit ? (
            <>
              {monitor.type !== "push" ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={busy || !monitor.enabled}
                  title={t("detail.runNow")}
                  aria-label={t("detail.runNow")}
                  onClick={() => act(() => runMonitor(monitor.id))}
                >
                  <RefreshCw className="size-4" />
                </Button>
              ) : null}
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                title={t(monitor.enabled ? "detail.pause" : "detail.resume")}
                aria-label={t(
                  monitor.enabled ? "detail.pause" : "detail.resume",
                )}
                onClick={() =>
                  act(() => pauseMonitor(monitor.id, monitor.enabled))
                }
              >
                {monitor.enabled ? (
                  <Pause className="size-4" />
                ) : (
                  <Play className="size-4" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditing(true)}
              >
                {t("common.edit")}
              </Button>
            </>
          ) : null}
          {monitor.owner && permissions.manage ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSharing(true)}
              >
                {t("detail.share")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                disabled={busy}
                title={t("common.delete")}
                aria-label={t("common.delete")}
                onClick={() => void remove()}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <TileStack>
        <TileWall gridClassName="grid-cols-2 md:grid-cols-5">
          <StatTile
            label={t("detail.now")}
            value={latencyText(monitor.latencyMs)}
          />
          <StatTile
            label={t("range.day")}
            value={percentText(monitor.uptime.day)}
            tone={uptimeTone(monitor.uptime.day)}
          />
          <StatTile
            label={t("range.week")}
            value={percentText(monitor.uptime.week)}
            tone={uptimeTone(monitor.uptime.week)}
          />
          <StatTile
            label={t("range.month")}
            value={percentText(monitor.uptime.month)}
            tone={uptimeTone(monitor.uptime.month)}
          />
          <StatTile
            label={t("range.quarter")}
            value={percentText(monitor.uptime.quarter)}
            tone={uptimeTone(monitor.uptime.quarter)}
          />
        </TileWall>
        <TileFrame title={t("detail.recent")}>
          <div className="p-3">
            <BeatBar beats={beats} count={90} className="h-6" />
          </div>
        </TileFrame>
        <TileFrame
          title={t("detail.response")}
          actions={
            <Segmented<HistoryRange>
              value={range}
              onChange={setRange}
              options={RANGES.map((value) => ({
                value,
                label: t(`range.${value}`),
              }))}
            />
          }
        >
          <ResponseChart points={points} />
        </TileFrame>
        <TileFrame title={t("detail.about")}>
          <div className="p-3">
            <InfoGrid items={info} />
            {monitor.type === "push" && canEdit ? (
              <div className="mt-3 flex flex-col gap-2">
                {pushUrl ? (
                  <code className="break-all text-xs">{pushUrl}</code>
                ) : null}
                <Button
                  variant="outline"
                  size="sm"
                  className="self-start"
                  disabled={busy}
                  onClick={() => void regenerate()}
                >
                  {t("detail.newUrl")}
                </Button>
              </div>
            ) : null}
          </div>
        </TileFrame>
        <TileFrame title={t("detail.incidents")}>
          {incidents.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">
              {t("detail.noIncidents")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {incidents.map((incident) => (
                <li key={incident.id} className="px-3 py-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <span>{whenText(incident.startedAt)}</span>
                    <span className="text-muted-foreground">
                      {incident.endedAt
                        ? lengthText(incident.endedAt - incident.startedAt)
                        : t("incidents.ongoing")}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{incident.cause}</p>
                </li>
              ))}
            </ul>
          )}
        </TileFrame>
      </TileStack>
      <MonitorEditor
        open={editing}
        monitor={monitor}
        permissions={permissions}
        onClose={() => setEditing(false)}
        onSaved={reload}
      />
      <ShareEditor
        open={sharing}
        monitorId={monitor.id}
        onClose={() => setSharing(false)}
      />
    </InlineView>
  );
}
