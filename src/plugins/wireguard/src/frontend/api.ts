import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ClientConfig,
  ClientView,
  ConfigView,
  CreateInterfaceBody,
  InterfaceView,
  UpdateInterfaceBody,
  WireguardStatus,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("WireGuard is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export function errorCode(error: unknown): string {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data?.code;
  return typeof code === "string" ? code : "";
}

const enc = encodeURIComponent;
const base = (host: number, iface: string) =>
  `/${host}/interfaces/${enc(iface)}`;

export async function getStatus(host: number): Promise<WireguardStatus> {
  return (await api().get<WireguardStatus>(`/${host}/status`)).data;
}

export async function installWireguard(host: number): Promise<void> {
  await api().post(`/${host}/install`);
}

export async function getLogs(host: number, lines: number): Promise<string> {
  return (await api().get<{ text: string }>(`/${host}/logs?lines=${lines}`))
    .data.text;
}

export async function listInterfaces(host: number): Promise<InterfaceView[]> {
  return (await api().get<InterfaceView[]>(`/${host}/interfaces`)).data;
}

export async function createInterface(
  host: number,
  body: CreateInterfaceBody,
): Promise<void> {
  await api().post(`/${host}/interfaces`, body);
}

export async function updateInterface(
  host: number,
  iface: string,
  body: UpdateInterfaceBody,
): Promise<void> {
  await api().put(base(host, iface), body);
}

export async function deleteInterface(
  host: number,
  iface: string,
): Promise<void> {
  await api().delete(base(host, iface));
}

export async function serviceAction(
  host: number,
  iface: string,
  action: string,
): Promise<void> {
  await api().post(`${base(host, iface)}/service/${action}`);
}

export async function getConfig(
  host: number,
  iface: string,
): Promise<ConfigView> {
  return (await api().get<ConfigView>(`${base(host, iface)}/config`)).data;
}

export async function saveConfig(
  host: number,
  iface: string,
  text: string,
): Promise<void> {
  await api().put(`${base(host, iface)}/config`, { text });
}

export async function listClients(
  host: number,
  iface: string,
): Promise<ClientView[]> {
  return (await api().get<ClientView[]>(`${base(host, iface)}/clients`)).data;
}

export async function addClient(
  host: number,
  iface: string,
  body: { name: string; allowedIps?: string },
): Promise<ClientConfig> {
  return (await api().post<ClientConfig>(`${base(host, iface)}/clients`, body))
    .data;
}

export async function removeClient(
  host: number,
  iface: string,
  name: string,
): Promise<void> {
  await api().delete(`${base(host, iface)}/clients/${enc(name)}`);
}

export async function setClientEnabled(
  host: number,
  iface: string,
  name: string,
  enabled: boolean,
): Promise<void> {
  await api().post(`${base(host, iface)}/clients/${enc(name)}/state`, {
    enabled,
  });
}

export async function rotateClient(
  host: number,
  iface: string,
  name: string,
): Promise<ClientConfig> {
  return (
    await api().post<ClientConfig>(
      `${base(host, iface)}/clients/${enc(name)}/rotate`,
    )
  ).data;
}

export async function getClientConfig(
  host: number,
  iface: string,
  name: string,
): Promise<ClientConfig> {
  return (
    await api().get<ClientConfig>(
      `${base(host, iface)}/clients/${enc(name)}/config`,
    )
  ).data;
}
