import { del, get, HttpError, patch, post, put } from "../../router";
import { collection, value } from "../../store";
import { rawFetch } from "../../fetch";
import { hosts } from "../hosts";
import { serverTunnelName } from "../../../../plugins/tunnels/src/shared/tunnel-naming";

const P = "/plugin-api/tunnels";

type Status = {
  connected: boolean;
  status: string;
  reason?: string;
  manualDisconnect?: boolean;
};

function autoStarted(): Record<string, Status> {
  const out: Record<string, Status> = {};
  for (const host of hosts.all()) {
    const list = (host.pluginSettings?.tunnels?.tunnelConnections ??
      []) as Array<{
      sourcePort: number;
      endpointHost?: string;
      endpointPort?: number;
      autoStart?: boolean;
    }>;
    list.forEach((tunnel, index) => {
      if (tunnel.autoStart) {
        out[serverTunnelName(host, index, tunnel)] = {
          connected: true,
          status: "connected",
        };
      }
    });
  }
  return out;
}

const statuses = value<Record<string, Status>>("tunnel-statuses", autoStarted);
const listeners = new Set<() => void>();
function setStatus(name: string, status: Status) {
  statuses.update((all) => ({ ...all, [name]: status }));
  listeners.forEach((fn) => fn());
}

get(`${P}/status`, () => statuses.get());
post(`${P}/connect`, (req) => {
  const { name } = req.body as { name: string };
  setStatus(name, { connected: false, status: "connecting" });
  setTimeout(
    () => setStatus(name, { connected: true, status: "connected" }),
    1200,
  );
  return { success: true };
});
post(`${P}/disconnect`, (req) => {
  const { tunnelName } = req.body as { tunnelName: string };
  setStatus(tunnelName, {
    connected: false,
    status: "disconnected",
    manualDisconnect: true,
  });
  return { success: true };
});
post(`${P}/cancel`, (req) => {
  const { tunnelName } = req.body as { tunnelName: string };
  setStatus(tunnelName, {
    connected: false,
    status: "disconnected",
    manualDisconnect: true,
  });
  return { success: true };
});

const stamp = new Date(Date.now() - 20 * 864e5).toISOString();
const presets = collection("tunnel-presets", () => [
  {
    id: 1,
    userId: "demo-user",
    name: "Laptop dev ports",
    platform: "win32",
    computerName: "LUKE-LAPTOP",
    config: [
      {
        scope: "c2s",
        tunnelType: "local",
        mode: "local",
        sourceHostId: 1,
        sourceHostName: "web-01",
        sourcePort: 15432,
        endpointHost: "db-primary",
        endpointPort: 5432,
        maxRetries: 3,
        retryInterval: 10,
        autoStart: false,
        displayName: "Postgres",
      },
      {
        scope: "c2s",
        tunnelType: "local",
        mode: "local",
        sourceHostId: 7,
        sourceHostName: "proxmox",
        sourcePort: 18006,
        endpointHost: "127.0.0.1",
        endpointPort: 8006,
        maxRetries: 3,
        retryInterval: 10,
        autoStart: false,
        displayName: "Proxmox UI",
      },
    ],
    createdAt: stamp,
    updatedAt: stamp,
  },
]);
get(`${P}/presets`, () => presets.all());
post(`${P}/presets`, (req) => {
  const record = {
    id: presets.nextId(),
    userId: "demo-user",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...(req.body as object),
  };
  presets.insert(record as never);
  return record;
});
put(`${P}/presets/:id`, (req) =>
  presets.patch(req.params.id, {
    ...(req.body as object),
    updatedAt: new Date().toISOString(),
  } as never),
);
del(`${P}/presets/:id`, (req) => presets.remove(req.params.id));

const encoder = new TextEncoder();
rawFetch(
  (path) => path === `${P}/status/stream`,
  async (_path, init) => {
    let push: (() => void) | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        push = () => {
          try {
            controller.enqueue(
              encoder.encode(
                `event: statuses\ndata: ${JSON.stringify(statuses.get())}\n\n`,
              ),
            );
          } catch {
            if (push) listeners.delete(push);
          }
        };
        listeners.add(push);
        push();
      },
      cancel() {
        if (push) listeners.delete(push);
      },
    });
    init?.signal?.addEventListener("abort", () => {
      if (push) listeners.delete(push);
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  },
);

type Saved = { hostId: number; connections: unknown[] };

// Saved server tunnels start from what the demo hosts carry.
const saved = value<Saved[]>("tunnel-saved", () =>
  hosts
    .all()
    .map((host) => ({
      hostId: Number(host.id),
      connections: (host.pluginSettings?.tunnels?.tunnelConnections ??
        []) as unknown[],
    }))
    .filter((entry) => entry.connections.length > 0),
);
get(`${P}/saved`, () => saved.get());
put(`${P}/saved/:hostId`, (req) => {
  const hostId = Number(req.params.hostId);
  const connections = (req.body as { connections: unknown[] }).connections;
  saved.update((all) => [
    ...all.filter((entry) => entry.hostId !== hostId),
    ...(connections.length > 0 ? [{ hostId, connections }] : []),
  ]);
  return { hostId, connections };
});

type GatewayPortRow = {
  id: number;
  gatewayId: number;
  proto: "tcp" | "udp" | "both";
  publicPort: number;
  targetHost: string;
  targetPort: number;
  label: string;
  source: "manual" | "scan";
  sourceHostId: number | null;
  enabled: boolean;
};

type GatewayRow = {
  id: number;
  name: string;
  privateHostId: number;
  publicHostId: number;
  endpoint: string;
  listenPort: number;
  scanEnabled: boolean;
  scanInterval: number;
  autoEnable: boolean;
  scanGuests: boolean;
  sourceHostIds: number[];
  ignoredPorts: number[];
  publicIp: string;
  privateIp: string;
  ports: GatewayPortRow[];
  status: {
    state: string;
    message: string | null;
    handshakeAge: number | null;
    checkedAt: string | null;
    lastScanAt: string | null;
    ports: Record<number, { listening?: boolean; reachable?: boolean }>;
  };
};

function gatewayPort(
  id: number,
  proto: GatewayPortRow["proto"],
  publicPort: number,
  targetPort: number,
  label: string,
  source: GatewayPortRow["source"] = "manual",
): GatewayPortRow {
  return {
    id,
    gatewayId: 1,
    proto,
    publicPort,
    targetHost: "",
    targetPort,
    label,
    source,
    sourceHostId: null,
    enabled: true,
  };
}

const gateways = value<GatewayRow[]>("tunnel-gateways", () => [
  {
    id: 1,
    name: "Game servers",
    privateHostId: 10,
    publicHostId: 13,
    endpoint: "203.0.113.20",
    listenPort: 51820,
    scanEnabled: true,
    scanInterval: 300,
    autoEnable: false,
    scanGuests: false,
    sourceHostIds: [],
    ignoredPorts: [],
    publicIp: "203.0.113.20",
    privateIp: "192.168.1.40",
    ports: [
      gatewayPort(1, "tcp", 25565, 25565, "Minecraft"),
      gatewayPort(2, "udp", 2456, 2456, "Valheim"),
      {
        ...gatewayPort(3, "tcp", 8096, 8096, "jellyfin", "scan"),
        enabled: false,
      },
    ],
    status: {
      state: "up",
      message: null,
      handshakeAge: 14,
      checkedAt: new Date().toISOString(),
      lastScanAt: new Date().toISOString(),
      ports: {
        1: { listening: true, reachable: true },
        2: { listening: true, reachable: true },
        3: { listening: true, reachable: true },
      },
    },
  },
]);

function gatewayOf(id: string): GatewayRow {
  const found = gateways.get().find((x) => String(x.id) === id);
  if (!found) throw new HttpError(404, { error: "Gateway not found" });
  return found;
}

function patchGateway(id: number, changes: Partial<GatewayRow>): GatewayRow {
  let next: GatewayRow | undefined;
  gateways.update((all) =>
    all.map((x) => {
      if (x.id !== id) return x;
      next = { ...x, ...changes };
      return next;
    }),
  );
  return next as GatewayRow;
}

function nowStatus(state: string): GatewayRow["status"]["state"] {
  return state;
}

get(`${P}/gateways`, () => gateways.get());
post(`${P}/gateways/preflight`, () => ({
  root: true,
  wireguard: true,
  nftables: true,
  systemd: true,
  packageManager: "apt",
}));
post(`${P}/gateways/install`, () => ({ success: true }));
post(`${P}/gateways`, (req) => {
  const input = req.body as Partial<GatewayRow>;
  const id = Math.max(0, ...gateways.get().map((x) => x.id)) + 1;
  const privateHost = hosts.find(Number(input.privateHostId));
  const publicHost = hosts.find(Number(input.publicHostId));
  const row: GatewayRow = {
    id,
    name: input.name || "Gateway",
    privateHostId: Number(input.privateHostId),
    publicHostId: Number(input.publicHostId),
    endpoint: input.endpoint || publicHost?.ip || "",
    listenPort: input.listenPort || 51821,
    scanEnabled: false,
    scanInterval: 300,
    autoEnable: false,
    scanGuests: false,
    sourceHostIds: [],
    ignoredPorts: [],
    publicIp: input.endpoint || publicHost?.ip || "",
    privateIp: privateHost?.ip ?? "",
    ports: [],
    status: {
      state: nowStatus("up"),
      message: null,
      handshakeAge: 2,
      checkedAt: new Date().toISOString(),
      lastScanAt: null,
      ports: {},
    },
  };
  gateways.update((all) => [...all, row]);
  return row;
});
get(`${P}/gateways/:id`, (req) => gatewayOf(req.params.id));
patch(`${P}/gateways/:id`, (req) =>
  patchGateway(gatewayOf(req.params.id).id, req.body as Partial<GatewayRow>),
);
del(`${P}/gateways/:id`, (req) => {
  const id = gatewayOf(req.params.id).id;
  gateways.update((all) => all.filter((x) => x.id !== id));
  return { success: true };
});
post(`${P}/gateways/:id/apply`, (req) => {
  const current = gatewayOf(req.params.id);
  return patchGateway(current.id, {
    status: {
      ...current.status,
      state: "up",
      handshakeAge: 3,
      checkedAt: new Date().toISOString(),
    },
  });
});
post(`${P}/gateways/:id/check`, (req) => {
  const current = gatewayOf(req.params.id);
  return patchGateway(current.id, {
    status: {
      ...current.status,
      handshakeAge: 9,
      checkedAt: new Date().toISOString(),
    },
  });
});
post(`${P}/gateways/:id/scan`, (req) => {
  const current = gatewayOf(req.params.id);
  patchGateway(current.id, {
    status: { ...current.status, lastScanAt: new Date().toISOString() },
  });
  return { found: current.ports.filter((x) => x.source === "scan").length };
});
post(`${P}/gateways/:id/ports`, (req) => {
  const current = gatewayOf(req.params.id);
  const input = req.body as Partial<GatewayPortRow>;
  const port: GatewayPortRow = {
    id: Math.max(0, ...current.ports.map((x) => x.id)) + 1,
    gatewayId: current.id,
    proto: input.proto ?? "tcp",
    publicPort: Number(input.publicPort),
    targetHost: input.targetHost ?? "",
    targetPort: Number(input.targetPort),
    label: input.label ?? "",
    source: "manual",
    sourceHostId: null,
    enabled: input.enabled ?? true,
  };
  patchGateway(current.id, {
    ports: [...current.ports, port],
    status: {
      ...current.status,
      ports: {
        ...current.status.ports,
        [port.id]: { listening: true, reachable: true },
      },
    },
  });
  return port;
});
patch(`${P}/gateways/:id/ports/:portId`, (req) => {
  const current = gatewayOf(req.params.id);
  const input = req.body as Partial<GatewayPortRow>;
  let changed: GatewayPortRow | undefined;
  patchGateway(current.id, {
    ports: current.ports.map((x) => {
      if (String(x.id) !== req.params.portId) return x;
      changed = { ...x, ...input, id: x.id };
      return changed;
    }),
  });
  return changed;
});
del(`${P}/gateways/:id/ports/:portId`, (req) => {
  const current = gatewayOf(req.params.id);
  patchGateway(current.id, {
    ports: current.ports.filter((x) => String(x.id) !== req.params.portId),
  });
  return { success: true };
});
