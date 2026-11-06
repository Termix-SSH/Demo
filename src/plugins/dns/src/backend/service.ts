import { createHash } from "node:crypto";
import { lookup as osLookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { and, desc, eq, inArray } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  Account,
  AccountInput,
  DiffEntry,
  DnsRecord,
  DomainInfo,
  DomainRow,
  HealthReport,
  Link,
  LinkInput,
  PropagationRow,
  RecordInput,
  Snapshot,
  Zone,
  ZoneRef,
} from "../shared/types.js";
import {
  checkPropagation,
  checkZone,
  createLookup,
  type DnsLookup,
} from "./health.js";
import {
  getProvider,
  ProviderError,
  type Credentials,
  type DnsProvider,
} from "./providers/index.js";
import { pool } from "./providers/http.js";
import { cleanDomain, lookupDomain } from "./rdap.js";
import {
  cleanInput,
  describePlan,
  parseZoneFile,
  plan,
  toZoneFile,
  type Plan,
} from "./records.js";

export class DnsError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "DnsError";
  }
}

// The tables are only used through drizzle, so their column types are loose.
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface Stores {
  accounts: any;
  snapshots: any;
  domains: any;
  links: any;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface AccountRow {
  id: number;
  createdBy: string;
  provider: string;
  name: string;
  credentials: string;
  status: string;
  lastError: string | null;
  lastSyncAt: string | null;
  autoBackup: boolean;
  checkHealth: boolean;
}

interface SnapshotRow {
  id: number;
  accountId: number;
  zoneId: string;
  zoneName: string;
  label: string;
  source: Snapshot["source"];
  recordCount: number;
  data: string;
  createdAt: string;
}

interface DomainDbRow {
  id: number;
  accountId: number | null;
  name: string;
  registrar: string | null;
  expiresAt: string | null;
  autoRenew: boolean | null;
  locked: boolean | null;
  nameservers: string | null;
  status: string | null;
  source: "account" | "watch";
  checkedAt: string | null;
}

interface LinkRow {
  id: number;
  createdBy: string;
  accountId: number;
  zoneId: string;
  zoneName: string;
  name: string;
  type: "A" | "AAAA";
  source: Link["source"];
  hostId: number | null;
  ttl: number;
  proxied: boolean;
  enabled: boolean;
  lastValue: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
}

const ZONE_TTL_MS = 60_000;
const RECORD_TTL_MS = 20_000;
const SNAPSHOT_KEEP = 40;
const BEFORE_GAP_MS = 10 * 60_000;
const LINK_EVERY_MS = 5 * 60_000;
const DAILY_MS = 24 * 60 * 60_000;
const EXPIRY_STEPS = [30, 14, 7, 3, 1, 0];
const ALERT_PERMISSION = "dns.manage";

export type DnsService = ReturnType<typeof createService>;

function hashRecords(records: DnsRecord[]): string {
  const lines = records
    .filter((record) => !record.readOnly)
    .map(
      (record) =>
        `${record.type}|${record.name}|${record.priority ?? ""}|${record.content}|${record.ttl}`,
    )
    .sort();
  return createHash("sha1").update(lines.join("\n")).digest("hex");
}

function daysLeft(iso: string | null): number | null {
  if (!iso) return null;
  return Math.floor((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export function createService(
  ctx: PluginContext,
  stores: Stores,
  options: { lookup?: DnsLookup } = {},
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = () => ctx.db.client<any>();
  const lookup = options.lookup ?? createLookup();
  const zoneCache = new Map<number, { at: number; zones: Zone[] }>();
  const recordCache = new Map<string, { at: number; records: DnsRecord[] }>();

  async function insertId(
    table: unknown,
    values: Record<string, unknown>,
  ): Promise<number> {
    const client = await db();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = table as any;
    if (ctx.db.dialect === "mysql") {
      const result = await client.insert(t).values(values);
      const header = Array.isArray(result) ? result[0] : result;
      return Number(header?.insertId);
    }
    const rows = await client.insert(t).values(values).returning({ id: t.id });
    return rows[0].id as number;
  }

  // Accounts

  const publicAccount = (row: AccountRow): Account => ({
    id: row.id,
    provider: row.provider as Account["provider"],
    name: row.name,
    status: row.status,
    lastError: row.lastError,
    lastSyncAt: row.lastSyncAt,
    autoBackup: row.autoBackup,
    checkHealth: row.checkHealth,
  });

  async function accountRows(): Promise<AccountRow[]> {
    return (await db()).select().from(stores.accounts);
  }

  async function accountRow(id: number): Promise<AccountRow> {
    const [row] = await (
      await db()
    )
      .select()
      .from(stores.accounts)
      .where(eq(stores.accounts.id, id))
      .limit(1);
    if (!row) throw new DnsError(404, "Account not found");
    return row as AccountRow;
  }

  async function credsOf(row: AccountRow): Promise<Credentials> {
    try {
      return JSON.parse(await ctx.secrets.unseal(row.credentials));
    } catch {
      throw new DnsError(500, "The saved keys could not be read");
    }
  }

  function providerOf(row: AccountRow): DnsProvider {
    const provider = getProvider(row.provider);
    if (!provider) throw new DnsError(400, "Unknown provider");
    return provider;
  }

  function cleanCredentials(
    provider: DnsProvider,
    input: unknown,
  ): Credentials {
    const source = (input && typeof input === "object" ? input : {}) as Record<
      string,
      unknown
    >;
    const out: Credentials = {};
    for (const field of provider.fields) {
      const value =
        typeof source[field.key] === "string"
          ? (source[field.key] as string).trim()
          : "";
      if (!value && field.required) {
        throw new DnsError(400, `${field.key} is required`);
      }
      if (value) out[field.key] = value.slice(0, 8192);
    }
    return out;
  }

  async function setStatus(id: number, error: string | null) {
    await (
      await db()
    )
      .update(stores.accounts)
      .set({
        status: error ? "error" : "ok",
        lastError: error,
        lastSyncAt: new Date().toISOString(),
      })
      .where(eq(stores.accounts.id, id));
    await ctx.db.persist({ lazy: true });
  }

  /** Runs a provider call and turns its failures into answers. */
  async function guarded<T>(
    row: AccountRow,
    run: () => Promise<T>,
  ): Promise<T> {
    try {
      const result = await run();
      if (row.status === "error") await setStatus(row.id, null);
      return result;
    } catch (error) {
      if (error instanceof DnsError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await setStatus(row.id, message).catch(() => undefined);
      throw error instanceof ProviderError
        ? new DnsError(502, message)
        : new DnsError(500, message);
    }
  }

  async function createAccount(
    input: AccountInput,
    userId: string,
  ): Promise<number> {
    const provider = getProvider(String(input.provider));
    if (!provider) throw new DnsError(400, "Unknown provider");
    const name = String(input.name ?? "")
      .trim()
      .slice(0, 100);
    if (!name) throw new DnsError(400, "name is required");
    const creds = cleanCredentials(provider, input.credentials);
    const dupe = (await accountRows()).find((row) => row.name === name);
    if (dupe) throw new DnsError(409, "An account with that name exists");
    const id = await insertId(stores.accounts, {
      createdBy: userId,
      provider: provider.id,
      name,
      credentials: await ctx.secrets.seal(JSON.stringify(creds)),
      status: "pending",
      autoBackup: input.autoBackup !== false,
      checkHealth: input.checkHealth !== false,
    });
    await ctx.db.persist();
    return id;
  }

  async function updateAccount(id: number, input: Partial<AccountInput>) {
    const row = await accountRow(id);
    const provider = providerOf(row);
    const changes: Record<string, unknown> = {};
    if (typeof input.name === "string" && input.name.trim()) {
      const name = input.name.trim().slice(0, 100);
      const dupe = (await accountRows()).find(
        (other) => other.name === name && other.id !== id,
      );
      if (dupe) throw new DnsError(409, "An account with that name exists");
      changes.name = name;
    }
    if (typeof input.autoBackup === "boolean") {
      changes.autoBackup = input.autoBackup;
    }
    if (typeof input.checkHealth === "boolean") {
      changes.checkHealth = input.checkHealth;
    }
    const given = input.credentials
      ? Object.values(input.credentials).some((value) => String(value).trim())
      : false;
    if (given) {
      const old = await credsOf(row);
      const merged = { ...old };
      for (const field of provider.fields) {
        const value = String(input.credentials?.[field.key] ?? "").trim();
        if (value) merged[field.key] = value.slice(0, 8192);
      }
      changes.credentials = await ctx.secrets.seal(JSON.stringify(merged));
      changes.status = "pending";
      zoneCache.delete(id);
    }
    if (Object.keys(changes).length) {
      await (
        await db()
      )
        .update(stores.accounts)
        .set(changes)
        .where(eq(stores.accounts.id, id));
      await ctx.db.persist();
    }
  }

  async function deleteAccount(id: number) {
    await accountRow(id);
    const client = await db();
    await client
      .delete(stores.snapshots)
      .where(eq(stores.snapshots.accountId, id));
    await client.delete(stores.links).where(eq(stores.links.accountId, id));
    await client.delete(stores.domains).where(eq(stores.domains.accountId, id));
    await client.delete(stores.accounts).where(eq(stores.accounts.id, id));
    zoneCache.delete(id);
    await ctx.db.persist();
  }

  async function testAccount(id: number) {
    const row = await accountRow(id);
    const provider = providerOf(row);
    const creds = await credsOf(row);
    return guarded(row, async () => {
      const zones = await provider.zones(creds, ctx.fetch);
      zoneCache.set(id, { at: Date.now(), zones });
      let domainCount: number | null = null;
      if (provider.domains) {
        domainCount = (await provider.domains(creds, ctx.fetch)).length;
      }
      await setStatus(id, null);
      return { zones: zones.length, domains: domainCount };
    });
  }

  // Zones and records

  async function zonesOf(row: AccountRow, fresh = false): Promise<Zone[]> {
    const cached = zoneCache.get(row.id);
    if (!fresh && cached && Date.now() - cached.at < ZONE_TTL_MS) {
      return cached.zones;
    }
    const provider = providerOf(row);
    const zones = await guarded(row, async () =>
      provider.zones(await credsOf(row), ctx.fetch),
    );
    zoneCache.set(row.id, { at: Date.now(), zones });
    return zones;
  }

  async function zones(): Promise<{
    zones: ZoneRef[];
    errors: Array<{ accountId: number; name: string; error: string }>;
  }> {
    const rows = await accountRows();
    const out: ZoneRef[] = [];
    const errors: Array<{ accountId: number; name: string; error: string }> =
      [];
    await pool(rows, 3, async (row) => {
      try {
        for (const zone of await zonesOf(row)) {
          out.push({
            ...zone,
            accountId: row.id,
            accountName: row.name,
            provider: row.provider as ZoneRef["provider"],
          });
        }
      } catch (error) {
        errors.push({
          accountId: row.id,
          name: row.name,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
    out.sort((a, b) => a.name.localeCompare(b.name));
    return { zones: out, errors };
  }

  async function context(accountId: number, zoneId: string) {
    const row = await accountRow(accountId);
    const provider = providerOf(row);
    const zone = (await zonesOf(row)).find((item) => item.id === zoneId);
    if (!zone) throw new DnsError(404, "Zone not found");
    return { row, provider, zone, creds: await credsOf(row) };
  }

  async function recordsOf(
    accountId: number,
    zoneId: string,
    fresh = false,
  ): Promise<DnsRecord[]> {
    const key = `${accountId}|${zoneId}`;
    const cached = recordCache.get(key);
    if (!fresh && cached && Date.now() - cached.at < RECORD_TTL_MS) {
      return cached.records;
    }
    const { row, provider, zone, creds } = await context(accountId, zoneId);
    const records = await guarded(row, () =>
      provider.records(creds, zone, ctx.fetch),
    );
    recordCache.set(key, { at: Date.now(), records });
    return records;
  }

  const hashKey = (accountId: number, zoneId: string) =>
    `hash:${accountId}:${zoneId}`;

  async function rememberHash(accountId: number, zoneId: string) {
    const fresh = await recordsOf(accountId, zoneId, true);
    await ctx.kv.set(hashKey(accountId, zoneId), hashRecords(fresh));
  }

  // Snapshots

  const publicSnapshot = (row: SnapshotRow): Snapshot => ({
    id: row.id,
    accountId: row.accountId,
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    label: row.label,
    source: row.source,
    recordCount: row.recordCount,
    createdAt: row.createdAt,
  });

  async function snapshotRows(
    accountId: number,
    zoneId: string,
  ): Promise<SnapshotRow[]> {
    return (await db())
      .select()
      .from(stores.snapshots)
      .where(
        and(
          eq(stores.snapshots.accountId, accountId),
          eq(stores.snapshots.zoneId, zoneId),
        ),
      )
      .orderBy(desc(stores.snapshots.id));
  }

  async function takeSnapshot(
    accountId: number,
    zoneId: string,
    label: string,
    source: Snapshot["source"],
  ): Promise<Snapshot> {
    const { zone } = await context(accountId, zoneId);
    const records = (await recordsOf(accountId, zoneId, true)).filter(
      (record) => !record.readOnly,
    );
    const id = await insertId(stores.snapshots, {
      accountId,
      zoneId,
      zoneName: zone.name,
      label: label.slice(0, 100),
      source,
      recordCount: records.length,
      data: JSON.stringify(records),
    });
    const all = await snapshotRows(accountId, zoneId);
    const old = all.slice(SNAPSHOT_KEEP).map((row) => row.id);
    if (old.length) {
      await (
        await db()
      )
        .delete(stores.snapshots)
        .where(inArray(stores.snapshots.id, old));
    }
    await ctx.db.persist({ lazy: true });
    const row = all.find((item) => item.id === id) ?? all[0];
    return publicSnapshot(row);
  }

  /** A copy before a change, unless one was taken a moment ago. */
  async function backupBefore(
    accountId: number,
    zoneId: string,
    label: string,
  ) {
    const row = await accountRow(accountId);
    if (!row.autoBackup) return;
    const [latest] = await snapshotRows(accountId, zoneId);
    if (
      latest &&
      Date.now() - new Date(latest.createdAt).getTime() < BEFORE_GAP_MS
    ) {
      return;
    }
    await takeSnapshot(accountId, zoneId, label, "before");
  }

  async function snapshots(accountId: number, zoneId: string) {
    return (await snapshotRows(accountId, zoneId)).map(publicSnapshot);
  }

  async function snapshotRow(id: number): Promise<SnapshotRow> {
    const [row] = await (
      await db()
    )
      .select()
      .from(stores.snapshots)
      .where(eq(stores.snapshots.id, id))
      .limit(1);
    if (!row) throw new DnsError(404, "Snapshot not found");
    return row as SnapshotRow;
  }

  const wantedFrom = (row: SnapshotRow): RecordInput[] =>
    (JSON.parse(row.data) as DnsRecord[]).map((record) => ({
      type: record.type,
      name: record.name,
      content: record.content,
      ttl: record.ttl,
      priority: record.priority ?? null,
      proxied: record.proxied,
      comment: record.comment,
    }));

  async function apply(
    accountId: number,
    zoneId: string,
    changes: Plan,
  ): Promise<void> {
    const { provider, zone, creds } = await context(accountId, zoneId);
    for (const record of changes.removes) {
      await provider.remove(creds, zone, record, ctx.fetch);
    }
    for (const { record, input } of changes.updates) {
      await provider.update(creds, zone, record, input, ctx.fetch);
    }
    for (const input of changes.creates) {
      await provider.create(creds, zone, input, ctx.fetch);
    }
    recordCache.delete(`${accountId}|${zoneId}`);
    await rememberHash(accountId, zoneId);
  }

  async function restore(
    snapshotId: number,
    options: { apply: boolean },
  ): Promise<{ diff: DiffEntry[]; applied: boolean }> {
    const snap = await snapshotRow(snapshotId);
    const { row, provider } = await context(snap.accountId, snap.zoneId);
    const current = await recordsOf(snap.accountId, snap.zoneId, true);
    const wanted = wantedFrom(snap).filter((record) =>
      provider.features.types.includes(record.type),
    );
    const changes = plan(current, wanted);
    const diff = describePlan(changes);
    if (!options.apply || diff.length === 0) return { diff, applied: false };
    await guarded(row, async () => {
      await takeSnapshot(
        snap.accountId,
        snap.zoneId,
        `Before restoring #${snap.id}`,
        "before",
      );
      await apply(snap.accountId, snap.zoneId, changes);
    });
    return { diff, applied: true };
  }

  async function diffSnapshot(snapshotId: number): Promise<DiffEntry[]> {
    return (await restore(snapshotId, { apply: false })).diff;
  }

  async function deleteSnapshot(id: number) {
    await snapshotRow(id);
    await (
      await db()
    )
      .delete(stores.snapshots)
      .where(eq(stores.snapshots.id, id));
    await ctx.db.persist({ lazy: true });
  }

  // Record changes

  async function saveRecord(
    accountId: number,
    zoneId: string,
    raw: Partial<RecordInput>,
    recordId?: string,
  ): Promise<void> {
    const { row, provider, zone, creds } = await context(accountId, zoneId);
    const input = cleanInput(raw, provider.features, zone.name);
    if (typeof input === "string") throw new DnsError(400, input);
    await guarded(row, async () => {
      const current = await recordsOf(accountId, zoneId, true);
      let existing: DnsRecord | undefined;
      if (recordId) {
        existing = current.find((record) => record.id === recordId);
        if (!existing) throw new DnsError(404, "Record not found");
        if (existing.readOnly) {
          throw new DnsError(400, "The provider manages this record");
        }
      }
      await backupBefore(accountId, zoneId, "Before a change");
      if (existing) {
        await provider.update(creds, zone, existing, input, ctx.fetch);
      } else {
        await provider.create(creds, zone, input, ctx.fetch);
      }
      recordCache.delete(`${accountId}|${zoneId}`);
      await rememberHash(accountId, zoneId);
    });
  }

  async function deleteRecord(
    accountId: number,
    zoneId: string,
    recordId: string,
  ): Promise<void> {
    const { row, provider, zone, creds } = await context(accountId, zoneId);
    await guarded(row, async () => {
      const current = await recordsOf(accountId, zoneId, true);
      const existing = current.find((record) => record.id === recordId);
      if (!existing) throw new DnsError(404, "Record not found");
      if (existing.readOnly) {
        throw new DnsError(400, "The provider manages this record");
      }
      await backupBefore(accountId, zoneId, "Before a delete");
      await provider.remove(creds, zone, existing, ctx.fetch);
      recordCache.delete(`${accountId}|${zoneId}`);
      await rememberHash(accountId, zoneId);
    });
  }

  async function exportZone(accountId: number, zoneId: string) {
    const { zone } = await context(accountId, zoneId);
    const records = await recordsOf(accountId, zoneId);
    return { name: zone.name, text: toZoneFile(zone.name, records) };
  }

  async function importZone(
    accountId: number,
    zoneId: string,
    text: string,
    options: { apply: boolean; replace: boolean },
  ): Promise<{ diff: DiffEntry[]; skipped: string[]; applied: boolean }> {
    const { row, provider, zone } = await context(accountId, zoneId);
    if (text.length > 1_000_000) throw new DnsError(400, "The file is too big");
    const parsed = parseZoneFile(text, zone.name, provider.features);
    const checked: RecordInput[] = [];
    const skipped = [...parsed.skipped];
    for (const record of parsed.records) {
      const clean = cleanInput(record, provider.features, zone.name);
      if (typeof clean === "string")
        skipped.push(`${record.name} ${record.type}: ${clean}`);
      else checked.push(clean);
    }
    const current = await recordsOf(accountId, zoneId, true);
    const changes = plan(current, checked, { keepExtra: !options.replace });
    const diff = describePlan(changes);
    if (!options.apply || diff.length === 0) {
      return { diff, skipped, applied: false };
    }
    await guarded(row, async () => {
      await takeSnapshot(accountId, zoneId, "Before an import", "before");
      await apply(accountId, zoneId, changes);
    });
    return { diff, skipped, applied: true };
  }

  // Health

  async function health(
    accountId: number,
    zoneId: string,
  ): Promise<HealthReport> {
    const { zone } = await context(accountId, zoneId);
    const records = await recordsOf(accountId, zoneId, true);
    const checks = await checkZone(
      { zone: zone.name, records, expectedNs: zone.nameservers },
      lookup,
      ctx.fetch,
    );
    const report: HealthReport = {
      zoneName: zone.name,
      at: new Date().toISOString(),
      checks,
    };
    await ctx.kv.set(`health:${accountId}:${zoneId}`, report);
    return report;
  }

  async function lastHealth(
    accountId: number,
    zoneId: string,
  ): Promise<HealthReport | null> {
    return ((await ctx.kv.get(`health:${accountId}:${zoneId}`)) ??
      null) as HealthReport | null;
  }

  async function propagation(
    accountId: number,
    zoneId: string,
  ): Promise<PropagationRow[]> {
    const { zone } = await context(accountId, zoneId);
    const records = await recordsOf(accountId, zoneId, true);
    return checkPropagation(lookup, zone.name, records);
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
        category: "dns.alert",
        audience: { permission: ALERT_PERMISSION },
        dedupeKey,
        link: { tab: "dns" },
      });
    } catch (error) {
      ctx.log.warn(
        `Could not send a DNS alert: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Domains

  async function domainRows(): Promise<DomainDbRow[]> {
    return (await db()).select().from(stores.domains);
  }

  async function domainList(): Promise<DomainRow[]> {
    const names = new Map(
      (await accountRows()).map((row) => [row.id, row.name]),
    );
    return (await domainRows())
      .map((row) => ({
        id: row.id,
        accountId: row.accountId,
        accountName: row.accountId ? (names.get(row.accountId) ?? null) : null,
        name: row.name,
        registrar: row.registrar,
        expiresAt: row.expiresAt,
        autoRenew: row.autoRenew,
        locked: row.locked,
        nameservers: row.nameservers ? JSON.parse(row.nameservers) : [],
        status: row.status,
        source: row.source,
        checkedAt: row.checkedAt,
        daysLeft: daysLeft(row.expiresAt),
      }))
      .sort(
        (a, b) =>
          (a.daysLeft ?? Number.MAX_SAFE_INTEGER) -
          (b.daysLeft ?? Number.MAX_SAFE_INTEGER),
      );
  }

  async function saveDomain(
    existing: DomainDbRow | undefined,
    accountId: number | null,
    source: "account" | "watch",
    info: DomainInfo,
  ) {
    const values = {
      accountId,
      name: info.name,
      registrar: info.registrar?.slice(0, 100) ?? null,
      expiresAt: info.expiresAt,
      autoRenew: info.autoRenew,
      locked: info.locked,
      nameservers: JSON.stringify(info.nameservers),
      status: info.status?.slice(0, 100) ?? null,
      source,
      checkedAt: new Date().toISOString(),
    };
    if (existing) {
      // Keep what a registrar knows when RDAP knows less
      const keep =
        existing.source === "account" && source === "watch"
          ? {
              accountId: existing.accountId,
              source: "account",
              autoRenew: existing.autoRenew,
              registrar: existing.registrar ?? values.registrar,
            }
          : {};
      await (
        await db()
      )
        .update(stores.domains)
        .set({ ...values, ...keep })
        .where(eq(stores.domains.id, existing.id));
    } else {
      await insertId(stores.domains, values);
    }
  }

  async function expiryAlerts(rows: DomainDbRow[]) {
    for (const row of rows) {
      const left = daysLeft(row.expiresAt);
      const key = `expiry:${row.name}`;
      if (left === null || left > EXPIRY_STEPS[0]) {
        await ctx.kv.delete(key);
        continue;
      }
      const last = (await ctx.kv.get(key)) as number | undefined;
      const step = [...EXPIRY_STEPS].reverse().find((s) => left <= s);
      if (step === undefined || (last != null && last <= step)) continue;
      await ctx.kv.set(key, step);
      await alert(
        left < 0
          ? `${row.name} has expired`
          : `${row.name} expires in ${left} days`,
        row.autoRenew
          ? "Auto renew is on."
          : "Auto renew is off. Renew it at the registrar.",
        left <= 7 ? "critical" : "warning",
        `dns-expiry-${row.name}-${step}`,
      );
    }
  }

  /** Reads every registrar login and every watched domain. */
  async function refreshDomains(): Promise<{ count: number; failed: number }> {
    let failed = 0;
    const known = await domainRows();
    const byName = new Map(known.map((row) => [row.name, row]));
    for (const row of await accountRows()) {
      const provider = getProvider(row.provider);
      if (!provider?.domains) continue;
      try {
        const list = await guarded(row, async () =>
          provider.domains!(await credsOf(row), ctx.fetch),
        );
        for (const info of list) {
          await saveDomain(byName.get(info.name), row.id, "account", info);
        }
        // A domain the registrar no longer lists
        const names = new Set(list.map((info) => info.name));
        const gone = known
          .filter((item) => item.accountId === row.id && !names.has(item.name))
          .map((item) => item.id);
        if (gone.length) {
          await (
            await db()
          )
            .delete(stores.domains)
            .where(inArray(stores.domains.id, gone));
        }
      } catch {
        failed += 1;
      }
    }
    const after = await domainRows();
    const afterByName = new Map(after.map((row) => [row.name, row]));
    for (const row of after.filter((item) => item.source === "watch")) {
      try {
        const info = await lookupDomain(ctx.fetch, row.name);
        await saveDomain(afterByName.get(row.name), null, "watch", info);
      } catch (error) {
        failed += 1;
        await (
          await db()
        )
          .update(stores.domains)
          .set({
            status: (error instanceof Error
              ? error.message
              : "Lookup failed"
            ).slice(0, 100),
            checkedAt: new Date().toISOString(),
          })
          .where(eq(stores.domains.id, row.id));
      }
    }
    await ctx.db.persist({ lazy: true });
    const final = await domainRows();
    await expiryAlerts(final);
    return { count: final.length, failed };
  }

  async function watchDomain(value: string): Promise<DomainRow> {
    const name = cleanDomain(value);
    if (!name) throw new DnsError(400, "That is not a domain name");
    const existing = (await domainRows()).find((row) => row.name === name);
    if (existing) throw new DnsError(409, "That domain is already listed");
    let info: DomainInfo;
    try {
      info = await lookupDomain(ctx.fetch, name);
    } catch (error) {
      throw new DnsError(
        502,
        error instanceof Error ? error.message : "The lookup failed",
      );
    }
    await saveDomain(undefined, null, "watch", info);
    await ctx.db.persist();
    const row = (await domainList()).find((item) => item.name === name);
    return row!;
  }

  async function removeDomain(id: number) {
    const row = (await domainRows()).find((item) => item.id === id);
    if (!row) throw new DnsError(404, "Domain not found");
    if (row.source === "account") {
      throw new DnsError(400, "This domain comes from a registrar login");
    }
    await (await db()).delete(stores.domains).where(eq(stores.domains.id, id));
    await ctx.kv.delete(`expiry:${row.name}`);
    await ctx.db.persist();
  }

  // Links

  async function linkRows(): Promise<LinkRow[]> {
    return (await db()).select().from(stores.links);
  }

  async function hostSummary(userId: string, hostId: number) {
    return ctx.asUser(userId, async () => ctx.hosts.get(hostId));
  }

  async function linkList(): Promise<Link[]> {
    const accountNames = new Map(
      (await accountRows()).map((row) => [row.id, row.name]),
    );
    const out: Link[] = [];
    for (const row of await linkRows()) {
      let hostName: string | null = null;
      if (row.hostId) {
        const host = await hostSummary(row.createdBy, row.hostId).catch(
          () => null,
        );
        hostName = host?.name ?? host?.ip ?? null;
      }
      out.push({
        id: row.id,
        accountId: row.accountId,
        accountName: accountNames.get(row.accountId) ?? "",
        zoneId: row.zoneId,
        zoneName: row.zoneName,
        name: row.name,
        type: row.type,
        source: row.source,
        hostId: row.hostId,
        hostName,
        ttl: row.ttl,
        proxied: row.proxied,
        enabled: row.enabled,
        lastValue: row.lastValue,
        lastSyncAt: row.lastSyncAt,
        lastError: row.lastError,
      });
    }
    return out;
  }

  async function saveLink(
    input: LinkInput,
    userId: string,
    linkId?: number,
  ): Promise<void> {
    const { provider, zone } = await context(input.accountId, input.zoneId);
    const type = input.type === "AAAA" ? "AAAA" : "A";
    const source = ["host", "public4", "public6"].includes(input.source)
      ? input.source
      : "host";
    if (source === "public4" && type !== "A") {
      throw new DnsError(400, "The public IPv4 address needs an A record");
    }
    if (source === "public6" && type !== "AAAA") {
      throw new DnsError(400, "The public IPv6 address needs an AAAA record");
    }
    const clean = cleanInput(
      {
        type,
        name: input.name,
        content: type === "A" ? "0.0.0.0" : "::",
        ttl: input.ttl,
      },
      provider.features,
      zone.name,
    );
    if (typeof clean === "string") throw new DnsError(400, clean);
    let hostId: number | null = null;
    if (source === "host") {
      hostId = Number(input.hostId);
      if (!Number.isInteger(hostId) || hostId < 1) {
        throw new DnsError(400, "Pick a host");
      }
      const access = await ctx.hosts.checkAccess(hostId, "view");
      if (!access.hasAccess) throw new DnsError(403, "No access to this host");
    }
    const values = {
      accountId: input.accountId,
      zoneId: input.zoneId,
      zoneName: zone.name,
      name: clean.name,
      type,
      source,
      hostId,
      ttl: clean.ttl,
      proxied: !!input.proxied && provider.features.proxied,
      enabled: input.enabled !== false,
    };
    const dupe = (await linkRows()).find(
      (row) =>
        row.accountId === values.accountId &&
        row.zoneId === values.zoneId &&
        row.name === values.name &&
        row.type === values.type &&
        row.id !== linkId,
    );
    if (dupe) throw new DnsError(409, "That record already has a link");
    let id = linkId;
    if (linkId) {
      await (
        await db()
      )
        .update(stores.links)
        .set(values)
        .where(eq(stores.links.id, linkId));
    } else {
      id = await insertId(stores.links, { ...values, createdBy: userId });
    }
    await ctx.db.persist();
    if (values.enabled && id) {
      const row = (await linkRows()).find((item) => item.id === id);
      if (row) await syncLink(row).catch(() => undefined);
    }
  }

  async function deleteLink(id: number) {
    const row = (await linkRows()).find((item) => item.id === id);
    if (!row) throw new DnsError(404, "Link not found");
    await (await db()).delete(stores.links).where(eq(stores.links.id, id));
    await ctx.kv.delete(`link-failed:${id}`);
    await ctx.db.persist();
  }

  async function publicAddress(type: "A" | "AAAA"): Promise<string> {
    const url =
      type === "A"
        ? "https://api.ipify.org?format=json"
        : "https://api6.ipify.org?format=json";
    const response = await ctx.fetch(url, { timeoutMs: 10_000 });
    if (!response.ok) throw new Error("Could not read the public address");
    const body = (await response.json()) as { ip?: string };
    const ip = String(body.ip ?? "");
    if (type === "A" ? !isIPv4(ip) : !isIPv6(ip)) {
      throw new Error(
        type === "A"
          ? "No public IPv4 address was found"
          : "No public IPv6 address was found",
      );
    }
    return ip;
  }

  async function addressFor(row: LinkRow): Promise<string> {
    if (row.source === "public4") return publicAddress("A");
    if (row.source === "public6") return publicAddress("AAAA");
    const host = row.hostId
      ? await hostSummary(row.createdBy, row.hostId)
      : null;
    if (!host) throw new Error("The host is gone or no longer shared");
    const wantV6 = row.type === "AAAA";
    if (wantV6 ? isIPv6(host.ip) : isIPv4(host.ip)) return host.ip;
    if (isIPv4(host.ip) || isIPv6(host.ip)) {
      throw new Error(`The host address is ${wantV6 ? "IPv4" : "IPv6"}`);
    }
    const found = await osLookup(host.ip, { family: wantV6 ? 6 : 4 }).catch(
      () => null,
    );
    if (!found) throw new Error(`Could not resolve ${host.ip}`);
    return found.address;
  }

  /** Points the record at the address, changing nothing when it already is. */
  async function syncLink(row: LinkRow): Promise<{ changed: boolean }> {
    const key = `link-failed:${row.id}`;
    try {
      const content = await addressFor(row);
      const {
        row: account,
        provider,
        zone,
        creds,
      } = await context(row.accountId, row.zoneId);
      const input: RecordInput = {
        type: row.type,
        name: row.name,
        content,
        ttl: row.ttl,
        ...(provider.features.proxied ? { proxied: row.proxied } : {}),
      };
      const current = await recordsOf(row.accountId, row.zoneId, true);
      const same = current.filter(
        (record) => record.type === row.type && record.name === row.name,
      );
      let changed = false;
      if (
        same.length === 1 &&
        same[0].content === content &&
        same[0].ttl === row.ttl
      ) {
        changed = false;
      } else {
        await guarded(account, async () => {
          await backupBefore(row.accountId, row.zoneId, "Before a link update");
          if (same.length === 0) {
            await provider.create(creds, zone, input, ctx.fetch);
          } else {
            await provider.update(creds, zone, same[0], input, ctx.fetch);
            for (const extra of same.slice(1)) {
              await provider.remove(creds, zone, extra, ctx.fetch);
            }
          }
          recordCache.delete(`${row.accountId}|${row.zoneId}`);
          await rememberHash(row.accountId, row.zoneId);
        });
        changed = true;
      }
      await (
        await db()
      )
        .update(stores.links)
        .set({
          lastValue: content,
          lastSyncAt: new Date().toISOString(),
          lastError: null,
        })
        .where(eq(stores.links.id, row.id));
      await ctx.db.persist({ lazy: true });
      if (await ctx.kv.get(key)) {
        await ctx.kv.delete(key);
        await alert(
          `${row.name}.${row.zoneName} is updating again`,
          `The link now points at ${content}.`,
          "info",
          `dns-link-ok-${row.id}-${Date.now()}`,
        );
      }
      return { changed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await (
        await db()
      )
        .update(stores.links)
        .set({
          lastSyncAt: new Date().toISOString(),
          lastError: message.slice(0, 500),
        })
        .where(eq(stores.links.id, row.id));
      await ctx.db.persist({ lazy: true });
      if (!(await ctx.kv.get(key))) {
        await ctx.kv.set(key, true);
        await alert(
          `${row.name}.${row.zoneName} could not be updated`,
          message,
          "critical",
          `dns-link-${row.id}`,
        );
      }
      throw error;
    }
  }

  async function syncLinkById(id: number) {
    const row = (await linkRows()).find((item) => item.id === id);
    if (!row) throw new DnsError(404, "Link not found");
    try {
      return await syncLink(row);
    } catch (error) {
      throw new DnsError(
        502,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async function runLinks(mode: "due" | "all" | "hosts" = "due") {
    const due = (await linkRows()).filter((row) => {
      if (!row.enabled) return false;
      if (mode === "hosts") return row.source === "host";
      if (mode === "all") return true;
      const last = row.lastSyncAt ? new Date(row.lastSyncAt).getTime() : 0;
      return Date.now() - last >= LINK_EVERY_MS;
    });
    await pool(due, 3, (row) => syncLink(row).catch(() => undefined));
  }

  async function removeHostLinks(hostId: number) {
    await (
      await db()
    )
      .delete(stores.links)
      .where(eq(stores.links.hostId, hostId));
    await ctx.db.persist({ lazy: true });
  }

  // Daily work: domain expiry, backups, drift and health

  async function runDaily(force = false) {
    const last = Number((await ctx.kv.get("daily:last")) ?? 0);
    if (!force && Date.now() - last < DAILY_MS) return;
    await ctx.kv.set("daily:last", Date.now());
    await refreshDomains().catch(() => undefined);
    for (const row of await accountRows()) {
      let zoneList: Zone[];
      try {
        zoneList = await zonesOf(row, true);
      } catch {
        continue;
      }
      for (const zone of zoneList) {
        try {
          const records = await recordsOf(row.id, zone.id, true);
          const hash = hashRecords(records);
          const expected = (await ctx.kv.get(hashKey(row.id, zone.id))) as
            string | undefined;
          if (row.autoBackup && expected !== hash) {
            await takeSnapshot(
              row.id,
              zone.id,
              expected ? "Changed outside Termix" : "First copy",
              "auto",
            );
            if (expected) {
              await alert(
                `${zone.name} changed outside Termix`,
                `A copy of the new records was saved. Open DNS to see what changed.`,
                "warning",
                `dns-drift-${row.id}-${zone.id}-${hash.slice(0, 8)}`,
              );
            }
          }
          await ctx.kv.set(hashKey(row.id, zone.id), hash);
          if (row.checkHealth) await healthAlert(row.id, zone);
        } catch (error) {
          ctx.log.warn(
            `Daily check of ${zone.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }
  }

  async function healthAlert(accountId: number, zone: Zone) {
    const before = await lastHealth(accountId, zone.id);
    const report = await health(accountId, zone.id);
    const failing = (r: HealthReport | null) =>
      new Set(
        (r?.checks ?? []).filter((c) => c.level === "fail").map((c) => c.code),
      );
    const old = failing(before);
    const fresh = [...failing(report)].filter((code) => !old.has(code));
    if (before && fresh.length) {
      await alert(
        `${zone.name} has a new DNS problem`,
        `Failing checks: ${fresh.join(", ")}`,
        "critical",
        `dns-health-${accountId}-${zone.id}-${fresh.join("-")}`,
      );
    }
  }

  // Summary for the dashboard card and signals

  async function summary() {
    const domainsNow = await domainList();
    const linksNow = await linkRows();
    const accountsNow = await accountRows();
    const expiring = domainsNow.filter(
      (row) => row.daysLeft !== null && row.daysLeft <= 30,
    );
    return {
      accounts: accountsNow.length,
      failingAccounts: accountsNow.filter((row) => row.status === "error")
        .length,
      domains: domainsNow.length,
      expiring: expiring.map((row) => ({
        name: row.name,
        daysLeft: row.daysLeft as number,
      })),
      links: linksNow.length,
      failingLinks: linksNow.filter((row) => row.lastError).length,
    };
  }

  // Used by other plugins through the dns.records service

  async function zoneFor(fqdn: string) {
    const name = fqdn.toLowerCase().replace(/\.$/, "");
    const all = (await zones()).zones;
    return (
      all
        .filter((zone) => name === zone.name || name.endsWith(`.${zone.name}`))
        .sort((a, b) => b.name.length - a.name.length)[0] ?? null
    );
  }

  return {
    accounts: async () => (await accountRows()).map(publicAccount),
    account: async (id: number) => publicAccount(await accountRow(id)),
    createAccount,
    updateAccount,
    deleteAccount,
    testAccount,
    zones,
    records: recordsOf,
    saveRecord,
    deleteRecord,
    snapshots,
    takeSnapshot,
    deleteSnapshot,
    restore,
    diffSnapshot,
    exportZone,
    importZone,
    health,
    lastHealth,
    propagation,
    domains: domainList,
    refreshDomains,
    watchDomain,
    removeDomain,
    links: linkList,
    saveLink,
    deleteLink,
    syncLinkById,
    runLinks,
    removeHostLinks,
    runDaily,
    summary,
    zoneFor,
    flush: () => {
      zoneCache.clear();
      recordCache.clear();
    },
  };
}
