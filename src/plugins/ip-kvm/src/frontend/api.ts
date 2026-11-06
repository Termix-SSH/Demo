import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Device,
  DeviceInput,
  DriverInfo,
  MediaState,
  PowerAction,
  PeerCertificate,
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

/** The ip-kvm routes, through the plugin's own client. */
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
    certificate: (address: string, port: number) =>
      data(
        api.post<{ certificate: PeerCertificate }>("/devices/certificate", {
          address,
          port,
        }),
      ).then((r) => r.certificate),
    poll: (id: number) =>
      data(api.post<{ device: Device }>(`${at(id)}/poll`)).then(
        (r) => r.device,
      ),
    power: (id: number, action: PowerAction) =>
      data(api.post(`${at(id)}/power`, { action })),
    wake: (id: number) => data(api.post(`${at(id)}/wake`)),
    paste: (id: number, text: string) =>
      data(api.post(`${at(id)}/paste`, { text })),
    session: (id: number, sd: string) =>
      data(api.post<{ sd: string }>(`${at(id)}/session`, { sd })).then(
        (r) => r.sd,
      ),
    media: (id: number) =>
      data(api.get<{ media: MediaState }>(`${at(id)}/media`)).then(
        (r) => r.media,
      ),
    mount: (id: number, image: string, cdrom: boolean) =>
      data(api.post(`${at(id)}/media/mount`, { image, cdrom })),
    eject: (id: number) => data(api.post(`${at(id)}/media/eject`)),
    fetchImage: (id: number, url: string, name: string) =>
      data(api.post(`${at(id)}/media/fetch`, { url, name })),
  };
}

export type KvmApi = ReturnType<typeof createApi>;

let shared: KvmApi | null = null;

export function initApi(api: PluginApiClient): KvmApi {
  shared = createApi(api);
  return shared;
}

export function sharedApi(): KvmApi | null {
  return shared;
}
