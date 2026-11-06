import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Account,
  AccountInput,
  DiffEntry,
  DnsRecord,
  DomainRow,
  HealthReport,
  HostChoice,
  Link,
  LinkInput,
  PropagationRow,
  ProviderInfo,
  RecordInput,
  Snapshot,
  ZoneRef,
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

export interface ZoneList {
  zones: ZoneRef[];
  errors: Array<{ accountId: number; name: string; error: string }>;
}

export interface Summary {
  accounts: number;
  failingAccounts: number;
  domains: number;
  expiring: Array<{ name: string; daysLeft: number }>;
  links: number;
  failingLinks: number;
}

/** The dns routes, through the plugin's own client. */
export function createApi(api: PluginApiClient) {
  const data = async <T>(request: Promise<{ data: T }>) => (await request).data;
  const zonePath = (accountId: number, zoneId: string) =>
    `/accounts/${accountId}/zones/${encodeURIComponent(zoneId)}`;
  return {
    providers: () =>
      data(api.get<{ providers: ProviderInfo[] }>("/providers")).then(
        (r) => r.providers,
      ),
    summary: () => data(api.get<Summary>("/summary")),
    accounts: () =>
      data(api.get<{ accounts: Account[] }>("/accounts")).then(
        (r) => r.accounts,
      ),
    createAccount: (body: AccountInput) => data(api.post("/accounts", body)),
    updateAccount: (id: number, body: Partial<AccountInput>) =>
      data(api.put(`/accounts/${id}`, body)),
    removeAccount: (id: number) => data(api.delete(`/accounts/${id}`)),
    testAccount: (id: number) =>
      data(
        api.post<{ zones: number; domains: number | null }>(
          `/accounts/${id}/test`,
        ),
      ),
    zones: () => data(api.get<ZoneList>("/zones")),
    records: (accountId: number, zoneId: string, fresh = false) =>
      data(
        api.get<{ records: DnsRecord[] }>(
          `${zonePath(accountId, zoneId)}/records${fresh ? "?fresh=1" : ""}`,
        ),
      ).then((r) => r.records),
    saveRecord: (
      accountId: number,
      zoneId: string,
      body: RecordInput,
      recordId?: string,
    ) =>
      recordId
        ? data(
            api.put(
              `${zonePath(accountId, zoneId)}/records/${encodeURIComponent(recordId)}`,
              body,
            ),
          )
        : data(api.post(`${zonePath(accountId, zoneId)}/records`, body)),
    deleteRecord: (accountId: number, zoneId: string, recordId: string) =>
      data(
        api.delete(
          `${zonePath(accountId, zoneId)}/records/${encodeURIComponent(recordId)}`,
        ),
      ),
    snapshots: (accountId: number, zoneId: string) =>
      data(
        api.get<{ snapshots: Snapshot[] }>(
          `${zonePath(accountId, zoneId)}/snapshots`,
        ),
      ).then((r) => r.snapshots),
    takeSnapshot: (accountId: number, zoneId: string, label: string) =>
      data(api.post(`${zonePath(accountId, zoneId)}/snapshots`, { label })),
    snapshotDiff: (id: number) =>
      data(api.get<{ diff: DiffEntry[] }>(`/snapshots/${id}/diff`)).then(
        (r) => r.diff,
      ),
    restore: (id: number) =>
      data(
        api.post<{ diff: DiffEntry[]; applied: boolean }>(
          `/snapshots/${id}/restore`,
        ),
      ),
    deleteSnapshot: (id: number) => data(api.delete(`/snapshots/${id}`)),
    exportZone: (accountId: number, zoneId: string) =>
      data(
        api.get<{ name: string; text: string }>(
          `${zonePath(accountId, zoneId)}/export`,
        ),
      ),
    importZone: (
      accountId: number,
      zoneId: string,
      body: { text: string; apply: boolean; replace: boolean },
    ) =>
      data(
        api.post<{ diff: DiffEntry[]; skipped: string[]; applied: boolean }>(
          `${zonePath(accountId, zoneId)}/import`,
          body,
        ),
      ),
    lastHealth: (accountId: number, zoneId: string) =>
      data(
        api.get<{ report: HealthReport | null }>(
          `${zonePath(accountId, zoneId)}/health`,
        ),
      ).then((r) => r.report),
    runHealth: (accountId: number, zoneId: string) =>
      data(
        api.post<{ report: HealthReport }>(
          `${zonePath(accountId, zoneId)}/health`,
        ),
      ).then((r) => r.report),
    propagation: (accountId: number, zoneId: string) =>
      data(
        api.post<{ rows: PropagationRow[] }>(
          `${zonePath(accountId, zoneId)}/propagation`,
        ),
      ).then((r) => r.rows),
    domains: () =>
      data(api.get<{ domains: DomainRow[] }>("/domains")).then(
        (r) => r.domains,
      ),
    watchDomain: (name: string) => data(api.post("/domains", { name })),
    refreshDomains: () =>
      data(api.post<{ count: number; failed: number }>("/domains/refresh")),
    removeDomain: (id: number) => data(api.delete(`/domains/${id}`)),
    hosts: () =>
      data(api.get<{ hosts: HostChoice[] }>("/hosts")).then((r) => r.hosts),
    links: () =>
      data(api.get<{ links: Link[] }>("/links")).then((r) => r.links),
    createLink: (body: LinkInput) => data(api.post("/links", body)),
    updateLink: (id: number, body: LinkInput) =>
      data(api.put(`/links/${id}`, body)),
    removeLink: (id: number) => data(api.delete(`/links/${id}`)),
    syncLink: (id: number) =>
      data(api.post<{ changed: boolean }>(`/links/${id}/sync`)),
  };
}

export type DnsApi = ReturnType<typeof createApi>;
