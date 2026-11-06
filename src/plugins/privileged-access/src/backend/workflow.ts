import type { Request } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { AccessRequest, RequestStore } from "./store.js";
import {
  APPROVE_PERMISSION,
  REQUEST_TAB,
  type AccessService,
} from "./access.js";

const TICK_MS = 60_000;

export class WorkflowError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

export type Workflow = ReturnType<typeof createWorkflow>;

function text(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function createWorkflow(
  ctx: PluginContext,
  store: RequestStore,
  access: AccessService,
) {
  async function audit(
    action: string,
    row: AccessRequest,
    details: string,
    req?: Request,
  ) {
    await ctx.audit
      .record({
        action,
        resourceType: "host",
        resourceId: String(row.hostId),
        resourceName: row.hostName ?? undefined,
        details,
        success: true,
        request: req,
      })
      .catch(() => {});
  }

  async function notifyRequester(row: AccessRequest, title: string) {
    await ctx.notify
      .send({
        title,
        body: row.comment ?? undefined,
        severity: row.status === "approved" ? "success" : "info",
        category: `privileged-access.${row.status}`,
        audience: { userId: row.userId },
        link: { tab: REQUEST_TAB },
        context: { hostId: row.hostId, hostName: row.hostName ?? undefined },
      })
      .catch(() => {});
  }

  async function pendingHours(): Promise<number> {
    const value = Number(await ctx.settings.get<number>("pendingHours"));
    return Number.isFinite(value) && value >= 1 ? value : 24;
  }

  return {
    /** A new request from the acting user. Returns an open one if there is. */
    async request(
      input: {
        hostId: unknown;
        hours: unknown;
        reason: unknown;
        ticket: unknown;
      },
      req?: Request,
    ): Promise<AccessRequest> {
      const userId = ctx.currentActor();
      if (!userId) throw new WorkflowError("Not signed in", 401);
      const hostId = Number(input.hostId);
      if (!Number.isSafeInteger(hostId) || hostId <= 0) {
        throw new WorkflowError("Pick a host");
      }
      const reachable = await ctx.hosts.checkAccess(hostId, "connect");
      if (!reachable.hasAccess) throw new WorkflowError("Host not found", 404);
      const settings = await access.hostSettings(hostId);
      if (!settings.privileged) {
        throw new WorkflowError("This host does not need approved access");
      }
      const hours = Math.round(Number(input.hours));
      if (!Number.isFinite(hours) || hours < 1) {
        throw new WorkflowError("Ask for at least one hour");
      }
      if (hours > settings.maxHours) {
        throw new WorkflowError(
          `This host allows at most ${settings.maxHours} hours`,
        );
      }
      const reason = text(input.reason, 500);
      const ticket = text(input.ticket, 120);
      if (settings.requireReason && !reason) {
        throw new WorkflowError("Say why you need access");
      }
      if (settings.requireTicket && !ticket) {
        throw new WorkflowError("This host needs a ticket number");
      }
      const open = (await store.forUser(userId, 50)).find(
        (row) => row.hostId === hostId && row.status === "pending",
      );
      if (open) return open;

      const row = await store.create({
        hostId,
        hostName: await access.hostName(hostId),
        userId,
        username: await access.usernameFor(userId),
        reason: reason || null,
        ticket: ticket || null,
        hours,
      });
      await audit(
        "privileged_access_requested",
        row,
        `${row.username ?? userId} asked for ${hours} h${ticket ? `, ticket ${ticket}` : ""}: ${reason}`,
        req,
      );
      await ctx.notify
        .send({
          title: `${row.username ?? userId} asks for access to ${row.hostName}`,
          body: `${hours} h${ticket ? ` | ${ticket}` : ""}${reason ? ` | ${reason}` : ""}`,
          severity: "warning",
          category: "privileged-access.request",
          audience: { permission: APPROVE_PERMISSION },
          dedupeKey: `request:${row.id}`,
          link: { tab: REQUEST_TAB },
          context: { hostId, hostName: row.hostName ?? undefined },
        })
        .catch(() => {});
      await ctx.operations
        ?.emit(
          "privileged-access.requested",
          { requestId: row.id, userId, hours },
          { hostId },
        )
        .catch(() => {});
      return row;
    },

    async decide(
      id: number,
      approve: boolean,
      comment: unknown,
      req?: Request,
    ): Promise<AccessRequest> {
      const approverId = ctx.currentActor();
      if (!approverId) throw new WorkflowError("Not signed in", 401);
      const row = await store.get(id);
      if (!row) throw new WorkflowError("Request not found", 404);
      if (row.status !== "pending") {
        throw new WorkflowError("This request was already decided", 409);
      }
      const refusal = await access.approveRefusal(approverId, row);
      if (refusal) throw new WorkflowError(refusal, 403);
      const now = new Date();
      const note = text(comment, 500) || null;
      const fields: Partial<AccessRequest> = {
        status: approve ? "approved" : "denied",
        decidedBy: approverId,
        decidedByName: await access.usernameFor(approverId),
        decidedAt: now.toISOString(),
        comment: note,
        ...(approve
          ? {
              startsAt: now.toISOString(),
              expiresAt: new Date(
                now.getTime() + row.hours * 3_600_000,
              ).toISOString(),
            }
          : {}),
      };
      await store.update(id, fields);
      const updated = { ...row, ...fields } as AccessRequest;
      await access.reloadGrants();
      await audit(
        approve ? "privileged_access_approved" : "privileged_access_denied",
        updated,
        `${updated.decidedByName ?? approverId} ${approve ? "approved" : "denied"} ${row.username ?? row.userId}${note ? `: ${note}` : ""}`,
        req,
      );
      await notifyRequester(
        updated,
        approve
          ? `Access to ${row.hostName} approved for ${row.hours} h`
          : `Access to ${row.hostName} was denied`,
      );
      if (approve) {
        await ctx.operations
          ?.emit(
            "privileged-access.approved",
            { requestId: id, userId: row.userId, hours: row.hours },
            { hostId: row.hostId },
          )
          .catch(() => {});
      }
      return updated;
    },

    /** Ends a grant early, or withdraws a pending request. */
    async end(
      id: number,
      comment: unknown,
      req?: Request,
    ): Promise<AccessRequest> {
      const actor = ctx.currentActor();
      if (!actor) throw new WorkflowError("Not signed in", 401);
      const row = await store.get(id);
      if (!row) throw new WorkflowError("Request not found", 404);
      const own = row.userId === actor;
      if (!own && (await access.approveRefusal(actor, row))) {
        throw new WorkflowError("You can't change this request", 403);
      }
      if (row.status !== "pending" && row.status !== "approved") {
        throw new WorkflowError("This request is already closed", 409);
      }
      const now = new Date().toISOString();
      const status = row.status === "pending" ? "cancelled" : "revoked";
      const note = text(comment, 500);
      const fields: Partial<AccessRequest> = {
        status,
        endedAt: now,
        endedBy: actor,
        ...(note ? { comment: note } : {}),
      };
      await store.update(id, fields);
      const updated = { ...row, ...fields } as AccessRequest;
      await access.reloadGrants();
      if (status === "revoked") {
        await access.endSessions(row.userId, row.hostId, "Access was revoked");
      }
      await audit(
        status === "revoked"
          ? "privileged_access_revoked"
          : "privileged_access_cancelled",
        updated,
        `${(await access.usernameFor(actor)) ?? actor} ${status === "revoked" ? "revoked" : "cancelled"} access of ${row.username ?? row.userId}`,
        req,
      );
      if (!own) {
        await notifyRequester(
          updated,
          `Your access to ${row.hostName} was revoked`,
        );
      }
      return updated;
    },

    /** Closes requests nobody decided and grants that ran out. */
    async sweep(): Promise<void> {
      const now = Date.now();
      const maxPending = (await pendingHours()) * 3_600_000;
      for (const row of await store.byStatus(["pending", "approved"])) {
        if (row.status === "pending") {
          if (now - Date.parse(row.createdAt) < maxPending) continue;
          await store.update(row.id, {
            status: "expired",
            endedAt: new Date().toISOString(),
          });
          await audit(
            "privileged_access_expired",
            row,
            "Nobody decided the request in time",
          );
          continue;
        }
        if (!row.expiresAt || Date.parse(row.expiresAt) > now) continue;
        await store.update(row.id, {
          status: "expired",
          endedAt: new Date().toISOString(),
        });
        await access.reloadGrants();
        // A newer grant for the same host keeps the sessions open.
        if (!access.hasGrant(row.userId, row.hostId)) {
          await access.endSessions(row.userId, row.hostId, "Access ended");
        }
        await audit(
          "privileged_access_expired",
          row,
          "The access time ran out",
        );
      }
      await access.reloadGrants();
    },

    startSweep(): void {
      const tick = () =>
        void this.sweep().catch((error) =>
          ctx.log.warn(
            `Access sweep failed: ${error instanceof Error ? error.message : String(error)}`,
          ),
        );
      tick();
      const timer = setInterval(tick, TICK_MS);
      timer.unref?.();
      ctx.disposables.add(() => clearInterval(timer));
    },
  };
}
