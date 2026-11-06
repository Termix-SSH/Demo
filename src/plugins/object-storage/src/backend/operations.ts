import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { ObjectStorageService } from "./service.js";

const fmt = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
};

/** An account value is the account id as text. */
export function parseAccount(value: unknown): number {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) throw new Error("Pick a login");
  return id;
}

const text = (value: unknown, label: string) => {
  const result = String(value ?? "").trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
};

/** Object storage as actions, so the assistant, rules and the CLI can use it. */
export function registerOperations(
  ctx: PluginContext,
  service: ObjectStorageService,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  ctx.operations.register("object-storage.list-accounts", {
    run: async () => {
      const rows = await service.accounts();
      const failing = rows.filter((row) => row.status === "error");
      const label = failing.length
        ? `${failing.length} of ${rows.length} logins failing`
        : `${rows.length} logins`;
      return {
        summary: label,
        data: {
          rows: rows.map((row) => ({
            id: String(row.id),
            name: row.name,
            provider: row.provider,
            status: row.status,
          })),
          options: rows.map((row) => ({
            value: String(row.id),
            label: row.name,
          })),
          value: failing.length,
          status: failing.length ? "fail" : "ok",
          label,
        },
      };
    },
  });

  ctx.operations.register("object-storage.list-buckets", {
    run: async (input) => {
      const rows = await service.buckets(parseAccount(input.account));
      return {
        summary: `${rows.length} buckets`,
        data: {
          rows: rows.map((row) => ({
            id: row.name,
            name: row.name,
            size: row.bytes === null ? "" : fmt(row.bytes),
            objects: row.objects ?? "",
          })),
          options: rows.map((row) => ({ value: row.name, label: row.name })),
        },
      };
    },
  });

  ctx.operations.register("object-storage.usage", {
    run: async () => {
      const summary = await service.summary();
      const label = summary.overQuota.length
        ? `${summary.overQuota.length} buckets near their limit`
        : `${fmt(summary.bytes)} in ${summary.buckets} buckets`;
      return {
        summary: label,
        data: {
          rows: summary.overQuota.map((item) => ({
            id: `${item.account}/${item.bucket}`,
            account: item.account,
            bucket: item.bucket,
            percent: item.percent,
          })),
          value: summary.overQuota.length,
          status: summary.overQuota.some((item) => item.percent >= 100)
            ? "fail"
            : summary.overQuota.length
              ? "warn"
              : "ok",
          label,
        },
      };
    },
  });

  ctx.operations.register("object-storage.list-objects", {
    run: async (input) => {
      const list = await service.listObjects(
        parseAccount(input.account),
        text(input.bucket, "Bucket"),
        { prefix: String(input.prefix ?? "") },
      );
      return {
        summary: `${list.folders.length} folders, ${list.objects.length} objects`,
        data: {
          rows: [
            ...list.folders.map((folder) => ({
              id: folder,
              name: folder,
              size: "",
            })),
            ...list.objects.map((item) => ({
              id: item.key,
              name: item.key,
              size: fmt(item.size),
            })),
          ],
        },
      };
    },
  });

  ctx.operations.register("object-storage.create-bucket", {
    describe: async (input) =>
      `Would create the bucket ${String(input.name ?? "")}`,
    run: async (input) => {
      const result = await service.createBucket(
        parseAccount(input.account),
        input.name,
      );
      return { summary: `Created ${result.bucket}`, changed: true };
    },
  });

  ctx.operations.register("object-storage.delete-object", {
    describe: async (input) =>
      `Would delete ${String(input.key ?? "")} from ${String(input.bucket ?? "")}`,
    run: async (input) => {
      const result = await service.removeObjects(
        parseAccount(input.account),
        text(input.bucket, "Bucket"),
        { keys: [text(input.key, "Object")] },
      );
      if (result.failed.length) throw new Error("The object was not deleted");
      return { summary: `Deleted ${String(input.key)}`, changed: true };
    },
  });

  ctx.operations.register("object-storage.share", {
    describe: async (input) =>
      `Would make a link to ${String(input.key ?? "")} that works for ${Number(input.seconds ?? 3600)} seconds`,
    run: async (input) => {
      const link = await service.share(
        parseAccount(input.account),
        text(input.bucket, "Bucket"),
        text(input.key, "Object"),
        input.seconds,
      );
      return {
        summary: `Link works until ${link.expiresAt}`,
        data: { url: link.url, expiresAt: link.expiresAt },
        changed: false,
      };
    },
  });
}
