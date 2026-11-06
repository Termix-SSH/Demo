import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import type {
  BootTarget,
  Device,
  DeviceInput,
  DriverInfo,
  LogEntry,
  MediaSlot,
  PowerAction,
  Reading,
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

/** The out-of-band routes, through the plugin's own client. */
export function createApi(api: PluginApiClient) {
  const data = async <T>(request: Promise<{ data: T }>) => (await request).data;
  const at = (id: number) => `/devices/${id}`;
  return {
    drivers: () =>
      data(api.get<{ drivers: DriverInfo[] }>("/drivers")).then(
        (r) => r.drivers,
      ),
    devices: () =>
      data(api.get<{ devices: Device[] }>("/devices")).then((r) => r.devices),
    create: (body: DeviceInput) => data(api.post("/devices", body)),
    update: (id: number, body: DeviceInput) => data(api.put(at(id), body)),
    remove: (id: number) => data(api.delete(at(id))),
    test: (body: DeviceInput) =>
      data(api.post<{ reading: Reading }>("/devices/test", body)).then(
        (r) => r.reading,
      ),
    poll: (id: number) =>
      data(api.post<{ device: Device }>(`${at(id)}/poll`)).then(
        (r) => r.device,
      ),
    power: (id: number, action: PowerAction) =>
      data(api.post(`${at(id)}/power`, { action })),
    log: (id: number) =>
      data(api.get<{ entries: LogEntry[] }>(`${at(id)}/log`)).then(
        (r) => r.entries,
      ),
    clearLog: (id: number) => data(api.delete(`${at(id)}/log`)),
    boot: (id: number, device: BootTarget, uefi: boolean) =>
      data(api.post(`${at(id)}/boot`, { device, uefi })),
    media: (id: number) =>
      data(api.get<{ slots: MediaSlot[] }>(`${at(id)}/media`)).then(
        (r) => r.slots,
      ),
    mount: (id: number, slot: string, url: string) =>
      data(api.post(`${at(id)}/media/mount`, { slot, url })),
    eject: (id: number, slot: string) =>
      data(api.post(`${at(id)}/media/eject`, { slot })),
  };
}

export type OobApi = ReturnType<typeof createApi>;

let shared: OobApi | null = null;

export function initApi(api: PluginApiClient): OobApi {
  shared = createApi(api);
  return shared;
}

export function sharedApi(): OobApi | null {
  return shared;
}
