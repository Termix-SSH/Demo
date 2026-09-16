import { useMemo } from "react";
import { Plug, RotateCcw, Share2, X } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { Facts, GroupHeading, PANEL, PanelShell } from "@/components/panel-layout";
import type { Tab } from "@/types/ui-types";
import { DEMO_HOSTS } from "@/demo/demo-data";

/**
 * Mirrors the real ConnectionsPanel: the sessions running now, the ones still
 * warm after a disconnect, and the ones someone else has shared with you.
 *
 * Open sessions are the live tabs, so this list is real rather than a fixture.
 * The other two bands are fixtures, since the demo never really disconnects.
 */
export function DemoConnections({
  chrome = true,
  tabs = [],
  onFocusTab,
  onCloseTab,
}: {
  chrome?: boolean;
  tabs?: Tab[];
  onFocusTab?: (id: string) => void;
  onCloseTab?: (id: string) => void;
}) {
  const open = useMemo(
    () => tabs.filter((tab) => !!tab.host && tab.type !== "host-manager"),
    [tabs],
  );

  // Two hosts that were connected earlier in the session, kept warm.
  const background = DEMO_HOSTS.slice(0, 2);
  const shared = DEMO_HOSTS.slice(3, 4);

  const empty = open.length === 0 && background.length === 0;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Plug className="size-4" />}
      title="Connections"
      status={`${open.length} open`}
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {empty ? (
        <EmptyState
          icon={Plug}
          title="No active connections"
          hint="Sessions you open stay listed here while they run."
        />
      ) : (
        <>
          <GroupHeading title="Open" count={open.length} />
          {open.length === 0 ? (
            <span className="px-1 text-[11px] text-muted-foreground">
              Nothing running right now.
            </span>
          ) : (
            open.map((tab) => (
              <div
                key={tab.id}
                className="group flex items-center gap-2 border border-border px-3 py-2"
              >
                <span className="size-1.5 shrink-0 rounded-full bg-accent-brand" />
                <button
                  type="button"
                  onClick={() => onFocusTab?.(tab.id)}
                  className="flex min-w-0 flex-1 flex-col text-left"
                >
                  <span className="truncate text-xs font-medium">
                    {tab.customLabel || tab.label}
                  </span>
                  <Facts className="text-[10px] text-muted-foreground">
                    <span>{tab.host?.name}</span>
                    <span className="uppercase">{tab.type}</span>
                  </Facts>
                </button>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  title="Close"
                  onClick={() => onCloseTab?.(tab.id)}
                  className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <X className="size-3" />
                </Button>
              </div>
            ))
          )}

          <GroupHeading title="Background" count={background.length} />
          {background.map((host) => (
            <div
              key={host.id}
              className="group flex items-center gap-2 border border-border px-3 py-2"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-xs font-medium">
                  {host.name}
                </span>
                <Facts className="text-[10px] text-muted-foreground">
                  <span>Kept warm</span>
                  <span>Expires in 24m</span>
                </Facts>
              </div>
              <Button
                variant="ghost"
                size="icon-xs"
                title="Reconnect"
                className="shrink-0 text-muted-foreground hover:text-accent-brand"
              >
                <RotateCcw className="size-3" />
              </Button>
            </div>
          ))}

          {shared.length > 0 && (
            <>
              <GroupHeading title="Shared with me" count={shared.length} />
              {shared.map((host) => (
                <div
                  key={host.id}
                  className="flex items-center gap-2 border border-border px-3 py-2"
                >
                  <Share2 className="size-3 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-xs font-medium">
                      {host.name}
                    </span>
                    <Facts className="text-[10px] text-muted-foreground">
                      <span>From alex</span>
                      <span>Read only</span>
                    </Facts>
                  </div>
                  <Button variant="outline" size="xs" className="shrink-0">
                    Join
                  </Button>
                </div>
              ))}
            </>
          )}
        </>
      )}
    </PanelShell>
  );
}
