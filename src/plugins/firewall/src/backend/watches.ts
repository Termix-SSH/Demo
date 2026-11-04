import { and, eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { HostState } from "./backends/types.js";
import { readHostSettings } from "./host-settings.js";
import { hashId } from "./shell.js";
import { specKey } from "./validate.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const WATCH_TICK_MS = 5 * 60_000;
export const MAX_WATCHES = 200;

export interface WatchRow {
  userId: string;
  hostId: number;
}

export interface WatchStore {
  has: (userId: string, hostId: number) => Promise<boolean>;
  listForUser: (userId: string) => Promise<number[]>;
  listAll: () => Promise<WatchRow[]>;
  set: (userId: string, hostId: number, on: boolean) => Promise<void>;
}

export function createWatchStore(ctx: PluginContext, table: Table): WatchStore {
  const db = () => ctx.db.client<Drizzle>();
  const forUser = async (userId: string) =>
    (
      (await (
        await db()
      )
        .select()
        .from(table)
        .where(eq(table.userId, userId))) as WatchRow[]
    ).map((r) => r.hostId);
  return {
    async has(userId, hostId) {
      return (await forUser(userId)).includes(hostId);
    },
    listForUser: forUser,
    async listAll() {
      return (await (await db()).select().from(table)) as WatchRow[];
    },
    async set(userId, hostId, on) {
      const have = await forUser(userId);
      if (on) {
        if (have.includes(hostId)) return;
        if (have.length >= MAX_WATCHES)
          throw new Error(`You can watch up to ${MAX_WATCHES} hosts`);
        await (await db()).insert(table).values({ userId, hostId });
      } else {
        await (
          await db()
        )
          .delete(table)
          .where(and(eq(table.userId, userId), eq(table.hostId, hostId)));
      }
      await ctx.db.persist();
    },
  };
}

/** A fingerprint of what the firewall does, ignoring comments. */
export function fingerprint(state: HostState): {
  hash: string;
  active: boolean;
} {
  const rules = state.rules.map((r) => `${r.zone ?? ""}:${specKey(r)}`).sort();
  return {
    hash: hashId(
      JSON.stringify({
        b: state.backend,
        a: state.active,
        d: state.defaults,
        z: state.defaultZone,
        rules,
      }),
    ),
    active: state.active,
  };
}

export interface WatchChange {
  userId: string;
  hostId: number;
  kind: "off" | "changed";
}

/**
 * Reads every watched host on a timer, as the user who watches it. The first
 * read only learns the firewall. A change Termix made itself is learned
 * without an alert.
 */
export class WatchChecker {
  private readonly last = new Map<
    string,
    { hash: string; active: boolean; at: number }
  >();
  private readonly writes = new Map<number, number>();
  private readonly running = new Set<string>();
  private stop: (() => void) | null = null;
  private disposed = false;

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: WatchStore,
    private readonly read: (hostId: number) => Promise<HostState>,
    private readonly onChange: (change: WatchChange) => Promise<void>,
  ) {}

  start(): void {
    this.stop = this.ctx.schedule.every(WATCH_TICK_MS, () => this.tick(), {
      jitterMs: 30_000,
    });
  }

  dispose(): void {
    this.disposed = true;
    this.stop?.();
    this.last.clear();
  }

  /** Termix changed this host, so the next difference is not news. */
  noteWrite(hostId: number): void {
    this.writes.set(hostId, Date.now());
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: WatchRow[];
    try {
      rows = await this.store.listAll();
    } catch (error) {
      this.ctx.log.warn(`Could not load firewall watches: ${String(error)}`);
      return;
    }
    const seen = new Set(rows.map((r) => `${r.userId}:${r.hostId}`));
    for (const key of [...this.last.keys()])
      if (!seen.has(key)) this.last.delete(key);
    await Promise.all(
      rows.map(async (row) => {
        const key = `${row.userId}:${row.hostId}`;
        if (this.running.has(key)) return;
        this.running.add(key);
        try {
          await this.check(row, key);
        } finally {
          this.running.delete(key);
        }
      }),
    );
  }

  private async check(row: WatchRow, key: string): Promise<void> {
    try {
      await this.ctx.asUser(row.userId, async () => {
        const access = await this.ctx.hosts.checkAccess(row.hostId, "connect");
        if (!access.hasAccess) return;
        if (!(await readHostSettings(this.ctx, row.hostId)).enabled) return;
        const startedAt = Date.now();
        const state = await this.read(row.hostId);
        if (this.disposed) return;
        const now = fingerprint(state);
        const before = this.last.get(key);
        this.last.set(key, { ...now, at: startedAt });
        if (!before || before.hash === now.hash) return;
        const wrote = this.writes.get(row.hostId) ?? 0;
        if (wrote >= before.at) return;
        await this.onChange({
          userId: row.userId,
          hostId: row.hostId,
          kind: before.active && !now.active ? "off" : "changed",
        });
      });
    } catch (error) {
      this.ctx.log.debug(
        `Firewall watch failed for host ${row.hostId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

export function createWatchAlerts(ctx: PluginContext) {
  return async ({ userId, hostId, kind }: WatchChange): Promise<void> => {
    try {
      const host = await ctx
        .asUser(userId, () => ctx.hosts.get(hostId))
        .catch(() => null);
      const hostName = host?.name || host?.ip || `#${hostId}`;
      await ctx.notify.send(
        kind === "off"
          ? {
              title: `The firewall turned off on ${hostName}`,
              body: "Termix did not do this. Check who changed it.",
              severity: "critical",
              category: "firewall.turned_off",
              audience: { userId },
              link: { tab: "firewall" },
              dedupeKey: `firewall:${hostId}:off`,
              context: { hostId, hostName },
            }
          : {
              title: `Firewall rules changed on ${hostName}`,
              body: "The rules changed outside Termix.",
              severity: "warning",
              category: "firewall.changed",
              audience: { userId },
              link: { tab: "firewall" },
              dedupeKey: `firewall:${hostId}:changed`,
              context: { hostId, hostName },
            },
      );
    } catch (error) {
      ctx.log.warn(
        `Could not send a firewall alert: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
