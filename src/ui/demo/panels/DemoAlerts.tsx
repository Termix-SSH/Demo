import { useEffect, useState } from "react";
import {
  BellRing,
  Check,
  Plug,
  Send,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Facts, PANEL, PanelShell } from "@/components/panel-layout";
import { TabStrip } from "@/components/tab-strip";
import { getAlertFirings } from "@/api/alerts-api";
import type { DemoAlert } from "@/demo/demo-data";
import { timeAgo } from "@/lib/relative-time";

/**
 * Mirrors the real AlertsPanel: what has fired, the rules that fire it, and
 * where the notice goes. Three tabs rather than three panels, because the
 * three are only ever read together.
 */

type Section = "firings" | "rules" | "channels";

const SEVERITY_CLASS: Record<DemoAlert["severity"], string> = {
  critical: "text-destructive border-destructive/40 bg-destructive/10",
  warning: "text-warning border-warning/40 bg-warning/10",
  info: "text-muted-foreground border-border bg-muted/30",
};

/** Stand-ins for the rules a real install would have. */
const DEMO_RULES = [
  { id: 1, name: "Memory above 80%", holdFor: "10m", channels: "ntfy" },
  { id: 2, name: "Disk above 70%", holdFor: "30m", channels: "ntfy, webhook" },
  { id: 3, name: "Host stops answering", holdFor: "Immediate", channels: "ntfy" },
];

const DEMO_CHANNELS = [
  { id: 1, name: "ntfy", detail: "ntfy.sh/termix-alerts" },
  { id: 2, name: "Webhook", detail: "hooks.internal/termix" },
];

export function DemoAlerts({ chrome = true }: { chrome?: boolean }) {
  const [section, setSection] = useState<Section>("firings");
  const [rows, setRows] = useState<DemoAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAcked, setShowAcked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAlertFirings().then((firings) => {
      if (cancelled) return;
      setRows(firings);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unread = rows.filter((row) => !row.acknowledged).length;
  const visible = rows.filter((row) => showAcked || !row.acknowledged);

  function ack(id: number) {
    setRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, acknowledged: true } : row)),
    );
  }

  function ackAll() {
    setRows((prev) => prev.map((row) => ({ ...row, acknowledged: true })));
  }

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<BellRing className="size-4" />}
      title="Alerts"
      status={unread === 0 ? "All acknowledged" : `${unread} unacknowledged`}
      actions={
        section === "firings" && unread > 0 ? (
          <Button variant="ghost" size="xs" onClick={ackAll}>
            Acknowledge all
          </Button>
        ) : undefined
      }
      tabs={
        <TabStrip
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
          tabs={[
            {
              id: "firings",
              label: "Firings",
              icon: <BellRing className="size-3" />,
            },
            {
              id: "rules",
              label: "Rules",
              icon: <SlidersHorizontal className="size-3" />,
            },
            {
              id: "channels",
              label: "Channels",
              icon: <Plug className="size-3" />,
            },
          ]}
        />
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {section === "firings" && (
        <>
          {visible.length === 0 ? (
            <EmptyState
              icon={BellRing}
              title="No unacknowledged alerts"
              hint="Set rules on host metrics and pick where the notice goes."
            />
          ) : (
            visible.map((row) => (
              <div
                key={row.id}
                className={`flex items-start gap-2 border border-border px-3 py-2 ${
                  row.acknowledged ? "opacity-50" : ""
                }`}
              >
                <span
                  className={`mt-0.5 shrink-0 border px-1.5 py-0.5 text-[9px] font-bold uppercase ${SEVERITY_CLASS[row.severity]}`}
                >
                  {row.severity}
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-xs font-medium break-words">
                    {row.title}
                  </span>
                  <Facts className="text-[10px] text-muted-foreground">
                    <span>{row.hostName}</span>
                    <span>{timeAgo(row.at, "just now")}</span>
                  </Facts>
                </div>
                {!row.acknowledged && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    title="Acknowledge"
                    onClick={() => ack(row.id)}
                    className="shrink-0 text-muted-foreground hover:text-accent-brand"
                  >
                    <Check className="size-3" />
                  </Button>
                )}
              </div>
            ))
          )}
          {rows.some((row) => row.acknowledged) && (
            <button
              type="button"
              onClick={() => setShowAcked((v) => !v)}
              className="self-start text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              {showAcked ? "Hide acknowledged" : "Show acknowledged"}
            </button>
          )}
        </>
      )}

      {section === "rules" &&
        DEMO_RULES.map((rule) => (
          <div
            key={rule.id}
            className="flex items-center gap-2 border border-border px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{rule.name}</span>
              <Facts className="text-[10px] text-muted-foreground">
                <span>Holds for {rule.holdFor}</span>
                <span>{rule.channels}</span>
              </Facts>
            </div>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Delete"
              className="shrink-0 text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="size-3" />
            </Button>
          </div>
        ))}

      {section === "channels" &&
        DEMO_CHANNELS.map((channel) => (
          <div
            key={channel.id}
            className="flex items-center gap-2 border border-border px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">
                {channel.name}
              </span>
              <span className="truncate font-mono text-[10px] text-muted-foreground">
                {channel.detail}
              </span>
            </div>
            <Button variant="outline" size="xs" className="shrink-0 gap-1">
              <Send className="size-3" />
              Test
            </Button>
          </div>
        ))}
    </PanelShell>
  );
}
