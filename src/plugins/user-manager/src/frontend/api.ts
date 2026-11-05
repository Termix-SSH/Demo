import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
import type {
  CreateUserBody,
  SessionsView,
  UpdateUserBody,
  UserDetail,
  UsersList,
  UsersStatus,
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Users is not ready");
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
const user = (host: number, name: string) => `/${host}/users/${enc(name)}`;

export async function getStatus(host: number): Promise<UsersStatus> {
  return (await api().get<UsersStatus>(`/${host}/status`)).data;
}

export async function getUsers(host: number): Promise<UsersList> {
  return (await api().get<UsersList>(`/${host}/users`)).data;
}

export async function getUserDetail(
  host: number,
  name: string,
): Promise<UserDetail> {
  return (await api().get<UserDetail>(user(host, name))).data;
}

export async function createUser(
  host: number,
  body: CreateUserBody,
): Promise<void> {
  await api().post(`/${host}/users`, body);
}

export async function updateUser(
  host: number,
  name: string,
  body: UpdateUserBody,
): Promise<void> {
  await api().put(user(host, name), body);
}

export async function setPassword(
  host: number,
  name: string,
  password: string,
): Promise<void> {
  await api().post(`${user(host, name)}/password`, { password });
}

export async function setLocked(
  host: number,
  name: string,
  locked: boolean,
): Promise<void> {
  await api().post(`${user(host, name)}/lock`, { locked });
}

export async function expirePassword(
  host: number,
  name: string,
): Promise<void> {
  await api().post(`${user(host, name)}/expire-password`);
}

export async function setSudo(
  host: number,
  name: string,
  sudo: boolean,
): Promise<void> {
  await api().post(`${user(host, name)}/sudo`, { sudo });
}

export async function deleteUser(
  host: number,
  name: string,
  removeHome: boolean,
): Promise<void> {
  await api().delete(`${user(host, name)}${removeHome ? "?removeHome=1" : ""}`);
}

export async function addKey(
  host: number,
  name: string,
  key: string,
): Promise<UserDetail> {
  return (await api().post<UserDetail>(`${user(host, name)}/keys`, { key }))
    .data;
}

export async function removeKey(
  host: number,
  name: string,
  line: number,
  fingerprint: string,
): Promise<UserDetail> {
  return (
    await api().delete<UserDetail>(
      `${user(host, name)}/keys/${line}?fingerprint=${enc(fingerprint)}`,
    )
  ).data;
}

export async function getSessions(host: number): Promise<SessionsView> {
  return (await api().get<SessionsView>(`/${host}/sessions`)).data;
}

export async function createGroup(host: number, name: string): Promise<void> {
  await api().post(`/${host}/groups`, { name });
}

export async function deleteGroup(host: number, name: string): Promise<void> {
  await api().delete(`/${host}/groups/${enc(name)}`);
}

export async function setMember(
  host: number,
  group: string,
  name: string,
  member: boolean,
): Promise<void> {
  await api().post(`/${host}/groups/${enc(group)}/members`, {
    user: name,
    member,
  });
}
