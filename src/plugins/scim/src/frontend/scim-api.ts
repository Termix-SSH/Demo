import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";

export type OnDelete = "disable" | "delete";

export interface ScimConnection {
  id: number;
  name: string;
  enabled: boolean;
  onDelete: OnDelete;
  adoptExisting: boolean;
  allowAdmin: boolean;
  defaultRoles: string;
  lastRequestAt: string | null;
  baseUrl: string;
  userCount: number;
  groupCount: number;
}

export interface ConnectionInput {
  name?: string;
  enabled?: boolean;
  onDelete?: OnDelete;
  adoptExisting?: boolean;
  allowAdmin?: boolean;
  defaultRoles?: string;
}

export interface ScimGroup {
  id: number;
  displayName: string;
  roleName: string | null;
  memberCount: number;
}

export interface ScimEvent {
  id: number;
  action: string;
  target: string | null;
  ok: boolean;
  detail: string | null;
  createdAt: string;
}

export interface TermixRole {
  name: string;
  displayName: string;
}

/** Paths are relative to /plugin-api/scim/. */
export function createScimApi(api: PluginApiClient) {
  return {
    async list() {
      return (
        await api.get<{ supported: boolean; connections: ScimConnection[] }>(
          "/connections",
        )
      ).data;
    },
    async create(input: ConnectionInput) {
      return (
        await api.post<{ connection: ScimConnection; token: string }>(
          "/connections",
          input,
        )
      ).data;
    },
    async update(id: number, input: ConnectionInput) {
      return (
        await api.put<{ connection: ScimConnection }>(
          `/connections/${id}`,
          input,
        )
      ).data.connection;
    },
    async remove(id: number) {
      await api.delete(`/connections/${id}`);
    },
    async newToken(id: number) {
      return (await api.post<{ token: string }>(`/connections/${id}/token`, {}))
        .data.token;
    },
    async groups(id: number) {
      return (
        await api.get<{ groups: ScimGroup[] }>(`/connections/${id}/groups`)
      ).data.groups;
    },
    async setGroupRole(id: number, groupId: number, roleName: string | null) {
      await api.put(`/connections/${id}/groups/${groupId}`, { roleName });
    },
    async events(id: number) {
      return (
        await api.get<{ events: ScimEvent[] }>(`/connections/${id}/events`)
      ).data.events;
    },
    async roles() {
      return (await api.get<{ roles: TermixRole[] }>("/roles")).data.roles;
    },
  };
}
