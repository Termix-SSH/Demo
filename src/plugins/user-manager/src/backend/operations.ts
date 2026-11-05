import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings } from "./host-settings.js";
import type { UserService } from "./service.js";

const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}\$?$/;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function requireUser(context: PluginOperationContext): string {
  const name = context.resourceKey ?? "";
  if (!NAME_RE.test(name)) throw new Error("Invalid user name");
  return name;
}

/** Everything Users offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: UserService,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Users", 403);
    }
    return s;
  };

  ctx.operations.register("user-manager.list-users", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { users } = await service.list(
        hostId,
        await settings(hostId, false),
      );
      const rows = users
        .filter((user) => !user.system)
        .map((user) => ({
          name: user.name,
          state:
            user.expired || user.password === "locked" ? "locked" : "active",
          uid: user.uid,
          shell: user.shell,
          sudo: user.sudo ? "yes" : "no",
          groups: user.groups.join(", "),
        }));
      return { summary: `${rows.length} users`, data: { rows } };
    },
  });

  ctx.operations.register("user-manager.empty-passwords", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const { users } = await service.list(
        hostId,
        await settings(hostId, false),
      );
      if (users.some((user) => user.password === "unknown")) {
        return {
          summary: "Needs root to read",
          data: { value: 0, status: "unknown", label: "Needs root" },
        };
      }
      const empty = users.filter((user) => user.password === "empty").length;
      return {
        summary: `${empty} without a password`,
        data: { value: empty, status: empty > 0 ? "warn" : "ok" },
      };
    },
  });

  for (const [id, lock] of [
    ["user-manager.lock", true],
    ["user-manager.unlock", false],
  ] as const) {
    ctx.operations.register(id, {
      describe: (_input, context) =>
        `Would ${lock ? "lock" : "unlock"} ${requireUser(context)}`,
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const name = requireUser(context);
        await service.lock(hostId, await settings(hostId, true), name, lock);
        return {
          summary: `${name} ${lock ? "locked" : "unlocked"}`,
          changed: true,
        };
      },
    });
  }

  ctx.operations.register("user-manager.delete-user", {
    describe: (_input, context) =>
      `Would delete ${requireUser(context)} and keep the home folder`,
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const name = requireUser(context);
      await service.remove(hostId, await settings(hostId, true), name, false);
      return { summary: `${name} deleted`, changed: true };
    },
  });
}
