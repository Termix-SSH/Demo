/* eslint-disable react-refresh/only-export-components */
import { pluginIcon } from "@/demo/plugins/plugin-icons";
import {
  registerDashboardCard,
  unregisterDashboardCardsByPlugin,
  type DashboardCardContext,
} from "@/demo/dashboard-cards";
import { getPlugins, subscribePlugins } from "@/demo/plugins/plugin-store";
import { DEMO_CONTAINERS, DEMO_PROXMOX_GUESTS } from "@/demo/demo-data";

/**
 * Turns a plugin's declared dashboard cards into real ones.
 *
 * This is the whole point of the contribution model: a plugin that says it adds
 * a dashboard card should actually add one, and removing the plugin should take
 * it away again. Three rules make it behave rather than decorate:
 *
 *   - uninstalled: the card is withdrawn, but the layout keeps its slot, so
 *     reinstalling puts it back where it was
 *   - disabled: the card stays but reports that the plugin is not running,
 *     rather than silently vanishing
 *   - no ui:surface capability: nothing is registered at all, which is what
 *     makes that capability mean something
 */

function Rows({
  rows,
}: {
  rows: { name: string; detail: string; ok: boolean }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground">
        Nothing to show
      </div>
    );
  }
  return (
    <div className="flex flex-col">
      {rows.map((row) => (
        <div
          key={row.name}
          className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0"
        >
          <span
            className={`size-1.5 shrink-0 rounded-full ${row.ok ? "bg-accent-brand" : "bg-muted-foreground/40"}`}
          />
          <span className="truncate text-xs font-medium">{row.name}</span>
          <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
            {row.detail}
          </span>
        </div>
      ))}
    </div>
  );
}

function NotRunning({ name }: { name: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 py-6 text-center">
      <span className="text-xs text-muted-foreground">
        {name} is not running
      </span>
      <span className="text-[11px] text-muted-foreground/70">
        Enable the plugin to see this again.
      </span>
    </div>
  );
}

function body(kind: string, ctx: DashboardCardContext) {
  if (kind === "containers") {
    return (
      <Rows
        rows={DEMO_CONTAINERS.slice(0, 6).map((c) => ({
          name: c.name,
          detail: c.state,
          ok: c.state === "running",
        }))}
      />
    );
  }
  if (kind === "guests") {
    return (
      <Rows
        rows={DEMO_PROXMOX_GUESTS.slice(0, 6).map((g) => ({
          name: g.name,
          detail: `${g.cpu}% cpu`,
          ok: g.status === "running",
        }))}
      />
    );
  }
  return (
    <Rows
      rows={ctx.hosts.slice(0, 6).map((h) => ({
        name: h.name,
        detail: h.cpu === null ? "no data" : `${h.cpu}% cpu`,
        ok: h.status === "online",
      }))}
    />
  );
}

/** Re-derives every plugin card from the store's current state. */
function sync() {
  for (const plugin of getPlugins()) {
    const cards = plugin.contributions?.dashboardCards;

    // A plugin that never asked to add UI does not get to. Withdrawing runs
    // before the empty check so a plugin that drops its cards on update, or
    // loses ui:surface, does not leave stale ones registered.
    const allowed = plugin.capabilities.includes("ui:surface");
    if (!cards?.length || !plugin.installed || !allowed) {
      unregisterDashboardCardsByPlugin(plugin.id);
      continue;
    }

    const running = plugin.state === "enabled";
    for (const card of cards) {
      registerDashboardCard({
        id: card.id,
        label: card.label,
        icon: pluginIcon(card.icon),
        frame: "framed",
        defaultPanel: "side",
        defaultHeight: 220,
        optional: true,
        pluginId: plugin.id,
        render: (ctx) =>
          running ? body(card.kind, ctx) : <NotRunning name={plugin.name} />,
      });
    }
  }
}

let started = false;

/** Called once at app start; further syncs come from the store itself. */
export function startDashboardPluginCards(): void {
  if (started) return;
  started = true;
  sync();
  subscribePlugins(sync);
}
