import { and, eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Inventory } from "../shared/types.js";
import { readHostSettings } from "./host-settings.js";
import { isUp, type InventoryStore, type Transition } from "./inventory.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WATCH_TICK_MS = 60_000;
export const MAX_WATCHES = 500;
const POOL_FULL = 0.9;
const POOL_CLEAR = 0.85;

export interface WatchRow {
  userId: string;
  hostId: number;
  uuid: string;
  name: string;
}

export interface WatchStore {
  listAll: () => Promise<WatchRow[]>;
  has: (userId: string, hostId: number, uuid: string) => Promise<boolean>;
  set: (row: WatchRow, on: boolean) => Promise<void>;
}

export function createWatchStore(ctx: PluginContext, table: Table): WatchStore {
  const db = () => ctx.db.client<Drizzle>();
  const forUser = async (userId: string) =>
    (await (
      await db()
    )
      .select()
      .from(table)
      .where(eq(table.userId, userId))) as WatchRow[];
  return {
    async listAll() {
      return (await (await db()).select().from(table)) as WatchRow[];
    },
    async has(userId, hostId, uuid) {
      return (await forUser(userId)).some(
        (row) => row.hostId === hostId && row.uuid === uuid,
      );
    },
    async set(row, on) {
      const have = await forUser(row.userId);
      const exists = have.some(
        (r) => r.hostId === row.hostId && r.uuid === row.uuid,
      );
      if (on) {
        if (exists) return;
        if (have.length >= MAX_WATCHES) {
          throw new Error(`You can watch up to ${MAX_WATCHES} VMs`);
        }
        await (await db()).insert(table).values(row);
      } else {
        await (
          await db()
        )
          .delete(table)
          .where(
            and(
              eq(table.userId, row.userId),
              eq(table.hostId, row.hostId),
              eq(table.uuid, row.uuid),
            ),
          );
      }
      await ctx.db.persist();
    },
  };
}

const EVENT_OF: Partial<Record<string, string>> = {
  running: "virtual-machines.vm-started",
  shutoff: "virtual-machines.vm-stopped",
  crashed: "virtual-machines.vm-crashed",
};

export function sendEvents(ctx: PluginContext, changes: Transition[]): void {
  for (const change of changes) {
    const event = EVENT_OF[change.to];
    if (!event) continue;
    try {
      ctx.operations.emit(
        event,
        { uuid: change.uuid, name: change.name, from: change.from },
        { hostId: change.hostId },
      );
    } catch (error) {
      ctx.log.debug(`Could not emit ${event}: ${String(error)}`);
    }
  }
}

/** What an alert should say about a change, or null for no alert. */
export function alertFor(
  change: Transition,
): { kind: "crashed" | "stopped"; severity: "critical" | "warning" } | null {
  if (change.to === "crashed") return { kind: "crashed", severity: "critical" };
  if (isUp(change.from) && !isUp(change.to) && !change.expected) {
    return { kind: "stopped", severity: "warning" };
  }
  return null;
}

/**
 * Keeps watched hosts' inventory fresh, as a user who may see them. The state
 * changes come back through the inventory's onRead, so anything that reads a
 * host can raise them.
 */
export class WatchChecker {
  private stopTimer: (() => void) | null = null;
  private disposed = false;
  /** Pools already reported, as `hostId:pool`. */
  private readonly fullPools = new Set<string>();

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: WatchStore,
    private readonly inventory: InventoryStore,
  ) {}

  start(): void {
    this.stopTimer = this.ctx.schedule.every(WATCH_TICK_MS, () => this.tick(), {
      jitterMs: 5_000,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stopTimer?.();
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    const rows = await this.store.listAll().catch(() => [] as WatchRow[]);
    const hosts = new Map<number, string>();
    for (const row of rows) hosts.set(row.hostId, row.userId);
    await Promise.all(
      [...hosts].map(async ([hostId, userId]) => {
        try {
          await this.ctx.asUser(userId, async () => {
            const access = await this.ctx.hosts.checkAccess(hostId, "connect");
            if (!access.hasAccess) return;
            const settings = await readHostSettings(this.ctx, hostId);
            if (!settings.enabled) return;
            await this.inventory.get(
              { hostId, settings },
              { maxAgeMs: WATCH_TICK_MS - 10_000 },
            );
          });
        } catch (error) {
          this.ctx.log.debug(
            `VM watch failed for host ${hostId}: ${String(error)}`,
          );
        }
      }),
    );
  }

  /** Called on every inventory read. */
  async onRead(
    hostId: number,
    inventory: Inventory,
    changes: Transition[],
  ): Promise<void> {
    sendEvents(this.ctx, changes);
    const fullNow = inventory.pools.filter(
      (pool) => pool.capacity && pool.allocation / pool.capacity >= POOL_FULL,
    );
    for (const pool of inventory.pools) {
      if (pool.capacity && pool.allocation / pool.capacity < POOL_CLEAR) {
        this.fullPools.delete(`${hostId}:${pool.name}`);
      }
    }
    const newPools = fullNow.filter(
      (pool) => !this.fullPools.has(`${hostId}:${pool.name}`),
    );
    if (!changes.length && !newPools.length) return;
    const rows = (
      await this.store.listAll().catch(() => [] as WatchRow[])
    ).filter((row) => row.hostId === hostId);
    if (!rows.length) return;
    for (const change of changes) {
      const alert = alertFor(change);
      if (!alert) continue;
      for (const row of rows.filter((r) => r.uuid === change.uuid)) {
        await this.send(row.userId, hostId, {
          title:
            alert.kind === "crashed"
              ? `${change.name} crashed`
              : `${change.name} stopped`,
          body:
            alert.kind === "crashed"
              ? "The VM crashed. Check its console and logs."
              : "Termix did not stop this VM.",
          severity: alert.severity,
          category: `virtual-machines.${alert.kind}`,
          dedupeKey: `virtual-machines:${hostId}:${change.uuid}:${alert.kind}`,
        });
      }
    }
    const users = [...new Set(rows.map((row) => row.userId))];
    for (const pool of newPools) {
      this.fullPools.add(`${hostId}:${pool.name}`);
      for (const userId of users) {
        await this.send(userId, hostId, {
          title: `Storage pool ${pool.name} is almost full`,
          body: `${Math.round((pool.allocation / pool.capacity) * 100)}% used. VMs can pause when it fills up.`,
          severity: "warning",
          category: "virtual-machines.pool_full",
          dedupeKey: `virtual-machines:${hostId}:pool:${pool.name}`,
        });
      }
    }
  }

  private async send(
    userId: string,
    hostId: number,
    alert: {
      title: string;
      body: string;
      severity: "critical" | "warning";
      category: string;
      dedupeKey: string;
    },
  ): Promise<void> {
    try {
      const host = await this.ctx
        .asUser(userId, () => this.ctx.hosts.get(hostId))
        .catch(() => null);
      const hostName = host?.name || host?.ip || `#${hostId}`;
      await this.ctx.notify.send({
        ...alert,
        title: `${alert.title} on ${hostName}`,
        audience: { userId },
        link: { tab: "virtual-machines" },
        context: { hostId, hostName },
      });
    } catch (error) {
      this.ctx.log.warn(`Could not send a VM alert: ${String(error)}`);
    }
  }
}
