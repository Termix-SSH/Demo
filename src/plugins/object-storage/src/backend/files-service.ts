import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { ObjectStorageService } from "./service.js";

/** Most text one service call reads or writes. */
export const MAX_TEXT_BYTES = 20 * 1024 * 1024;

/** What object-storage.files 1.x gives other plugins. */
export interface ObjectStorageFilesV1 {
  /** Logins the caller may use, without keys. */
  accounts: () => Promise<Array<{ id: number; name: string }>>;
  buckets: (accountId: number) => Promise<string[]>;
  putText: (
    accountId: number,
    bucket: string,
    key: string,
    text: string,
    contentType?: string,
  ) => Promise<void>;
  list: (
    accountId: number,
    bucket: string,
    prefix: string,
  ) => Promise<Array<{ key: string; size: number; modifiedAt: string | null }>>;
  getText: (accountId: number, bucket: string, key: string) => Promise<string>;
  remove: (accountId: number, bucket: string, key: string) => Promise<void>;
}

/**
 * Text files in a bucket for other plugins, such as Import and Export's
 * backups. Calls run as the caller's acting user: reading needs this
 * plugin's view permission, writing and removing need edit.
 */
export function registerFilesService(
  ctx: PluginContext,
  service: ObjectStorageService,
): void {
  if (typeof ctx.services?.provide !== "function") return;

  async function need(permission: "view" | "edit") {
    if (!ctx.currentActor()) {
      throw new Error("The object storage service needs a calling user");
    }
    if (!(await ctx.rbac.has(permission))) {
      throw new Error(`Object storage ${permission} permission is needed`);
    }
  }

  const id = (value: unknown) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 1) throw new Error("Bad account id");
    return n;
  };

  ctx.services.provide<ObjectStorageFilesV1>("object-storage.files", {
    async accounts() {
      await need("view");
      return (await service.accounts()).map((a) => ({
        id: a.id,
        name: a.name,
      }));
    },
    async buckets(accountId) {
      await need("view");
      return (await service.buckets(id(accountId))).map((b) => b.name);
    },
    async putText(accountId, bucket, key, text, contentType) {
      await need("edit");
      const body = Buffer.from(String(text), "utf8");
      if (body.length > MAX_TEXT_BYTES) throw new Error("The file is too big");
      await service.putBuffer(
        id(accountId),
        bucket,
        key,
        body,
        contentType || "application/octet-stream",
      );
    },
    async list(accountId, bucket, prefix) {
      await need("view");
      return service.listAll(id(accountId), bucket, String(prefix ?? ""));
    },
    async getText(accountId, bucket, key) {
      await need("view");
      return service.getText(id(accountId), bucket, key, MAX_TEXT_BYTES);
    },
    async remove(accountId, bucket, key) {
      await need("edit");
      await service.removeObject(id(accountId), bucket, key);
    },
  });
}
