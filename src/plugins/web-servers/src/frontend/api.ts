import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  ActionResult,
  ConfigFile,
  FileContent,
  LogFile,
  LogResult,
  LogSource,
  ServerKind,
  ServiceAction,
  Site,
  SiteSpec,
  TestResult,
  TlsBody,
  WebStatus,
} from "../shared/types";

interface SiteFile {
  file: string;
  enabled: boolean;
  content: string;
  spec: SiteSpec | null;
}

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Web Servers is not ready");
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
const sitePath = (host: number, server: ServerKind, name: string) =>
  `/${host}/sites/${server}/${enc(name)}`;

export async function getStatus(host: number): Promise<WebStatus> {
  return (await api().get<WebStatus>(`/${host}/status`)).data;
}

export async function getSites(host: number): Promise<Site[]> {
  return (await api().get<Site[]>(`/${host}/sites`)).data;
}

export async function getSite(
  host: number,
  server: ServerKind,
  name: string,
): Promise<SiteFile> {
  return (await api().get<SiteFile>(sitePath(host, server, name))).data;
}

export async function previewSite(
  host: number,
  server: ServerKind,
  name: string,
  spec: SiteSpec,
): Promise<string> {
  return (
    await api().post<{ content: string }>(`/${host}/sites/preview`, {
      server,
      name,
      spec,
    })
  ).data.content;
}

export async function createSite(
  host: number,
  server: ServerKind,
  name: string,
  body: { spec?: SiteSpec; content?: string },
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(`/${host}/sites`, { server, name, ...body })
  ).data;
}

export async function updateSite(
  host: number,
  server: ServerKind,
  name: string,
  body: { spec?: SiteSpec; content?: string },
): Promise<ActionResult> {
  return (await api().put<ActionResult>(sitePath(host, server, name), body))
    .data;
}

export async function toggleSite(
  host: number,
  site: Site,
  on: boolean,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(
      `${sitePath(host, site.server, site.name)}/${on ? "enable" : "disable"}`,
    )
  ).data;
}

export async function deleteSite(
  host: number,
  site: Site,
): Promise<ActionResult> {
  return (
    await api().delete<ActionResult>(sitePath(host, site.server, site.name))
  ).data;
}

export async function issueCertificate(
  host: number,
  site: Site,
  body: TlsBody,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(
      `${sitePath(host, site.server, site.name)}/certificate`,
      body,
    )
  ).data;
}

export async function getFiles(
  host: number,
  server: ServerKind,
): Promise<ConfigFile[]> {
  return (await api().get<ConfigFile[]>(`/${host}/files?server=${server}`))
    .data;
}

export async function getFile(
  host: number,
  server: ServerKind,
  path: string,
): Promise<FileContent> {
  return (
    await api().get<FileContent>(
      `/${host}/file?server=${server}&path=${enc(path)}`,
    )
  ).data;
}

export async function saveFile(
  host: number,
  server: ServerKind,
  path: string,
  body: { content?: string; backup?: string },
): Promise<ActionResult> {
  return (
    await api().put<ActionResult>(`/${host}/file`, { server, path, ...body })
  ).data;
}

export async function testConfig(
  host: number,
  server: ServerKind,
): Promise<TestResult> {
  return (await api().post<TestResult>(`/${host}/test`, { server })).data;
}

export async function serviceAction(
  host: number,
  server: ServerKind,
  action: ServiceAction,
): Promise<ActionResult> {
  return (
    await api().post<ActionResult>(`/${host}/service`, { server, action })
  ).data;
}

export async function installServer(
  host: number,
  server: ServerKind,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/install`, { server })).data;
}

export async function installCertbot(host: number): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/install-certbot`)).data;
}

export async function getLogFiles(host: number): Promise<LogFile[]> {
  return (await api().get<LogFile[]>(`/${host}/logs`)).data;
}

export async function readLog(
  host: number,
  source: LogSource,
  lines: number,
): Promise<LogResult> {
  const query =
    source.kind === "journal"
      ? `kind=journal&server=${source.server}`
      : `kind=file&path=${enc(source.path)}`;
  return (await api().get<LogResult>(`/${host}/log?${query}&lines=${lines}`))
    .data;
}

export async function setWatch(host: number, on: boolean): Promise<void> {
  await api().post(`/${host}/watch`, { on });
}
