import type { PluginApiClient } from "@termix-ssh/plugin-sdk/frontend";
import type {
  Account,
  AccountInput,
  BucketRow,
  BucketSettings,
  Listing,
  ObjectHead,
  ProviderInfo,
  SettingKind,
  Summary,
  UsagePoint,
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

/** A failed blob request carries its JSON error as a blob too. */
async function unwrapBlobError(error: unknown): Promise<never> {
  const data = (error as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(await data.text());
    } catch {
      parsed = null;
    }
    if (parsed) throw { response: { data: parsed } };
  }
  throw error;
}

/** The object storage routes, through the plugin's own client. */
export function createApi(api: PluginApiClient) {
  const data = async <T>(request: Promise<{ data: T }>) => (await request).data;
  const enc = encodeURIComponent;
  const bucketPath = (accountId: number, bucket: string) =>
    `/accounts/${accountId}/buckets/${enc(bucket)}`;
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
      data(api.post<{ buckets: number }>(`/accounts/${id}/test`)),
    buckets: (accountId: number) =>
      data(
        api.get<{ buckets: BucketRow[] }>(`/accounts/${accountId}/buckets`),
      ).then((r) => r.buckets),
    createBucket: (accountId: number, name: string) =>
      data(api.post(`/accounts/${accountId}/buckets`, { name })),
    deleteBucket: (accountId: number, bucket: string) =>
      data(api.delete(bucketPath(accountId, bucket))),
    setLimit: (
      accountId: number,
      bucket: string,
      body: { maxBytes: number | null; maxObjects: number | null },
    ) => data(api.put(`${bucketPath(accountId, bucket)}/limit`, body)),
    usage: (accountId: number, bucket: string) =>
      data(
        api.get<{ points: UsagePoint[] }>(
          `${bucketPath(accountId, bucket)}/usage`,
        ),
      ).then((r) => r.points),
    scan: (accountId: number, bucket: string) =>
      data(
        api.post<{ bytes: number; objects: number; partial: boolean }>(
          `${bucketPath(accountId, bucket)}/scan`,
        ),
      ),
    objects: (
      accountId: number,
      bucket: string,
      options: { prefix: string; token?: string; search?: boolean },
    ) => {
      const params = new URLSearchParams({ prefix: options.prefix });
      if (options.token) params.set("token", options.token);
      if (options.search) params.set("search", "1");
      return data(
        api.get<Listing>(
          `${bucketPath(accountId, bucket)}/objects?${params.toString()}`,
        ),
      );
    },
    head: (accountId: number, bucket: string, key: string) =>
      data(
        api.get<ObjectHead>(
          `${bucketPath(accountId, bucket)}/head?key=${enc(key)}`,
        ),
      ),
    makeFolder: (accountId: number, bucket: string, prefix: string) =>
      data(api.post(`${bucketPath(accountId, bucket)}/folder`, { prefix })),
    remove: (
      accountId: number,
      bucket: string,
      body: { keys?: string[]; prefixes?: string[] },
    ) =>
      data(
        api.post<{ deleted: number; failed: string[] }>(
          `${bucketPath(accountId, bucket)}/delete`,
          body,
        ),
      ),
    copy: (
      accountId: number,
      bucket: string,
      body: { from: string; to: string; folder?: boolean; toBucket?: string },
    ) => data(api.post(`${bucketPath(accountId, bucket)}/copy`, body)),
    move: (
      accountId: number,
      bucket: string,
      body: { from: string; to: string; folder?: boolean; toBucket?: string },
    ) => data(api.post(`${bucketPath(accountId, bucket)}/move`, body)),
    share: (accountId: number, bucket: string, key: string, seconds: number) =>
      data(
        api.post<{ url: string; expiresAt: string }>(
          `${bucketPath(accountId, bucket)}/share`,
          { key, seconds },
        ),
      ),
    settings: (accountId: number, bucket: string) =>
      data(
        api.get<BucketSettings>(`${bucketPath(accountId, bucket)}/settings`),
      ),
    saveSetting: (
      accountId: number,
      bucket: string,
      kind: SettingKind,
      body: unknown,
    ) =>
      data(api.put(`${bucketPath(accountId, bucket)}/settings/${kind}`, body)),
    /** One request per file, so a failure names the file. */
    upload: (
      accountId: number,
      bucket: string,
      prefix: string,
      file: File,
      name: string,
      onProgress: (fraction: number) => void,
    ) => {
      const form = new FormData();
      form.append("file", file, name);
      return data(
        api.post(
          `${bucketPath(accountId, bucket)}/upload?prefix=${enc(prefix)}`,
          form,
          {
            timeout: 0,
            onUploadProgress: (event: { loaded: number; total?: number }) =>
              onProgress(event.total ? event.loaded / event.total : 0),
          } as never,
        ),
      );
    },
    blob: async (
      accountId: number,
      bucket: string,
      key: string,
      inline = false,
    ): Promise<Blob> => {
      try {
        return (
          await api.get<Blob>(
            `${bucketPath(accountId, bucket)}/download?key=${enc(key)}${inline ? "&inline=1" : ""}`,
            { responseType: "blob", timeout: 0 } as never,
          )
        ).data;
      } catch (error) {
        return unwrapBlobError(error);
      }
    },
  };
}

export type Api = ReturnType<typeof createApi>;

/** Saves a blob as a file in the browser. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
