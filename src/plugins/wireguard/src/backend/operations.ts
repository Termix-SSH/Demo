import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import type { WireguardService } from "./service.js";

type Interfaces = {
  list: (hostId: number) => Promise<
    {
      name: string;
      active: boolean;
      enabled: boolean;
      address: string[];
      listenPort: number;
      clients: number;
    }[]
  >;
};

const IFACE = /^[a-zA-Z0-9_.-]{1,15}$/;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function requireIface(context: PluginOperationContext): string {
  const name = context.resourceKey ?? "";
  if (!IFACE.test(name)) throw new Error("Invalid interface name");
  return name;
}

/** Everything WireGuard offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: WireguardService,
  interfaces: Interfaces,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("wireguard.list-interfaces", {
    run: async (_input, context) => {
      const rows = (await interfaces.list(requireHost(context))).map(
        (iface) => ({
          name: iface.name,
          state: iface.active ? "active" : "inactive",
          address: iface.address.join(", "),
          listenPort: iface.listenPort,
          clients: iface.clients,
          atBoot: iface.enabled,
        }),
      );
      return { summary: `${rows.length} interfaces`, data: { rows } };
    },
  });

  ctx.operations.register("wireguard.down", {
    run: async (_input, context) => {
      const all = await interfaces.list(requireHost(context));
      const down = all.filter((iface) => iface.enabled && !iface.active).length;
      return {
        summary: `${down} down`,
        data: {
          value: down,
          status: down > 0 ? "warn" : "ok",
          label: `${all.length - down} of ${all.length} up`,
        },
      };
    },
  });

  for (const action of ["start", "stop", "restart"] as const) {
    ctx.operations.register(`wireguard.${action}`, {
      describe: (_input, context) => `Would ${action} ${requireIface(context)}`,
      run: async (_input, context) => {
        const name = requireIface(context);
        await service.act(requireHost(context), name, action);
        return { summary: `${name}: ${action} done`, changed: true };
      },
    });
  }
}
