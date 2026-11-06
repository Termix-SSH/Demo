import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";

export type RequestStatus =
  "pending" | "approved" | "denied" | "expired" | "revoked" | "cancelled";

export interface AccessRequest {
  id: number;
  hostId: number;
  hostName: string | null;
  userId: string;
  username: string | null;
  reason: string | null;
  ticket: string | null;
  hours: number;
  status: RequestStatus;
  createdAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
}

export interface PrivilegedHost {
  id: number;
  name: string;
  maxHours: number;
  requireReason: boolean;
  requireTicket: boolean;
  accessUntil: number | null;
}

export interface Summary {
  approver: boolean;
  pending: number;
  latest: AccessRequest[];
  active: AccessRequest[];
}

export type RequestScope = "mine" | "pending" | "active" | "all";

/** The server's own error text, else the fallback. */
export function errorText(error: unknown, fallback: string): string {
  const data = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof data === "string" && data ? data : fallback;
}

export function createAccessApi(api: PluginApiClient) {
  return {
    async hosts(): Promise<PrivilegedHost[]> {
      return (await api.get<{ hosts: PrivilegedHost[] }>("/hosts")).data.hosts;
    },
    async list(scope: RequestScope): Promise<AccessRequest[]> {
      return (
        await api.get<{ requests: AccessRequest[] }>(`/requests?scope=${scope}`)
      ).data.requests;
    },
    async request(input: {
      hostId: number;
      hours: number;
      reason: string;
      ticket: string;
    }): Promise<AccessRequest> {
      return (await api.post<{ request: AccessRequest }>("/requests", input))
        .data.request;
    },
    async approve(id: number, comment?: string): Promise<void> {
      await api.post(`/requests/${id}/approve`, { comment });
    },
    async deny(id: number, comment?: string): Promise<void> {
      await api.post(`/requests/${id}/deny`, { comment });
    },
    async end(id: number): Promise<void> {
      await api.post(`/requests/${id}/end`, {});
    },
    async report(): Promise<Blob> {
      return (await api.get<Blob>("/report.csv", { responseType: "blob" }))
        .data;
    },
    async summary(): Promise<Summary> {
      return (await api.get<Summary>("/summary")).data;
    },
  };
}

export type AccessApi = ReturnType<typeof createAccessApi>;
