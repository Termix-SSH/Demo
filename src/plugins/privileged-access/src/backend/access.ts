import { eq } from "drizzle-orm";
import type {
  PluginConnectPolicyDecision,
  PluginConnectPolicyInput,
  PluginContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { AccessRequest, RequestStore } from "./store.js";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Table = any;
type Drizzle = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export const APPROVE_PERMISSION = "privileged-access.approve";
export const REQUEST_TAB = "access";
const CACHE_MS = 15_000;
const BYPASS_ALERT_GAP_MS = 60 * 60 * 1000;
const LIVE_PROVIDERS = ["ssh", "rdp", "vnc", "ard", "telnet"];

export interface HostAccessSettings {
  privileged: boolean;
  approverRoles: string[];
  maxHours: number;
  requireReason: boolean;
  requireTicket: boolean;
  allowBackground: boolean;
}

interface LiveProvider {
  listForUser?: (
    userId: string,
  ) =>
    | Array<{ id: string; hostId: number }>
    | Promise<Array<{ id: string; hostId: number }>>;
  ownerEndSession?: (id: string, reason: string) => unknown;
}

export type AccessService = ReturnType<typeof createAccessService>;

/**
 * Who may connect where. Grants live in memory (one entry per user and host,
 * the latest expiry) and are rebuilt from the table on every change, so the
 * connect check never waits on the database.
 */
export function createAccessService(ctx: PluginContext, store: RequestStore) {
  const grants = new Map<string, number>();
  const settingsCache = new Map<
    number,
    { at: number; value: HostAccessSettings }
  >();
  const lastBypassAlert = new Map<string, number>();
  const key = (userId: string, hostId: number) => `${userId}:${hostId}`;

  async function reloadGrants(): Promise<void> {
    const approved = await store.byStatus(["approved"]);
    grants.clear();
    const now = Date.now();
    for (const row of approved) {
      const until = row.expiresAt ? Date.parse(row.expiresAt) : 0;
      if (until <= now) continue;
      const k = key(row.userId, row.hostId);
      grants.set(k, Math.max(grants.get(k) ?? 0, until));
    }
  }

  async function hostSettings(hostId: number): Promise<HostAccessSettings> {
    const cached = settingsCache.get(hostId);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
    const read = <T>(name: string) => ctx.settings.getHost<T>(hostId, name);
    const roles = String((await read<string>("approverRoles")) ?? "");
    const maxHours = Number(await read<number>("maxHours"));
    const value: HostAccessSettings = {
      privileged: (await read<boolean>("privileged")) === true,
      approverRoles: roles
        .split(",")
        .map((role) => role.trim().toLowerCase())
        .filter(Boolean),
      maxHours:
        Number.isFinite(maxHours) && maxHours >= 1
          ? Math.min(maxHours, 168)
          : 4,
      requireReason: (await read<boolean>("requireReason")) !== false,
      requireTicket: (await read<boolean>("requireTicket")) === true,
      allowBackground: (await read<boolean>("allowBackground")) === true,
    };
    settingsCache.set(hostId, { at: Date.now(), value });
    return value;
  }

  function hasGrant(userId: string, hostId: number): boolean {
    const until = grants.get(key(userId, hostId));
    return !!until && until > Date.now();
  }

  async function refs() {
    return ctx.db.refs<{ users: Table; roles: Table; userRoles: Table }>();
  }

  async function usernameFor(userId: string): Promise<string | null> {
    const { users } = await refs();
    const drizzle = await ctx.db.client<Drizzle>();
    const rows = await drizzle
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, userId));
    return rows[0]?.username ?? null;
  }

  async function isAdmin(userId: string): Promise<boolean> {
    const { users } = await refs();
    const drizzle = await ctx.db.client<Drizzle>();
    const rows = await drizzle
      .select({ isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId));
    return rows[0]?.isAdmin === true || rows[0]?.isAdmin === 1;
  }

  async function roleNames(userId: string): Promise<string[]> {
    const { roles, userRoles } = await refs();
    const drizzle = await ctx.db.client<Drizzle>();
    const rows = await drizzle
      .select({ name: roles.name })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));
    return rows.map((row: { name: string }) => String(row.name).toLowerCase());
  }

  /** Why an approver can't decide a request, or null when they can. */
  async function approveRefusal(
    approverId: string,
    request: AccessRequest,
  ): Promise<string | null> {
    if (approverId === request.userId) {
      return "You can't approve your own request";
    }
    if (!(await ctx.rbac.hasFor(approverId, APPROVE_PERMISSION))) {
      return "You can't approve requests";
    }
    const settings = await hostSettings(request.hostId);
    if (settings.approverRoles.length === 0) return null;
    if (await isAdmin(approverId)) return null;
    const mine = await roleNames(approverId);
    return settings.approverRoles.some((role) => mine.includes(role))
      ? null
      : "Only the approver roles of this host can decide";
  }

  async function hostName(hostId: number): Promise<string> {
    const host = await ctx.hosts.get(hostId).catch(() => null);
    return host?.name || host?.ip || `#${hostId}`;
  }

  async function breakGlass(input: PluginConnectPolicyInput): Promise<void> {
    const k = key(input.userId, input.hostId);
    const now = Date.now();
    if (now - (lastBypassAlert.get(k) ?? 0) < BYPASS_ALERT_GAP_MS) return;
    lastBypassAlert.set(k, now);
    const name = await hostName(input.hostId);
    const who = (await usernameFor(input.userId)) ?? input.userId;
    await ctx.audit
      .record({
        action: "privileged_access_bypassed",
        resourceType: "host",
        resourceId: String(input.hostId),
        resourceName: name,
        details: `${who} connected with break glass access (${input.protocol})`,
        success: true,
      })
      .catch(() => {});
    if ((await ctx.settings.get<boolean>("alertBypass")) !== false) {
      await ctx.notify
        .send({
          title: `${who} used break glass access on ${name}`,
          body: `${input.protocol.toUpperCase()} session without an approved request`,
          severity: "critical",
          category: "privileged-access.bypass",
          audience: { permission: APPROVE_PERMISSION },
          dedupeKey: `bypass:${k}:${Math.floor(now / BYPASS_ALERT_GAP_MS)}`,
          link: { tab: REQUEST_TAB },
          context: { hostId: input.hostId, hostName: name },
        })
        .catch(() => {});
    }
    await ctx.operations
      ?.emit(
        "privileged-access.bypassed",
        { userId: input.userId, protocol: input.protocol },
        { hostId: input.hostId },
      )
      .catch(() => {});
  }

  /** The connect policy core asks before every session. */
  async function check(
    input: PluginConnectPolicyInput,
  ): Promise<PluginConnectPolicyDecision> {
    const settings = await hostSettings(input.hostId);
    if (!settings.privileged) return { decision: "allow" };
    if (!input.interactive && settings.allowBackground) {
      return { decision: "allow" };
    }
    if (hasGrant(input.userId, input.hostId)) return { decision: "allow" };
    if (await ctx.rbac.hasFor(input.userId, "privileged-access.bypass")) {
      void breakGlass(input);
      return { decision: "allow" };
    }
    return {
      decision: "request",
      reason: "This host needs approved access. Ask for access to connect.",
      requestTab: REQUEST_TAB,
    };
  }

  /** Ends a user's open sessions on a host, as that user. */
  async function endSessions(
    userId: string,
    hostId: number,
    reason: string,
  ): Promise<number> {
    let ended = 0;
    const providers = await ctx.services.providers("sessions.live");
    for (const protocol of LIVE_PROVIDERS) {
      if (!providers.includes(protocol)) continue;
      try {
        ended += await ctx.asUser(userId, async () => {
          const live = await ctx.services.get<LiveProvider>("sessions.live", {
            provider: protocol,
          });
          if (!live.listForUser || !live.ownerEndSession) return 0;
          const mine = (await live.listForUser(userId)).filter(
            (session) => session.hostId === hostId,
          );
          for (const session of mine) {
            await live.ownerEndSession(session.id, reason);
          }
          return mine.length;
        });
      } catch (error) {
        ctx.log.warn(
          `Could not end ${protocol} sessions: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return ended;
  }

  return {
    check,
    reloadGrants,
    hostSettings,
    hasGrant,
    grantUntil: (userId: string, hostId: number) =>
      grants.get(key(userId, hostId)) ?? null,
    forgetHost: (hostId: number) => settingsCache.delete(hostId),
    usernameFor,
    approveRefusal,
    hostName,
    endSessions,
  };
}
