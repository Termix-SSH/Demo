import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ClientInfo,
  Device,
  DeviceInfo,
  DeviceInput,
  DiscoveryResult,
  DriverInfo,
  NeighborInfo,
} from "../shared/types";

export function errorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error?: string } } })?.response
    ?.data;
  if (data?.error) return data.error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }
  return String(error);
}

/** The network-devices routes, through the plugin's own client. */
export function createApi(api: PluginApiClient) {
  const data = async <T>(request: Promise<{ data: T }>) => (await request).data;
  const port = (id: number, portId: string) =>
    `/devices/${id}/ports/${encodeURIComponent(portId)}`;
  return {
    drivers: () =>
      data(api.get<{ drivers: DriverInfo[] }>("/drivers")).then(
        (r) => r.drivers,
      ),
    devices: () =>
      data(api.get<{ devices: Device[] }>("/devices")).then((r) => r.devices),
    create: (body: DeviceInput) => data(api.post("/devices", body)),
    update: (id: number, body: DeviceInput) =>
      data(api.put(`/devices/${id}`, body)),
    remove: (id: number) => data(api.delete(`/devices/${id}`)),
    test: (body: DeviceInput) =>
      data(api.post<{ info: DeviceInfo }>("/devices/test", body)).then(
        (r) => r.info,
      ),
    poll: (id: number) =>
      data(api.post<{ device: Device }>(`/devices/${id}/poll`)).then(
        (r) => r.device,
      ),
    clients: (id: number) =>
      data(api.get<{ clients: ClientInfo[] }>(`/devices/${id}/clients`)).then(
        (r) => r.clients,
      ),
    neighbors: (id: number) =>
      data(
        api.get<{ neighbors: NeighborInfo[] }>(`/devices/${id}/neighbors`),
      ).then((r) => r.neighbors),
    setPort: (id: number, portId: string, up: boolean) =>
      data(api.post(`${port(id, portId)}/state`, { up })),
    poeCycle: (id: number, portId: string) =>
      data(api.post(`${port(id, portId)}/poe-cycle`)),
    reboot: (id: number) => data(api.post(`/devices/${id}/reboot`)),
    discover: (cidr: string, community: string, version: "1" | "2c") =>
      data(
        api.post<{ results: DiscoveryResult[] }>("/discover", {
          cidr,
          community,
          version,
        }),
      ).then((r) => r.results),
  };
}

export type NetworkApi = ReturnType<typeof createApi>;
