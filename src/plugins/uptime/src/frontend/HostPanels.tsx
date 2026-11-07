import { useCallback, useEffect, useState } from "react";
import {
  useSettings,
  useTabs,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, ListRow } from "@termix-ssh/plugin-sdk/ui";
import type { MonitorView } from "../shared/types";
import { hostMonitors, listMonitors } from "./api";
import { BeatBar } from "./BeatBar";
import { latencyText, percentText, POLL_MS, rowToneOf } from "./format";
import { TAB_ID } from "./UptimeCard";

const BADGE_POLL_MS = 60_000;

/** Host rows share one poll, however many of them are on screen. */
const badges = {
  down: new Map<number, number>(),
  users: new Set<() => void>(),
  timer: null as ReturnType<typeof setInterval> | null,
};

async function pollBadges(): Promise<void> {
  const monitors = await listMonitors().catch(() => null);
  if (!monitors) return;
  badges.down.clear();
  for (const monitor of monitors) {
    if (monitor.status !== "down" || !monitor.hostId) continue;
    const count = badges.down.get(monitor.hostId) ?? 0;
    badges.down.set(monitor.hostId, count + 1);
  }
  for (const notify of badges.users) notify();
}

function useDownCount(hostId: number): number {
  const [count, setCount] = useState(badges.down.get(hostId) ?? 0);
  useEffect(() => {
    const notify = () => setCount(badges.down.get(hostId) ?? 0);
    badges.users.add(notify);
    if (!badges.timer) {
      void pollBadges();
      badges.timer = setInterval(() => void pollBadges(), BADGE_POLL_MS);
    }
    return () => {
      badges.users.delete(notify);
      if (badges.users.size === 0 && badges.timer) {
        clearInterval(badges.timer);
        badges.timer = null;
      }
    };
  }, [hostId]);
  return count;
}

function useHostMonitors(hostId: number, isVisible: boolean, every: number) {
  const [monitors, setMonitors] = useState<MonitorView[]>([]);
  const load = useCallback(async () => {
    if (!hostId) return;
    setMonitors(await hostMonitors(hostId).catch(() => []));
  }, [hostId]);
  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), every);
    return () => clearInterval(timer);
  }, [isVisible, load, every]);
  return monitors;
}

function HostList({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const monitors = useHostMonitors(hostId, isVisible, POLL_MS * 2);
  if (monitors.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2 p-3 text-xs">
        <p className="text-muted-foreground">{t("host.none")}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            tabs.openSingletonTab(TAB_ID, { data: { addForHost: hostId } })
          }
        >
          {t("host.add")}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col divide-y divide-border">
      {monitors.map((monitor, index) => (
        <ListRow
          key={monitor.id}
          stripe={index}
          tone={rowToneOf(monitor.status)}
          title={monitor.name}
          trailing={
            <span className="text-xs text-muted-foreground">
              {percentText(monitor.uptime.day)} |{" "}
              {latencyText(monitor.latencyMs)}
            </span>
          }
        >
          <BeatBar beats={monitor.beats} count={30} />
        </ListRow>
      ))}
    </div>
  );
}

export function useUptimeCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 360,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** Monitors of this host beside a terminal. */
export function UptimeCompanion({ host, isVisible }: CompanionProps) {
  return <HostList hostId={Number(host?.id)} isVisible={isVisible} />;
}

/** The same list as a tile on Operations Center's host page. */
export function HostTile({
  hostId,
  isVisible = true,
}: {
  hostId: number;
  isVisible?: boolean;
}) {
  return <HostList hostId={hostId} isVisible={isVisible} />;
}

/** The host row dot while one of its monitors is down. */
export function useHostDot(host: PluginHostRecord) {
  const { t } = useTranslation();
  const down = useDownCount(Number(host.id));
  if (!down) return null;
  return { tone: "bad" as const, label: t("host.down", { count: down }) };
}
