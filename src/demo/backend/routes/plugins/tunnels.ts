import { del, get, post, put } from "../../router";
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
