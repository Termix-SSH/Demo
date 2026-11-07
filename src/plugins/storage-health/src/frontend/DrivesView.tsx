import { useEffect, useState } from "react";
import { HardDrive, Play, Square } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  AlertDescription,
  Button,
  EmptyState,
  InfoGrid,
  LineChart,
  ListBadge,
  ListRow,
  PanelList,
  Segmented,
  StatTile,
  TileStack,
  TileWall,
  ToolbarBand,
  InlineView,
} from "@termix-ssh/plugin-sdk/ui";
import { Thermometer } from "lucide-react";
import type {
  Device,
  HistoryPoint,
  HistoryRange,
  Reading,
} from "../shared/types";
import { errorMessage, getHistory, selfTest } from "./api";
import {
  formatBytes,
  formatHours,
  formatNumber,
  rowTone,
  statTone,
} from "./format";

interface Props {
  hostId: number;
  reading: Reading;
  canEdit: boolean;
  isVisible: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onChanged: () => void;
}

// LineChart reads ISO times and labels the axis itself.
function stamp(t: number): string {
  return new Date(t * 1000).toISOString();
}

function Charts({
  hostId,
  device,
  isVisible,
}: {
  hostId: number;
  device: Device;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [range, setRange] = useState<HistoryRange>("24h");
  const [points, setPoints] = useState<HistoryPoint[] | null>(null);

  useEffect(() => {
    if (!isVisible) return;
    let live = true;
    getHistory(hostId, device.id, range)
      .then((rows) => live && setPoints(rows))
      .catch(() => live && setPoints([]));
    return () => {
      live = false;
    };
  }, [hostId, device.id, range, isVisible]);

  const stamps = (points ?? []).map((p) => stamp(p.t));
  const col = (key: "p" | "w" | "r") => (points ?? []).map((p) => p[key]);
  const has = (key: "p" | "w" | "r") => col(key).some((v) => v !== null);
  // LineChart needs a range, so charts without a fixed one fit their data.
  const fit = (key: "p" | "w" | "r"): [number, number] => {
    const values = col(key).filter((v): v is number => v !== null);
    const max = Math.max(1, ...values);
    return [0, Math.ceil(max * 1.2)];
  };
  const blocks: Array<{
    key: "p" | "w" | "r";
    title: string;
    domain?: [number, number];
    unit: string;
  }> = [
    { key: "p", title: t("history.temp"), unit: "C" },
    { key: "w", title: t("history.wear"), domain: [0, 100], unit: "%" },
    { key: "r", title: t("history.bad"), unit: "" },
  ];

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <Segmented<HistoryRange>
          value={range}
          onChange={setRange}
          options={[
            { value: "24h", label: t("history.24h") },
            { value: "7d", label: t("history.7d") },
            { value: "30d", label: t("history.30d") },
          ]}
        />
      </ToolbarBand>
      {points && points.length < 2 && (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {t("history.empty")}
        </p>
      )}
      {points &&
        points.length >= 2 &&
        blocks
          .filter((b) => has(b.key))
          .map((b) => (
            <div key={b.key} className="border-b border-border last:border-b-0">
              <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {b.title}
              </div>
              <div className="px-2 pb-2">
                <LineChart
                  series={[
                    {
                      key: b.key,
                      label: b.title,
                      color: "var(--chart-2, hsl(var(--primary)))",
                      data: col(b.key),
                    },
                  ]}
                  timestamps={stamps}
                  domain={b.domain ?? fit(b.key)}
                  yFormatter={(v) => `${Math.round(v)}${b.unit}`}
                  height={140}
                />
              </div>
            </div>
          ))}
    </div>
  );
}

function Detail({
  hostId,
  device,
  canEdit,
  isVisible,
  onBack,
  onChanged,
}: {
  hostId: number;
  device: Device;
  canEdit: boolean;
  isVisible: boolean;
  onBack: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const run = async (action: "short" | "long" | "abort") => {
    setBusy(true);
    try {
      toast.success(await selfTest(hostId, device.id, action));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
    }
  };

  const smart = device.passed !== null || device.attributes.length > 0;
  return (
    <InlineView
      open
      bare
      onOpenChange={(open) => !open && onBack()}
      icon={<HardDrive className="size-4" />}
      title={device.id}
      status={device.model || undefined}
      actions={
        <>
          {device.selfTestRunning ? (
            <Button
              size="xs"
              variant="outline"
              disabled={!canEdit || busy}
              onClick={() => void run("abort")}
            >
              <Square className="size-3" />
              {t("detail.stop")}
            </Button>
          ) : (
            <>
              <Button
                size="xs"
                variant="outline"
                disabled={!canEdit || busy || !smart}
                onClick={() => void run("short")}
              >
                <Play className="size-3" />
                {t("detail.short")}
              </Button>
              <Button
                size="xs"
                variant="outline"
                disabled={!canEdit || busy || !smart}
                onClick={() => void run("long")}
              >
                <Play className="size-3" />
                {t("detail.long")}
              </Button>
            </>
          )}
        </>
      }
    >
      <TileStack>
        {device.note && (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            {device.note}
          </p>
        )}
        <TileWall minWidth={160}>
          <StatTile
            label={t("detail.health")}
            icon={<HardDrive className="size-3.5" />}
            value={t(`health.${device.health}`)}
            tone={statTone(device.health)}
          />
          <StatTile
            label={t("detail.temp")}
            icon={<Thermometer className="size-3.5" />}
            value={formatNumber(device.tempC)}
            unit="C"
          />
          <StatTile
            label={t("detail.wear")}
            icon={<HardDrive className="size-3.5" />}
            value={formatNumber(device.wearPct)}
            unit="%"
            percent={device.wearPct}
          />
          <StatTile
            label={t("detail.hours")}
            icon={<HardDrive className="size-3.5" />}
            value={formatHours(device.powerOnHours)}
          />
        </TileWall>
        <div className="p-3">
          <InfoGrid
            items={[
              { label: t("detail.model"), value: device.model },
              { label: t("detail.serial"), value: device.serial, mono: true },
              { label: t("detail.kind"), value: t(`kind.${device.kind}`) },
              { label: t("detail.size"), value: formatBytes(device.sizeBytes) },
              {
                label: t("detail.reallocated"),
                value: formatNumber(device.reallocated),
              },
              {
                label: t("detail.pending"),
                value: formatNumber(device.pending),
              },
              {
                label: t("detail.uncorrectable"),
                value: formatNumber(device.uncorrectable),
              },
              {
                label: t("detail.mediaErrors"),
                value: formatNumber(device.mediaErrors),
              },
              { label: t("detail.selfTest"), value: device.selfTest },
            ]}
          />
        </div>
        {device.attributes.length > 0 && (
          <div>
            <div className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("detail.attributes")}
            </div>
            <PanelList>
              {device.attributes.map((a, index) => (
                <ListRow
                  key={a.id}
                  stripe={index}
                  title={`${a.id} ${a.name}`}
                  meta={t("detail.attrMeta", { value: a.value, raw: a.raw })}
                />
              ))}
            </PanelList>
          </div>
        )}
        <Charts hostId={hostId} device={device} isVisible={isVisible} />
      </TileStack>
    </InlineView>
  );
}

/** Every drive on the host, worst first. A click opens its SMART detail. */
export function DrivesView({
  hostId,
  reading,
  canEdit,
  isVisible,
  selected,
  onSelect,
  onChanged,
}: Props) {
  const { t } = useTranslation();
  const chosen = reading.devices.find((d) => d.id === selected) ?? null;
  if (chosen) {
    return (
      <Detail
        hostId={hostId}
        device={chosen}
        canEdit={canEdit}
        isVisible={isVisible}
        onBack={() => onSelect(null)}
        onChanged={onChanged}
      />
    );
  }

  const rank = { fail: 0, warn: 1, unknown: 2, ok: 3 } as const;
  const sorted = [...reading.devices].sort(
    (a, b) => rank[a.health] - rank[b.health] || a.id.localeCompare(b.id),
  );
  return (
    <div className="flex flex-col">
      {reading.warnings.includes("not-root") && (
        <div className="border-b border-border px-3 py-2">
          <Alert>
            <AlertDescription>{t("drives.noRoot")}</AlertDescription>
          </Alert>
        </div>
      )}
      {reading.warnings.includes("no-smart-tool") && (
        <div className="border-b border-border px-3 py-2">
          <Alert>
            <AlertDescription>{t("drives.noTool")}</AlertDescription>
          </Alert>
        </div>
      )}
      <PanelList
        empty={<EmptyState icon={HardDrive} title={t("drives.empty")} />}
      >
        {sorted.map((d, index) => (
          <ListRow
            key={d.id}
            stripe={index}
            tone={rowTone(d.health)}
            icon={<HardDrive className="size-3.5" />}
            title={d.model ? `${d.id} | ${d.model}` : d.id}
            meta={[
              t(`kind.${d.kind}`),
              formatBytes(d.sizeBytes),
              d.powerOnHours !== null ? formatHours(d.powerOnHours) : "",
              d.note,
            ]
              .filter((x) => x && x !== "-")
              .join(" | ")}
            badges={
              <>
                <ListBadge tone={rowTone(d.health)}>
                  {t(`health.${d.health}`)}
                </ListBadge>
                {d.tempC !== null && (
                  <ListBadge tone="muted">{Math.round(d.tempC)} C</ListBadge>
                )}
                {d.wearPct !== null && (
                  <ListBadge tone="muted">
                    {t("drives.wear", { value: Math.round(d.wearPct) })}
                  </ListBadge>
                )}
                {d.selfTestRunning && (
                  <ListBadge tone="muted">{t("drives.testing")}</ListBadge>
                )}
              </>
            }
            onClick={() => onSelect(d.id)}
          />
        ))}
      </PanelList>
    </div>
  );
}
