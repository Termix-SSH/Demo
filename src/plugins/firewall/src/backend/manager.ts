import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { scriptError, scrub } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ChangeResult,
  FirewallStatus,
  PendingChange,
} from "../shared/types.js";
import { moduleFor } from "./backends/index.js";
import { type Change, type HostState, snapshotOf } from "./backends/types.js";
import { FirewallError } from "./errors.js";
import { isRisky, lockoutReason } from "./guard.js";
import type { HostSettings } from "./host-settings.js";
import { installScript } from "./install.js";
import { parseState, READ_SCRIPT } from "./read.js";
import type { Remote } from "./remote.js";
import { armScript, keepScript, undoScript } from "./rollback.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
// Tables come from ctx.db.define, which the SDK hands back untyped.
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

interface PendingRow {
  hostId: number;
  token: string;
  label: string;
  expiresAt: number;
  reachable: boolean | null;
  userId: string;
}

export interface ChangeOptions {
  label: string;
  /** Go ahead even when the change looks like it cuts off SSH. */
  force?: boolean;
  /** Keep the change by itself once Termix can open a new connection. */
  autoKeep?: boolean;
}

export interface Manager {
  state: (hostId: number, settings: HostSettings) => Promise<HostState>;
  status: (
    hostId: number,
    settings: HostSettings,
    canEdit: boolean,
  ) => Promise<FirewallStatus>;
  raw: (hostId: number, settings: HostSettings) => Promise<string>;
  change: (
    hostId: number,
    settings: HostSettings,
    change: Change,
    options: ChangeOptions,
  ) => Promise<ChangeResult>;
  keep: (hostId: number, settings: HostSettings) => Promise<{ state: string }>;
  undo: (hostId: number, settings: HostSettings) => Promise<{ state: string }>;
  pending: (hostId: number) => Promise<PendingChange | null>;
  install: (
    hostId: number,
    settings: HostSettings,
    what: string,
  ) => Promise<void>;
  /** Runs work for one host after any other write to it has finished. */
  locked: <T>(hostId: number, work: () => Promise<T>) => Promise<T>;
}

/** How long past its time a pending change is kept, in case the host clock is a bit behind. */
const GRACE_MS = 30_000;

export function createManager(
  ctx: PluginContext,
  remote: Remote,
  pendingTable: Table,
  onWrite: (hostId: number) => void,
): Manager {
  const db = () => ctx.db.client<Drizzle>();
  const locks = new Map<number, Promise<unknown>>();

  function locked<T>(hostId: number, work: () => Promise<T>): Promise<T> {
    const previous = locks.get(hostId) ?? Promise.resolve();
    const next = previous.catch(() => undefined).then(work);
    locks.set(hostId, next);
    next
      .finally(() => {
        if (locks.get(hostId) === next) locks.delete(hostId);
      })
      .catch(() => undefined);
    return next;
  }

  async function getRow(hostId: number): Promise<PendingRow | null> {
    const rows = (await (
      await db()
    )
      .select()
      .from(pendingTable)
      .where(eq(pendingTable.hostId, hostId))) as Array<
      PendingRow & {
        expiresAt: number | string;
        reachable: boolean | number | null;
      }
    >;
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      expiresAt: Number(row.expiresAt),
      reachable:
        row.reachable === null || row.reachable === undefined
          ? null
          : !!row.reachable,
    };
  }

  async function clearRow(hostId: number): Promise<void> {
    await (
      await db()
    )
      .delete(pendingTable)
      .where(eq(pendingTable.hostId, hostId));
    await ctx.db.persist();
  }

  async function saveRow(row: PendingRow): Promise<void> {
    const client = await db();
    await client
      .delete(pendingTable)
      .where(eq(pendingTable.hostId, row.hostId));
    await client.insert(pendingTable).values(row);
    await ctx.db.persist();
  }

  const view = (row: PendingRow): PendingChange => ({
    token: row.token,
    hostId: row.hostId,
    label: row.label,
    expiresAt: row.expiresAt,
    reachable: row.reachable,
  });

  /** The pending change, after checking the host still has it. */
  async function livePending(
    hostId: number,
    state?: HostState,
  ): Promise<PendingRow | null> {
    const row = await getRow(hostId);
    if (!row) return null;
    const gone = state
      ? !state.pendingTokens.includes(row.token)
      : Date.now() > row.expiresAt + GRACE_MS;
    if (gone) {
      await clearRow(hostId);
      return null;
    }
    return row;
  }

  async function state(
    hostId: number,
    settings: HostSettings,
  ): Promise<HostState> {
    const host = await ctx.hosts.get(hostId);
    const { stdout } = await remote.root(hostId, settings.sudo, READ_SCRIPT, {
      timeoutMs: 45_000,
    });
    return parseState(stdout, Number(host?.port) || 22);
  }

  async function runPlain(
    hostId: number,
    settings: HostSettings,
    script: string,
  ): Promise<void> {
    await remote.root(hostId, settings.sudo, script, { timeoutMs: 120_000 });
    onWrite(hostId);
  }

  async function keepRow(
    hostId: number,
    settings: HostSettings,
    row: PendingRow,
  ): Promise<string> {
    const { stdout } = await remote.root(
      hostId,
      settings.sudo,
      keepScript(row.token),
    );
    await clearRow(hostId);
    onWrite(hostId);
    return stdout.includes("state=kept") ? "kept" : "gone";
  }

  return {
    state,
    locked,

    async status(hostId, settings, canEdit) {
      const current = await state(hostId, settings);
      const row = await livePending(hostId, current);
      if (!row && current.pendingTokens.length) {
        current.warnings.push(
          "A change from somewhere else is waiting to be undone on this host.",
        );
      }
      const {
        managed: _managed,
        pendingTokens: _tokens,
        hasSystemd: _sd,
        ...rest
      } = current;
      return {
        ...rest,
        canEdit: canEdit && !settings.readOnly,
        readOnly: settings.readOnly,
        sshGuard: settings.sshGuard,
        pending: row ? view(row) : null,
      };
    },

    async raw(hostId, settings) {
      const current = await state(hostId, settings);
      const module = moduleFor(current.backend);
      const { stdout } = await remote.root(
        hostId,
        settings.sudo,
        `${module.raw}\nexit 0`,
        {
          allowFail: true,
        },
      );
      return stdout;
    },

    change(hostId, settings, change, options) {
      return locked(hostId, async () => {
        const current = await state(hostId, settings);
        if (await livePending(hostId, current)) {
          throw new FirewallError("Keep or undo the last change first", 409, {
            code: "pending",
          });
        }
        const module = moduleFor(current.backend);
        const plan = module.plan(current, change);
        if (plan.noop) return { ok: true, pending: null };
        if (settings.sshGuard && !options.force) {
          const reason = lockoutReason(
            current,
            plan.after,
            snapshotOf(current),
          );
          if (reason) {
            throw new FirewallError(
              `This change could lock Termix out over SSH. ${reason}.`,
              409,
              {
                code: "SSH_LOCKOUT",
                reason,
              },
            );
          }
        }
        if (!settings.confirmAll && !isRisky(current, change)) {
          await runPlain(hostId, settings, plan.script);
          return { ok: true, pending: null };
        }

        const token = randomBytes(8).toString("hex");
        const row: PendingRow = {
          hostId,
          token,
          label: options.label.slice(0, 200),
          expiresAt: Date.now() + settings.rollbackSeconds * 1000,
          reachable: null,
          userId: String(ctx.currentActor() ?? ""),
        };
        const script = armScript(
          module,
          token,
          settings.rollbackSeconds,
          plan.script,
        );
        let stdout = "";
        let code: number | null = 0;
        try {
          const result = await remote.root(hostId, settings.sudo, script, {
            allowFail: true,
            timeoutMs: 120_000,
          });
          stdout = result.stdout;
          code = result.code;
        } catch (error) {
          // The connection may have dropped mid change. If the backup was made,
          // the host undoes the change by itself, so keep track of it.
          if (error instanceof FirewallError && error.extra.code === "sudo")
            throw error;
          await saveRow(row);
          onWrite(hostId);
          return { ok: true, pending: view(row) };
        }
        if (code !== 0) {
          onWrite(hostId);
          const message = scriptError(stdout) || "The change failed";
          throw new FirewallError(
            stdout.includes("@@reverted@@")
              ? `${scrub(message, 1200)}. Nothing was changed.`
              : scrub(message, 1200),
          );
        }
        await saveRow(row);
        onWrite(hostId);
        row.reachable = await remote.probe(hostId);
        await saveRow(row);
        if (options.autoKeep && row.reachable) {
          await keepRow(hostId, settings, row);
          return { ok: true, pending: null };
        }
        return { ok: true, pending: view(row) };
      });
    },

    keep(hostId, settings) {
      return locked(hostId, async () => {
        const row = await getRow(hostId);
        if (!row)
          throw new FirewallError("There is no change waiting", 404, {
            code: "none",
          });
        const result = await keepRow(hostId, settings, row);
        if (result === "gone") {
          throw new FirewallError(
            "Time ran out and the host already undid the change",
            410,
            { code: "gone" },
          );
        }
        return { state: result };
      });
    },

    undo(hostId, settings) {
      return locked(hostId, async () => {
        const row = await getRow(hostId);
        if (!row)
          throw new FirewallError("There is no change waiting", 404, {
            code: "none",
          });
        const { stdout } = await remote.root(
          hostId,
          settings.sudo,
          undoScript(row.token),
        );
        await clearRow(hostId);
        onWrite(hostId);
        return {
          state: stdout.includes("state=reverted") ? "reverted" : "gone",
        };
      });
    },

    async pending(hostId) {
      const row = await livePending(hostId);
      return row ? view(row) : null;
    },

    install(hostId, settings, what) {
      return locked(hostId, async () => {
        const current = await state(hostId, settings);
        await remote.root(
          hostId,
          settings.sudo,
          installScript(what, current.packageManager),
          {
            timeoutMs: 600_000,
          },
        );
        onWrite(hostId);
      });
    },
  };
}
