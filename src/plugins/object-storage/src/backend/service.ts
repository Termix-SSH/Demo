import type { Readable } from "node:stream";
import { and, eq, lt } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  Account,
  AccountInput,
  BucketRow,
  BucketSettings,
  Listing,
  ObjectHead,
  SettingKind,
  Summary,
  UsagePoint,
} from "../shared/types.js";
import { providerIds } from "./presets.js";
import { PART_SIZE, S3Client, S3Error } from "./s3/client.js";
import { readSettings, writeSetting } from "./s3/settings.js";

export class StorageError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "StorageError";
  }
}

// The tables are only used through drizzle, so their column types are loose.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Stores {
  accounts: any;
  usage: any;
  limits: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface AccountRow {
  id: number;
  createdBy: string;
  provider: string;
  name: string;
  endpoint: string;
  region: string;
  pathStyle: boolean;
  credentials: string;
  ca: string | null;
  status: string;
  lastError: string | null;
  lastCheckAt: Date | string | null;
}

interface Creds {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

const ALERT_PERMISSION = "object-storage.manage";
const CHECK_EVERY_MS = 5 * 60_000;
const SCAN_PAGE = 1000;
const SCAN_MAX_PAGES = 500;
const KEEP_DAYS = 90;
export const MAX_SHARE_SECONDS = 7 * 86_400;

export type ObjectStorageService = ReturnType<typeof createService>;

const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;
const today = () => new Date().toISOString().slice(0, 10);
const messageOf = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

export function createService(ctx: PluginContext, stores: Stores) {
  const db = () => ctx.db.client<any>();
  let lastCheck = 0;

  async function insertId(
    table: any,
    values: Record<string, unknown>,
  ): Promise<number> {
    const client = await db();
    if (ctx.db.dialect === "mysql") {
      const result = await client.insert(table).values(values);
      const header = Array.isArray(result) ? result[0] : result;
      return Number(header?.insertId);
    }
    const rows = await client
      .insert(table)
      .values(values)
      .returning({ id: table.id });
    return rows[0].id as number;
  }

  async function rows(): Promise<AccountRow[]> {
    return (await db()).select().from(stores.accounts);
  }

  async function row(id: number): Promise<AccountRow> {
    const [found] = await (
      await db()
    )
      .select()
      .from(stores.accounts)
      .where(eq(stores.accounts.id, id))
      .limit(1);
    if (!found) throw new StorageError(404, "Account not found");
    return found as AccountRow;
  }

  async function credsOf(account: AccountRow): Promise<Creds> {
    const text = await ctx.secrets.unseal(account.credentials);
    if (!text) throw new StorageError(500, "The saved keys could not be read");
    return JSON.parse(text) as Creds;
  }

  function toAccount(account: AccountRow): Account {
    return {
      id: account.id,
      provider: account.provider,
      name: account.name,
      endpoint: account.endpoint,
      region: account.region,
      pathStyle: !!account.pathStyle,
      hasCa: !!account.ca,
      status: account.status,
      lastError: account.lastError,
      lastCheckAt: iso(account.lastCheckAt),
    };
  }

  async function clientFor(accountId: number): Promise<S3Client> {
    const account = await row(accountId);
    const creds = await credsOf(account);
    return new S3Client(
      {
        endpoint: account.endpoint,
        region: account.region,
        pathStyle: !!account.pathStyle,
        accessKeyId: creds.accessKeyId,
        secretAccessKey: creds.secretAccessKey,
        sessionToken: creds.sessionToken,
        ca: account.ca ?? undefined,
        aws: account.provider === "aws",
      },
      ctx.fetch,
    );
  }

  /** Turns a provider error into an answer for the user. */
  function wrap(error: unknown): never {
    if (error instanceof StorageError) throw error;
    if (error instanceof S3Error) {
      const status =
        error.status === 401 || error.status === 403
          ? 403
          : error.status === 404
            ? 404
            : error.status === 409
              ? 409
              : error.status >= 500 || error.status === 0
                ? 502
                : 400;
      throw new StorageError(status, `${error.code}: ${error.message}`);
    }
    throw new StorageError(500, messageOf(error));
  }

  async function run<T>(
    accountId: number,
    action: (c: S3Client) => Promise<T>,
  ) {
    const client = await clientFor(accountId);
    try {
      return await action(client);
    } catch (error) {
      return wrap(error);
    }
  }

  const cleanEndpoint = (value: unknown): string => {
    let url: URL;
    try {
      url = new URL(String(value ?? "").trim());
    } catch {
      throw new StorageError(400, "The endpoint is not a valid address");
    }
    if (!["http:", "https:"].includes(url.protocol)) {
      throw new StorageError(400, "The endpoint must start with http or https");
    }
    if (url.username || url.password) {
      throw new StorageError(400, "Keep keys out of the endpoint");
    }
    return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  };

  const cleanBucket = (value: unknown): string => {
    const name = String(value ?? "").trim();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,62}$/.test(name)) {
      throw new StorageError(400, "That is not a valid bucket name");
    }
    return name;
  };

  const cleanKey = (value: unknown): string => {
    const key = String(value ?? "");
    if (!key || key.length > 1024 || key.includes("\0")) {
      throw new StorageError(400, "That is not a valid object name");
    }
    return key;
  };

  // Accounts

  async function accounts(): Promise<Account[]> {
    return (await rows()).map(toAccount);
  }

  async function createAccount(
    input: AccountInput,
    userId: string,
  ): Promise<number> {
    const provider = String(input.provider ?? "");
    if (!providerIds.includes(provider)) {
      throw new StorageError(400, "Unknown provider");
    }
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 100);
    if (!name) throw new StorageError(400, "name is required");
    const accessKeyId = String(input.accessKeyId ?? "").trim();
    const secretAccessKey = String(input.secretAccessKey ?? "").trim();
    if (!accessKeyId || !secretAccessKey) {
      throw new StorageError(
        400,
        "An access key and a secret key are required",
      );
    }
    if ((await rows()).some((other) => other.name === name)) {
      throw new StorageError(409, "An account with that name exists");
    }
    const creds: Creds = {
      accessKeyId,
      secretAccessKey,
      ...(input.sessionToken?.trim()
        ? { sessionToken: input.sessionToken.trim() }
        : {}),
    };
    const id = await insertId(stores.accounts, {
      createdBy: userId,
      provider,
      name,
      endpoint: cleanEndpoint(input.endpoint),
      region:
        String(input.region ?? "")
          .trim()
          .slice(0, 64) || "us-east-1",
      pathStyle: input.pathStyle !== false,
      credentials: await ctx.secrets.seal(JSON.stringify(creds)),
      ca: input.ca?.trim() || null,
      status: "pending",
    });
    await ctx.db.persist();
    return id;
  }

  async function updateAccount(id: number, input: Partial<AccountInput>) {
    const account = await row(id);
    const changes: Record<string, unknown> = {};
    if (typeof input.name === "string" && input.name.trim()) {
      const name = input.name.trim().slice(0, 100);
      if ((await rows()).some((o) => o.name === name && o.id !== id)) {
        throw new StorageError(409, "An account with that name exists");
      }
      changes.name = name;
    }
    if (input.endpoint) changes.endpoint = cleanEndpoint(input.endpoint);
    if (input.region?.trim()) changes.region = input.region.trim().slice(0, 64);
    if (typeof input.pathStyle === "boolean")
      changes.pathStyle = input.pathStyle;
    if (typeof input.ca === "string") changes.ca = input.ca.trim() || null;
    const given =
      input.accessKeyId?.trim() ||
      input.secretAccessKey?.trim() ||
      input.sessionToken?.trim();
    if (given) {
      const old = await credsOf(account);
      const merged: Creds = {
        accessKeyId: input.accessKeyId?.trim() || old.accessKeyId,
        secretAccessKey: input.secretAccessKey?.trim() || old.secretAccessKey,
        sessionToken: input.sessionToken?.trim() || old.sessionToken,
      };
      changes.credentials = await ctx.secrets.seal(JSON.stringify(merged));
    }
    if (Object.keys(changes).length) {
      changes.status = "pending";
      await (
        await db()
      )
        .update(stores.accounts)
        .set(changes)
        .where(eq(stores.accounts.id, id));
      await ctx.db.persist();
    }
  }

  async function removeAccount(id: number) {
    await row(id);
    const client = await db();
    await client.delete(stores.usage).where(eq(stores.usage.accountId, id));
    await client.delete(stores.limits).where(eq(stores.limits.accountId, id));
    await client.delete(stores.accounts).where(eq(stores.accounts.id, id));
    await ctx.kv.delete(`down:${id}`);
    await ctx.db.persist();
  }

  async function markAccount(id: number, error: string | null) {
    await (
      await db()
    )
      .update(stores.accounts)
      .set({
        status: error ? "error" : "ok",
        lastError: error,
        lastCheckAt: new Date().toISOString(),
      })
      .where(eq(stores.accounts.id, id));
  }

  async function testAccount(id: number): Promise<{ buckets: number }> {
    const client = await clientFor(id);
    try {
      const list = await client.listBuckets();
      await markAccount(id, null);
      await ctx.db.persist();
      return { buckets: list.length };
    } catch (error) {
      await markAccount(id, messageOf(error)).catch(() => undefined);
      await ctx.db.persist();
      return wrap(error);
    }
  }

  // Buckets

  async function limitRows(accountId?: number) {
    const query = (await db()).select().from(stores.limits);
    return accountId === undefined
      ? query
      : query.where(eq(stores.limits.accountId, accountId));
  }

  async function latestUsage(accountId: number) {
    const found = await (
      await db()
    )
      .select()
      .from(stores.usage)
      .where(eq(stores.usage.accountId, accountId));
    const latest = new Map<string, any>();
    for (const item of found as any[]) {
      const seen = latest.get(item.bucket);
      if (!seen || item.day > seen.day) latest.set(item.bucket, item);
    }
    return latest;
  }

  async function buckets(accountId: number): Promise<BucketRow[]> {
    const list = await run(accountId, (c) => c.listBuckets());
    const usage = await latestUsage(accountId);
    const limits = new Map(
      ((await limitRows(accountId)) as any[]).map((l) => [l.bucket, l]),
    );
    return list.map((bucket) => {
      const seen = usage.get(bucket.name);
      const limit = limits.get(bucket.name);
      return {
        name: bucket.name,
        createdAt: bucket.createdAt,
        bytes: seen ? Number(seen.bytes) : null,
        objects: seen ? Number(seen.objects) : null,
        partial: !!seen?.partial,
        scannedAt: seen ? iso(seen.scannedAt) : null,
        maxBytes: limit?.maxBytes != null ? Number(limit.maxBytes) : null,
        maxObjects: limit?.maxObjects != null ? Number(limit.maxObjects) : null,
      };
    });
  }

  async function createBucket(accountId: number, name: unknown) {
    const bucket = cleanBucket(name);
    await run(accountId, (c) => c.createBucket(bucket));
    return { bucket };
  }

  async function deleteBucket(accountId: number, name: string) {
    await run(accountId, (c) => c.deleteBucket(cleanBucket(name)));
    const client = await db();
    await client
      .delete(stores.usage)
      .where(
        and(
          eq(stores.usage.accountId, accountId),
          eq(stores.usage.bucket, name),
        ),
      );
    await client
      .delete(stores.limits)
      .where(
        and(
          eq(stores.limits.accountId, accountId),
          eq(stores.limits.bucket, name),
        ),
      );
    await ctx.db.persist();
  }

  async function setLimit(
    accountId: number,
    bucket: string,
    input: { maxBytes?: unknown; maxObjects?: unknown },
  ) {
    await row(accountId);
    const clean = (value: unknown) => {
      if (value === null || value === undefined || value === "") return null;
      const n = Number(value);
      if (!Number.isFinite(n) || n <= 0) {
        throw new StorageError(400, "A limit must be a positive number");
      }
      return Math.floor(n);
    };
    const maxBytes = clean(input.maxBytes);
    const maxObjects = clean(input.maxObjects);
    const client = await db();
    const where = and(
      eq(stores.limits.accountId, accountId),
      eq(stores.limits.bucket, bucket),
    );
    await client.delete(stores.limits).where(where);
    if (maxBytes !== null || maxObjects !== null) {
      await insertId(stores.limits, {
        accountId,
        bucket,
        maxBytes,
        maxObjects,
      });
    }
    await ctx.kv.delete(`over:${accountId}:${bucket}`);
    await ctx.db.persist();
  }

  // Objects

  const listObjects = (
    accountId: number,
    bucket: string,
    options: { prefix?: string; token?: string; search?: boolean },
  ): Promise<Listing> =>
    run(accountId, (c) =>
      c.listObjects(bucket, {
        prefix: options.prefix,
        token: options.token,
        delimiter: options.search ? "" : "/",
      }),
    );

  const head = (
    accountId: number,
    bucket: string,
    key: string,
  ): Promise<ObjectHead> =>
    run(accountId, (c) => c.head(bucket, cleanKey(key)));

  /** The start of a download. The caller streams the body. */
  async function download(
    accountId: number,
    bucket: string,
    key: string,
    range?: string,
    signal?: AbortSignal,
  ): Promise<Response> {
    const client = await clientFor(accountId);
    try {
      return await client.get(bucket, cleanKey(key), range, signal);
    } catch (error) {
      return wrap(error);
    }
  }

  /** Sends a stream to the bucket, in parts when it is big. */
  async function upload(
    accountId: number,
    bucket: string,
    key: string,
    stream: Readable,
    contentType: string,
  ): Promise<{ size: number }> {
    const client = await clientFor(accountId);
    cleanKey(key);
    let uploadId: string | null = null;
    const parts: Array<{ number: number; etag: string }> = [];
    let pending: Buffer[] = [];
    let pendingSize = 0;
    let total = 0;
    try {
      const flush = async (force: boolean) => {
        while (pendingSize >= PART_SIZE || (force && pendingSize > 0)) {
          const all = Buffer.concat(pending);
          const part = all.subarray(0, PART_SIZE);
          const rest = all.subarray(part.length);
          pending = rest.length ? [rest] : [];
          pendingSize = rest.length;
          if (!uploadId) {
            if (force && !parts.length && part.length < PART_SIZE) {
              await client.put(bucket, key, Buffer.from(part), contentType);
              return true;
            }
            uploadId = await client.startUpload(bucket, key, contentType);
          }
          const number = parts.length + 1;
          const etag = await client.uploadPart(
            bucket,
            key,
            uploadId,
            number,
            Buffer.from(part),
          );
          parts.push({ number, etag });
        }
        return false;
      };
      let done = false;
      for await (const chunk of stream) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        pending.push(buffer);
        pendingSize += buffer.length;
        total += buffer.length;
        await flush(false);
      }
      if (!uploadId && pendingSize === 0) {
        await client.put(bucket, key, Buffer.alloc(0), contentType);
        done = true;
      } else {
        done = await flush(true);
      }
      if (!done && uploadId) {
        await client.finishUpload(bucket, key, uploadId, parts);
      }
      return { size: total };
    } catch (error) {
      if (uploadId) await client.abortUpload(bucket, key, uploadId);
      return wrap(error);
    }
  }

  async function makeFolder(accountId: number, bucket: string, prefix: string) {
    const name = String(prefix ?? "").replace(/^\/+|\/+$/g, "");
    if (!name) throw new StorageError(400, "A folder name is required");
    await run(accountId, (c) => c.createFolder(bucket, `${name}/`));
  }

  /** Every key under a prefix. */
  async function keysUnder(client: S3Client, bucket: string, prefix: string) {
    const keys: string[] = [];
    let token: string | undefined;
    for (let page = 0; page < 10_000; page++) {
      const list = await client.listObjects(bucket, {
        prefix,
        delimiter: "",
        token,
        max: 1000,
      });
      keys.push(...list.objects.map((o) => o.key));
      if (!list.next) break;
      token = list.next;
    }
    return keys;
  }

  async function removeObjects(
    accountId: number,
    bucket: string,
    input: { keys?: string[]; prefixes?: string[] },
  ): Promise<{ deleted: number; failed: string[] }> {
    return run(accountId, async (c) => {
      const keys = new Set<string>((input.keys ?? []).map(cleanKey));
      for (const prefix of input.prefixes ?? []) {
        const clean = cleanKey(prefix);
        for (const key of await keysUnder(c, bucket, clean)) keys.add(key);
      }
      const list = [...keys];
      const failed = list.length ? await c.removeMany(bucket, list) : [];
      return { deleted: list.length - failed.length, failed };
    });
  }

  /** Copies or moves one object or a whole folder. */
  async function transfer(
    accountId: number,
    bucket: string,
    input: {
      from: string;
      to: string;
      folder?: boolean;
      toBucket?: string;
    },
    move: boolean,
  ): Promise<{ count: number }> {
    const source = await clientFor(accountId);
    const targetBucket = input.toBucket ? cleanBucket(input.toBucket) : bucket;
    try {
      const pairs: Array<[string, string]> = [];
      if (input.folder) {
        const from = cleanKey(input.from).replace(/\/*$/, "/");
        const to = cleanKey(input.to).replace(/\/*$/, "/");
        for (const key of await keysUnder(source, bucket, from)) {
          pairs.push([key, to + key.slice(from.length)]);
        }
      } else {
        pairs.push([cleanKey(input.from), cleanKey(input.to)]);
      }
      if (targetBucket === bucket && pairs.some(([from, to]) => from === to)) {
        throw new StorageError(400, "The new name is the same as the old one");
      }
      for (const [from, to] of pairs) {
        await source.copy(targetBucket, to, bucket, from);
      }
      if (move) {
        const failed = await source.removeMany(
          bucket,
          pairs.map(([from]) => from),
        );
        if (failed.length) {
          throw new StorageError(
            502,
            `Copied, but could not remove ${failed.length} old objects`,
          );
        }
      }
      return { count: pairs.length };
    } catch (error) {
      return wrap(error);
    }
  }

  async function share(
    accountId: number,
    bucket: string,
    key: string,
    seconds: unknown,
    request?: unknown,
  ): Promise<{ url: string; expiresAt: string }> {
    const client = await clientFor(accountId);
    const wanted = Math.floor(Number(seconds) || 3600);
    const clamped = Math.min(Math.max(wanted, 60), MAX_SHARE_SECONDS);
    const url = client.share(bucket, cleanKey(key), clamped);
    await ctx.audit
      .record({
        action: "object_storage_share",
        resourceType: "object",
        resourceId: `${accountId}:${bucket}`,
        resourceName: key,
        details: `Link valid for ${clamped} seconds`,
        success: true,
        request,
      })
      .catch(() => undefined);
    return {
      url,
      expiresAt: new Date(Date.now() + clamped * 1000).toISOString(),
    };
  }

  // Bucket settings

  const settings = (
    accountId: number,
    bucket: string,
  ): Promise<BucketSettings> => run(accountId, (c) => readSettings(c, bucket));

  const saveSetting = (
    accountId: number,
    bucket: string,
    kind: SettingKind,
    value: unknown,
  ) => run(accountId, (c) => writeSetting(c, bucket, kind, value));

  // Usage

  async function scanBucket(accountId: number, bucket: string) {
    const client = await clientFor(accountId);
    let bytes = 0;
    let objects = 0;
    let partial = false;
    let token: string | undefined;
    try {
      for (let page = 0; ; page++) {
        if (page >= SCAN_MAX_PAGES) {
          partial = true;
          break;
        }
        const list = await client.listObjects(bucket, {
          delimiter: "",
          token,
          max: SCAN_PAGE,
        });
        for (const item of list.objects) {
          bytes += item.size;
          objects++;
        }
        if (!list.next) break;
        token = list.next;
      }
    } catch (error) {
      return wrap(error);
    }
    const day = today();
    const client2 = await db();
    await client2
      .delete(stores.usage)
      .where(
        and(
          eq(stores.usage.accountId, accountId),
          eq(stores.usage.bucket, bucket),
          eq(stores.usage.day, day),
        ),
      );
    await insertId(stores.usage, {
      accountId,
      bucket,
      day,
      bytes,
      objects,
      partial,
    });
    await ctx.db.persist({ lazy: true });
    await checkLimit(accountId, bucket, bytes, objects);
    return { bytes, objects, partial };
  }

  async function history(
    accountId: number,
    bucket: string,
  ): Promise<UsagePoint[]> {
    const found = await (
      await db()
    )
      .select()
      .from(stores.usage)
      .where(
        and(
          eq(stores.usage.accountId, accountId),
          eq(stores.usage.bucket, bucket),
        ),
      );
    return (found as any[])
      .map((item) => ({
        day: item.day as string,
        bytes: Number(item.bytes),
        objects: Number(item.objects),
      }))
      .sort((a, b) => (a.day < b.day ? -1 : 1));
  }

  // Alerts

  async function alert(
    title: string,
    body: string,
    severity: "info" | "warning" | "critical",
    dedupeKey: string,
  ) {
    try {
      await ctx.notify.send({
        title,
        body,
        severity,
        category: "object-storage.alert",
        audience: { permission: ALERT_PERMISSION },
        dedupeKey,
        link: { tab: "object-storage" },
      });
    } catch (error) {
      ctx.log.warn(`Could not send a storage alert: ${messageOf(error)}`);
    }
  }

  async function checkLimit(
    accountId: number,
    bucket: string,
    bytes: number,
    objects: number,
  ) {
    const [limit] = (await (
      await db()
    )
      .select()
      .from(stores.limits)
      .where(
        and(
          eq(stores.limits.accountId, accountId),
          eq(stores.limits.bucket, bucket),
        ),
      )
      .limit(1)) as any[];
    if (!limit) return;
    const maxBytes = limit.maxBytes != null ? Number(limit.maxBytes) : null;
    const maxObjects =
      limit.maxObjects != null ? Number(limit.maxObjects) : null;
    const over =
      (maxBytes !== null && bytes >= maxBytes) ||
      (maxObjects !== null && objects >= maxObjects);
    const key = `over:${accountId}:${bucket}`;
    const was = await ctx.kv.get(key);
    if (over && !was) {
      await ctx.kv.set(key, true);
      const account = await row(accountId);
      await alert(
        `Bucket ${bucket} is over its limit`,
        `${account.name}: ${bucket} holds ${objects} objects and ${bytes} bytes.`,
        "warning",
        `over:${accountId}:${bucket}`,
      );
    } else if (!over && was) {
      await ctx.kv.delete(key);
    }
  }

  /** Reachability of every login, with one alert per outage. */
  async function checkAccounts() {
    for (const account of await rows()) {
      const key = `down:${account.id}`;
      try {
        const client = await clientFor(account.id);
        await client.listBuckets();
        await markAccount(account.id, null);
        if (await ctx.kv.get(key)) {
          await ctx.kv.delete(key);
          await alert(
            `${account.name} is back`,
            "The storage login works again.",
            "info",
            `up:${account.id}`,
          );
        }
      } catch (error) {
        const message = messageOf(error);
        await markAccount(account.id, message).catch(() => undefined);
        if (!(await ctx.kv.get(key))) {
          await ctx.kv.set(key, true);
          await alert(
            `${account.name} is not reachable`,
            message,
            "critical",
            `down:${account.id}`,
          );
        }
      }
    }
    await ctx.db.persist({ lazy: true });
  }

  /** Daily size scan of every bucket, and old reading cleanup. */
  async function scanAll() {
    for (const account of await rows()) {
      let list: Array<{ name: string }> = [];
      try {
        list = await (await clientFor(account.id)).listBuckets();
      } catch {
        continue;
      }
      for (const bucket of list) {
        await scanBucket(account.id, bucket.name).catch((error) =>
          ctx.log.warn(
            `Could not scan ${account.name}/${bucket.name}: ${messageOf(error)}`,
          ),
        );
      }
    }
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await (await db()).delete(stores.usage).where(lt(stores.usage.day, cutoff));
    await ctx.db.persist({ lazy: true });
  }

  /** Called every minute. Does the slow work only when it is due. */
  async function runDue() {
    const now = Date.now();
    if (now - lastCheck >= CHECK_EVERY_MS) {
      lastCheck = now;
      await checkAccounts();
    }
    const day = today();
    if ((await ctx.kv.get("scan:last")) !== day) {
      await ctx.kv.set("scan:last", day);
      await scanAll();
    }
  }

  async function summary(): Promise<Summary> {
    const list = await rows();
    const limits = (await limitRows()) as any[];
    let bucketsCount = 0;
    let bytes = 0;
    const overQuota: Summary["overQuota"] = [];
    for (const account of list) {
      const usage = await latestUsage(account.id);
      for (const [bucket, seen] of usage) {
        bucketsCount++;
        bytes += Number(seen.bytes);
        const limit = limits.find(
          (l) => l.accountId === account.id && l.bucket === bucket,
        );
        if (limit?.maxBytes != null) {
          const percent = Math.round(
            (Number(seen.bytes) / Number(limit.maxBytes)) * 100,
          );
          if (percent >= 80) {
            overQuota.push({ account: account.name, bucket, percent });
          }
        }
      }
    }
    return {
      accounts: list.length,
      failingAccounts: list.filter((a) => a.status === "error").length,
      buckets: bucketsCount,
      bytes,
      overQuota,
    };
  }

  return {
    accounts,
    createAccount,
    updateAccount,
    removeAccount,
    testAccount,
    buckets,
    createBucket,
    deleteBucket,
    setLimit,
    listObjects,
    head,
    download,
    upload,
    makeFolder,
    removeObjects,
    copy: (
      accountId: number,
      bucket: string,
      input: Parameters<typeof transfer>[2],
    ) => transfer(accountId, bucket, input, false),
    move: (
      accountId: number,
      bucket: string,
      input: Parameters<typeof transfer>[2],
    ) => transfer(accountId, bucket, input, true),
    share,
    settings,
    saveSetting,
    scanBucket,
    history,
    runDue,
    checkAccounts,
    summary,
  };
}
