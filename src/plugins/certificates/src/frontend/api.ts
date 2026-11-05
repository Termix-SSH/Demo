import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ActionResult,
  AcmeClient,
  CertStatus,
  CertView,
  InspectResult,
  IssueBody,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Certificates is not ready");
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

/** The tool output a failed action sent back, if any. */
export function errorOutput(error: unknown): string {
  const output = (error as { response?: { data?: { output?: unknown } } })
    ?.response?.data?.output;
  return typeof output === "string" ? output : "";
}

const enc = encodeURIComponent;

export async function getStatus(host: number): Promise<CertStatus> {
  return (await api().get<CertStatus>(`/${host}/status`)).data;
}

export async function getCertificates(host: number): Promise<CertView[]> {
  return (await api().get<CertView[]>(`/${host}/certificates`)).data;
}

export async function inspectFile(
  host: number,
  path: string,
): Promise<InspectResult> {
  return (await api().get<InspectResult>(`/${host}/inspect?path=${enc(path)}`))
    .data;
}

export async function inspectRemote(
  host: number,
  address: string,
  port: number,
): Promise<InspectResult> {
  return (
    await api().get<InspectResult>(
      `/${host}/inspect?address=${enc(address)}&port=${port}`,
    )
  ).data;
}

export async function issueCertificate(
  host: number,
  body: IssueBody,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/issue`, body)).data;
}

export async function renewCertificate(
  host: number,
  key: string,
  options: { dryRun?: boolean; force?: boolean } = {},
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/renew`, { key, ...options }))
    .data;
}

export async function renewAll(
  host: number,
  client: AcmeClient,
  dryRun = false,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/renew`, { client, dryRun }))
    .data;
}

export async function revokeCertificate(
  host: number,
  key: string,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/revoke`, { key })).data;
}

export async function deleteCertificate(
  host: number,
  key: string,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/delete`, { key })).data;
}

export async function installCertbot(host: number): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/install`)).data;
}

export async function setWatch(host: number, on: boolean): Promise<void> {
  await api().post(`/${host}/watch`, { on });
}
