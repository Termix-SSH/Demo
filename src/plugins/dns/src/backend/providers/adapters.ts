import { createHash } from "node:crypto";
import type { DnsRecord, RecordInput, Zone } from "../../shared/types.js";
import {
  ProviderError,
  type Credentials,
  type DnsProvider,
  type PluginFetch,
} from "./types.js";
import type { WireValue } from "./wire.js";

export interface Rrset {
  name: string;
  type: string;
  ttl: number;
  values: WireValue[];
  readOnly?: boolean;
}

const valueKey = (value: WireValue) =>
  `${value.priority ?? ""}|${value.content}`;

export function recordId(type: string, name: string, value: WireValue): string {
  const hash = createHash("sha1").update(valueKey(value)).digest("hex");
  return `${type}|${name}|${hash.slice(0, 12)}`;
}

/** Flattens sets into one record per value. */
export function flatten(sets: Rrset[]): DnsRecord[] {
  const records: DnsRecord[] = [];
  for (const set of sets) {
    for (const value of set.values) {
      records.push({
        id: recordId(set.type, set.name, value),
        type: set.type,
        name: set.name,
        content: value.content,
        ttl: set.ttl,
        priority: value.priority ?? null,
        ...(set.readOnly ? { readOnly: true } : {}),
      });
    }
  }
  return records;
}

export interface RrsetApi {
  list: (
    creds: Credentials,
    zone: Zone,
    fetch: PluginFetch,
  ) => Promise<Rrset[]>;
  /** Writes the whole set. */
  put: (
    creds: Credentials,
    zone: Zone,
    set: Rrset,
    fetch: PluginFetch,
  ) => Promise<void>;
  del: (
    creds: Credentials,
    zone: Zone,
    set: { name: string; type: string },
    fetch: PluginFetch,
  ) => Promise<void>;
}

function guard(set: Rrset | undefined) {
  if (set?.readOnly) {
    throw new ProviderError(
      "The provider manages this record, it cannot be changed here",
    );
  }
}

const idOf = (record: DnsRecord) =>
  recordId(record.type, record.name, {
    content: record.content,
    priority: record.priority ?? null,
  });

/**
 * Providers that only change whole sets (all the A records of one name)
 * get single record create, update and remove from here.
 */
export function rrsetOps(
  api: RrsetApi,
): Pick<DnsProvider, "records" | "create" | "update" | "remove"> {
  const find = (sets: Rrset[], name: string, type: string) =>
    sets.find((set) => set.name === name && set.type === type);

  async function add(
    creds: Credentials,
    zone: Zone,
    sets: Rrset[],
    input: RecordInput,
    fetch: PluginFetch,
  ) {
    const value: WireValue = {
      content: input.content,
      priority: input.priority ?? null,
    };
    const existing = find(sets, input.name, input.type);
    guard(existing);
    const values =
      existing && input.type !== "CNAME"
        ? [
            ...existing.values.filter((v) => valueKey(v) !== valueKey(value)),
            value,
          ]
        : [value];
    await api.put(
      creds,
      zone,
      { name: input.name, type: input.type, ttl: input.ttl, values },
      fetch,
    );
  }

  async function take(
    creds: Credentials,
    zone: Zone,
    sets: Rrset[],
    record: DnsRecord,
    fetch: PluginFetch,
  ) {
    const set = find(sets, record.name, record.type);
    if (!set) return;
    guard(set);
    const gone = idOf(record);
    const left = set.values.filter(
      (v) => recordId(set.type, set.name, v) !== gone,
    );
    if (left.length === set.values.length) return;
    if (left.length === 0) {
      await api.del(creds, zone, { name: set.name, type: set.type }, fetch);
    } else {
      await api.put(creds, zone, { ...set, values: left }, fetch);
    }
  }

  return {
    async records(creds, zone, fetch) {
      return flatten(await api.list(creds, zone, fetch));
    },
    async create(creds, zone, input, fetch) {
      await add(creds, zone, await api.list(creds, zone, fetch), input, fetch);
    },
    async update(creds, zone, record, input, fetch) {
      const sets = await api.list(creds, zone, fetch);
      if (record.name === input.name && record.type === input.type) {
        const set = find(sets, record.name, record.type);
        guard(set);
        const old = idOf(record);
        const value: WireValue = {
          content: input.content,
          priority: input.priority ?? null,
        };
        const values = (set?.values ?? []).map((v) =>
          recordId(record.type, record.name, v) === old ? value : v,
        );
        if (!values.some((v) => valueKey(v) === valueKey(value))) {
          values.push(value);
        }
        await api.put(
          creds,
          zone,
          { name: input.name, type: input.type, ttl: input.ttl, values },
          fetch,
        );
        return;
      }
      await take(creds, zone, sets, record, fetch);
      await add(creds, zone, await api.list(creds, zone, fetch), input, fetch);
    },
    async remove(creds, zone, record, fetch) {
      await take(
        creds,
        zone,
        await api.list(creds, zone, fetch),
        record,
        fetch,
      );
    },
  };
}

/** Groups rows (one per value) into sets. */
export function groupSets(
  rows: Array<{
    name: string;
    type: string;
    ttl: number;
    value: WireValue;
    readOnly?: boolean;
  }>,
): Rrset[] {
  const sets = new Map<string, Rrset>();
  for (const row of rows) {
    const key = `${row.type}|${row.name}`;
    const set = sets.get(key);
    if (set) set.values.push(row.value);
    else {
      sets.set(key, {
        name: row.name,
        type: row.type,
        ttl: row.ttl,
        values: [row.value],
        ...(row.readOnly ? { readOnly: true } : {}),
      });
    }
  }
  return [...sets.values()];
}
