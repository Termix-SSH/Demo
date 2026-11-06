import { eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  ClientInfo,
  Device,
  DeviceInfo,
  DeviceInput,
  DeviceOptions,
  DeviceStatus,
  DiscoveryResult,
  DriverId,
  NeighborInfo,
  PortInfo,
  Snapshot,
  TrafficPoint,
} from "../shared/types.js";
import {
  getDriver,
  type Credentials,
  type Driver,
  type DriverIo,
  type Target,
} from "./drivers/index.js";
import { createSnmpClient } from "./drivers/snmp-client.js";

const TRAFFIC_POINTS = 120;
const PERSIST_EVERY_MS = 5 * 60_000;
const DOWN_AFTER_FAILURES = 2;
const POLL_CONCURRENCY = 4;
const MIN_POLL = 15;
const MAX_POLL = 3600;
const MAX_SCAN = 256;
const SCAN_CONCURRENCY = 48;

export interface DeviceRow {
  id: number;
  createdBy: string;
  name: string;
  driver: string;
  address: string;
  port: number | null;
  credentials: string;
  ca: string | null;
  options: string;
  pollSeconds: number;
  status: string;
  lastError: string | null;
  lastSeenAt: string | null;
  snapshot: string | null;
}

export class ServiceError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

interface Runtime {
  status: DeviceStatus;
  lastError: string | null;
  lastSeenAt: string | null;
  snapshot: Snapshot | null;
  traffic: TrafficPoint[];
  counters: Map<string, { rx: number; tx: number }>;
  countersAt: number;
  failures: number;
  lastPolled: number;
  lastPersisted: number;
  watched: Map<string, boolean>;
  polling: Promise<void> | null;
}

export interface Service {
  list: () => Promise<Device[]>;
  get: (id: number) => Promise<Device>;
  create: (input: DeviceInput, userId: string) => Promise<Device>;
  update: (id: number, input: DeviceInput) => Promise<Device>;
  remove: (id: number) => Promise<void>;
  test: (input: DeviceInput) => Promise<DeviceInfo>;
  poll: (id: number) => Promise<Device>;
  runDue: () => Promise<void>;
  clients: (id: number) => Promise<ClientInfo[]>;
  neighbors: (id: number) => Promise<NeighborInfo[]>;
  setPort: (id: number, portId: string, up: boolean) => Promise<void>;
  poeCycle: (id: number, portId: string) => Promise<void>;
  reboot: (id: number) => Promise<void>;
  discover: (
    cidr: string,
    community: string,
    version: "1" | "2c",
  ) => Promise<DiscoveryResult[]>;
  hydrate: () => Promise<void>;
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function expandCidr(cidr: string): string[] {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})\/(\d{1,2})$/.exec(
    cidr.trim(),
  );
  if (!match) throw new ServiceError("Use a range like 192.168.1.0/24");
  const parts = match.slice(1, 5).map(Number);
  const bits = Number(match[5]);
  if (parts.some((part) => part > 255) || bits < 16 || bits > 32) {
    throw new ServiceError("Use a range like 192.168.1.0/24");
  }
  const base =
    ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
  const size = 2 ** (32 - bits);
  if (size > MAX_SCAN) {
    throw new ServiceError(`Scan at most ${MAX_SCAN} addresses at a time`);
  }
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  const network = (base & mask) >>> 0;
  const out: string[] = [];
  for (let offset = 0; offset < size; offset += 1) {
    // Skip the network and broadcast addresses of a real subnet
    if (size > 2 && (offset === 0 || offset === size - 1)) continue;
    const value = (network + offset) >>> 0;
    out.push(
      [
        value >>> 24,
        (value >>> 16) & 255,
        (value >>> 8) & 255,
        value & 255,
      ].join("."),
    );
  }
  return out;
}

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  work: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      out[index] = await work(items[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, lane),
  );
  return out;
}

export function createService(
  ctx: PluginContext,
  store: any,
  overrides: Partial<DriverIo> = {},
): Service {
  const db = () => ctx.db.client<any>();
  const io: DriverIo = { fetch: ctx.fetch, ...overrides };
  const runtime = new Map<number, Runtime>();

  async function rows(): Promise<DeviceRow[]> {
    return (await (await db()).select().from(store)) as DeviceRow[];
  }

  async function row(id: number): Promise<DeviceRow> {
    const [found] = Number.isInteger(id)
      ? await (await db()).select().from(store).where(eq(store.id, id))
      : [];
    if (!found) throw new ServiceError("Device not found", 404);
    return found as DeviceRow;
  }

  function stateOf(item: DeviceRow): Runtime {
    let state = runtime.get(item.id);
    if (!state) {
      state = {
        status: (item.status as DeviceStatus) ?? "unknown",
        lastError: item.lastError,
        lastSeenAt: item.lastSeenAt,
        snapshot: parseJson<Snapshot | null>(item.snapshot, null),
        traffic: [],
        counters: new Map(),
        countersAt: 0,
        failures: 0,
        lastPolled: 0,
        lastPersisted: Date.now(),
        watched: new Map(),
        polling: null,
      };
      runtime.set(item.id, state);
    }
    return state;
  }

  function driverOf(item: DeviceRow): Driver {
    const driver = getDriver(item.driver);
    if (!driver) throw new ServiceError("Unknown device type", 400);
    return driver;
  }

  async function targetOf(item: DeviceRow): Promise<Target> {
    const driver = driverOf(item);
    const options = parseJson<DeviceOptions>(item.options, {});
    let credentials: Credentials = {};
    try {
      credentials = JSON.parse(await ctx.secrets.unseal(item.credentials));
    } catch {
      throw new ServiceError("The saved keys could not be read", 500);
    }
    return {
      address: item.address,
      port: item.port ?? driver.info.defaultPort,
      options,
      credentials,
      ca: item.ca ?? undefined,
    };
  }

  function toDevice(item: DeviceRow): Device {
    const state = stateOf(item);
    return {
      id: item.id,
      name: item.name,
      driver: item.driver as DriverId,
      address: item.address,
      port: item.port,
      options: parseJson<DeviceOptions>(item.options, {}),
      hasCa: !!item.ca,
      pollSeconds: item.pollSeconds,
      status: state.status,
      lastError: state.lastError,
      lastSeenAt: state.lastSeenAt,
      snapshot: state.snapshot,
      traffic: state.traffic,
    };
  }

  function clean(
    input: DeviceInput,
    fallback?: DeviceRow,
  ): {
    name: string;
    driver: DriverId;
    address: string;
    port: number | null;
    options: DeviceOptions;
    pollSeconds: number;
    ca: string | null;
  } {
    const name = (input.name ?? fallback?.name ?? "").trim().slice(0, 100);
    if (!name) throw new ServiceError("A name is required");
    const driverId = (fallback?.driver ?? input.driver ?? "") as string;
    if (!getDriver(driverId)) throw new ServiceError("Pick a device type");
    const address = (input.address ?? fallback?.address ?? "").trim();
    if (!/^[A-Za-z0-9.\-:_]{1,253}$/.test(address)) {
      throw new ServiceError("Enter a host name or IP address");
    }
    const port =
      input.port === undefined
        ? (fallback?.port ?? null)
        : input.port === null
          ? null
          : Number(input.port);
    if (
      port !== null &&
      !(Number.isInteger(port) && port > 0 && port < 65536)
    ) {
      throw new ServiceError("Enter a port from 1 to 65535");
    }
    const given =
      input.options ?? parseJson<DeviceOptions>(fallback?.options ?? null, {});
    const options: DeviceOptions = {};
    if (given.scheme === "http" || given.scheme === "https") {
      options.scheme = given.scheme;
    }
    if (["1", "2c", "3"].includes(given.snmpVersion ?? "")) {
      options.snmpVersion = given.snmpVersion;
    }
    if (Array.isArray(given.watchedPorts)) {
      options.watchedPorts = given.watchedPorts
        .filter((id) => typeof id === "string" && id.length <= 64)
        .slice(0, 256);
    }
    if (driverId === "snmp" && !options.snmpVersion) options.snmpVersion = "2c";
    const poll = Number(input.pollSeconds ?? fallback?.pollSeconds ?? 60);
    const pollSeconds = Number.isFinite(poll)
      ? Math.min(MAX_POLL, Math.max(MIN_POLL, Math.floor(poll)))
      : 60;
    const ca =
      input.ca === undefined ? (fallback?.ca ?? null) : input.ca.trim() || null;
    if (ca && (ca.length > 65536 || !ca.includes("BEGIN CERTIFICATE"))) {
      throw new ServiceError("The CA must be a PEM certificate");
    }
    return {
      name,
      driver: driverId as DriverId,
      address,
      port,
      options,
      pollSeconds,
      ca,
    };
  }

  function cleanCredentials(
    driver: Driver,
    input: Record<string, string> | undefined,
  ): Credentials {
    const out: Credentials = {};
    for (const field of driver.info.fields) {
      const value = input?.[field.key];
      if (typeof value === "string" && value.trim()) {
        out[field.key] = value.trim().slice(0, 4096);
      }
    }
    return out;
  }

  function checkCredentials(
    driver: Driver,
    credentials: Credentials,
    options: DeviceOptions,
  ) {
    for (const field of driver.info.fields) {
      if (field.required && !credentials[field.key]) {
        throw new ServiceError(`${field.key} is required`);
      }
    }
    const problem = driver.validate?.(credentials, options);
    if (problem) throw new ServiceError(problem);
  }

  async function persistState(item: DeviceRow, state: Runtime): Promise<void> {
    state.lastPersisted = Date.now();
    await (
      await db()
    )
      .update(store)
      .set({
        status: state.status,
        lastError: state.lastError,
        lastSeenAt: state.lastSeenAt,
        snapshot: state.snapshot ? JSON.stringify(state.snapshot) : null,
      })
      .where(eq(store.id, item.id));
    await ctx.db.persist({ lazy: true });
  }

  function alert(
    item: DeviceRow,
    kind: string,
    title: string,
    body: string,
    severity: "info" | "warning",
  ) {
    void ctx.notify
      .send({
        title,
        body,
        severity,
        category: `network-devices.${kind}`,
        audience: { userId: item.createdBy },
        dedupeKey: `network-devices:${item.id}:${kind}`,
        link: { tab: "network-devices" },
      } as never)
      .catch(() => {});
  }

  function applyRates(state: Runtime, ports: PortInfo[], now: number) {
    const seconds = (now - state.countersAt) / 1000;
    let rx = 0;
    let tx = 0;
    let counted = false;
    const next = new Map<string, { rx: number; tx: number }>();
    for (const port of ports) {
      if (port.rxBytes === undefined || port.txBytes === undefined) continue;
      next.set(port.id, { rx: port.rxBytes, tx: port.txBytes });
      const before = state.counters.get(port.id);
      if (!before || seconds <= 0) continue;
      const dr = port.rxBytes - before.rx;
      const dt = port.txBytes - before.tx;
      // A counter that went backwards was reset or wrapped
      if (dr < 0 || dt < 0) continue;
      port.rxBps = Math.round((dr * 8) / seconds);
      port.txBps = Math.round((dt * 8) / seconds);
      rx += port.rxBps;
      tx += port.txBps;
      counted = true;
    }
    state.counters = next;
    state.countersAt = now;
    if (counted) {
      state.traffic.push({ at: now, rxBps: rx, txBps: tx });
      if (state.traffic.length > TRAFFIC_POINTS) {
        state.traffic.splice(0, state.traffic.length - TRAFFIC_POINTS);
      }
    }
  }

  function watchPorts(item: DeviceRow, state: Runtime, ports: PortInfo[]) {
    const options = parseJson<DeviceOptions>(item.options, {});
    const watched = new Set(options.watchedPorts ?? []);
    for (const port of ports) {
      if (!watched.has(port.id)) continue;
      const before = state.watched.get(port.id);
      state.watched.set(port.id, port.up);
      if (before === undefined || before === port.up) continue;
      alert(
        item,
        `port-${port.id}`,
        `${item.name}: ${port.name} is ${port.up ? "up" : "down"}`,
        port.description ?? "",
        port.up ? "info" : "warning",
      );
    }
  }

  async function pollOnce(item: DeviceRow, state: Runtime): Promise<void> {
    const driver = driverOf(item);
    const target = await targetOf(item);
    const was = state.status;
    const now = Date.now();
    try {
      const info = await driver.probe(target, io);
      const ports = await driver.ports(target, io);
      applyRates(state, ports, now);
      state.snapshot = { at: new Date(now).toISOString(), info, ports };
      state.status = "up";
      state.lastError = null;
      state.lastSeenAt = state.snapshot.at;
      state.failures = 0;
      watchPorts(item, state, ports);
      if (was === "down") {
        alert(
          item,
          "down",
          `${item.name} is back`,
          `${item.name} answers again.`,
          "info",
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      state.failures += 1;
      state.lastError = message;
      if (state.failures >= DOWN_AFTER_FAILURES && state.status !== "down") {
        state.status = "down";
        alert(item, "down", `${item.name} is down`, message, "warning");
      }
    }
    state.lastPolled = now;
    if (state.status !== was || now - state.lastPersisted >= PERSIST_EVERY_MS) {
      await persistState(item, state);
    }
  }

  async function poll(id: number): Promise<Device> {
    const item = await row(id);
    const state = stateOf(item);
    if (!state.polling) {
      state.polling = pollOnce(item, state).finally(() => {
        state.polling = null;
      });
    }
    await state.polling;
    return toDevice(item);
  }

  async function reading<T>(
    id: number,
    work: (driver: Driver, target: Target, item: DeviceRow) => Promise<T>,
  ): Promise<T> {
    const item = await row(id);
    return work(driverOf(item), await targetOf(item), item);
  }

  async function control(
    id: number,
    feature: "portControl" | "poe" | "reboot",
    work: (driver: Driver, target: Target) => Promise<void>,
  ) {
    const item = await row(id);
    const driver = driverOf(item);
    if (!driver.info.features[feature]) {
      throw new ServiceError("This device type cannot do that", 400);
    }
    await work(driver, await targetOf(item));
  }

  return {
    async hydrate() {
      for (const item of await rows()) stateOf(item);
    },

    async list() {
      return (await rows()).map(toDevice);
    },

    async get(id) {
      return toDevice(await row(id));
    },

    async create(input, userId) {
      const fields = clean(input);
      const driver = getDriver(fields.driver)!;
      const credentials = cleanCredentials(driver, input.credentials);
      checkCredentials(driver, credentials, fields.options);
      try {
        await (await db()).insert(store).values({
          createdBy: userId,
          name: fields.name,
          driver: fields.driver,
          address: fields.address,
          port: fields.port,
          credentials: await ctx.secrets.seal(JSON.stringify(credentials)),
          ca: fields.ca,
          options: JSON.stringify(fields.options),
          pollSeconds: fields.pollSeconds,
          status: "unknown",
        });
      } catch {
        throw new ServiceError("A device with this name already exists", 409);
      }
      await ctx.db.persist();
      const [created] = await (
        await db()
      )
        .select()
        .from(store)
        .where(eq(store.name, fields.name));
      void poll((created as DeviceRow).id).catch(() => {});
      return toDevice(created as DeviceRow);
    },

    async update(id, input) {
      const existing = await row(id);
      const fields = clean(input, existing);
      const driver = driverOf(existing);
      const changes: Record<string, unknown> = {
        name: fields.name,
        address: fields.address,
        port: fields.port,
        ca: fields.ca,
        options: JSON.stringify(fields.options),
        pollSeconds: fields.pollSeconds,
      };
      const given = cleanCredentials(driver, input.credentials);
      if (Object.keys(given).length > 0) {
        // Replacing keys replaces them all
        checkCredentials(driver, given, fields.options);
        changes.credentials = await ctx.secrets.seal(JSON.stringify(given));
      }
      try {
        await (await db()).update(store).set(changes).where(eq(store.id, id));
      } catch {
        throw new ServiceError("A device with this name already exists", 409);
      }
      await ctx.db.persist();
      const state = stateOf(existing);
      state.failures = 0;
      state.counters = new Map();
      state.watched = new Map();
      void poll(id).catch(() => {});
      return toDevice(await row(id));
    },

    async remove(id) {
      await row(id);
      await (await db()).delete(store).where(eq(store.id, id));
      await ctx.db.persist();
      runtime.delete(id);
    },

    async test(input) {
      const fields = clean(input);
      const driver = getDriver(fields.driver)!;
      const credentials = cleanCredentials(driver, input.credentials);
      checkCredentials(driver, credentials, fields.options);
      return driver.probe(
        {
          address: fields.address,
          port: fields.port ?? driver.info.defaultPort,
          options: fields.options,
          credentials,
          ca: fields.ca ?? undefined,
        },
        io,
      );
    },

    poll,

    async runDue() {
      const now = Date.now();
      const due = (await rows()).filter((item) => {
        const state = stateOf(item);
        return (
          !state.polling && now - state.lastPolled >= item.pollSeconds * 1000
        );
      });
      await mapLimit(due, POLL_CONCURRENCY, async (item) => {
        const state = stateOf(item);
        state.polling = pollOnce(item, state)
          .catch((error) => {
            ctx.log.warn(`Poll of ${item.name} failed: ${String(error)}`);
          })
          .finally(() => {
            state.polling = null;
          });
        await state.polling;
      });
    },

    clients: (id) =>
      reading(id, (driver, target) => {
        if (!driver.info.features.clients) return Promise.resolve([]);
        return driver.clients(target, io);
      }),

    neighbors: (id) =>
      reading(id, (driver, target) => {
        if (!driver.info.features.neighbors) return Promise.resolve([]);
        return driver.neighbors(target, io);
      }),

    async setPort(id, portId, up) {
      await control(id, "portControl", (driver, target) =>
        driver.setPort!(target, io, portId, up),
      );
      await poll(id);
    },

    async poeCycle(id, portId) {
      await control(id, "poe", (driver, target) =>
        driver.poeCycle!(target, io, portId),
      );
      await poll(id);
    },

    async reboot(id) {
      await control(id, "reboot", (driver, target) =>
        driver.reboot!(target, io),
      );
      // It will go quiet for a while. Do not call that an outage straight away.
      const state = stateOf(await row(id));
      state.lastPolled = Date.now() + 60_000;
    },

    async discover(cidr, community, version) {
      const addresses = expandCidr(cidr);
      if (!community.trim()) throw new ServiceError("A community is required");
      const known = new Set((await rows()).map((item) => item.address));
      const found = await mapLimit(
        addresses,
        SCAN_CONCURRENCY,
        async (address): Promise<DiscoveryResult | null> => {
          const target: Target = {
            address,
            port: 161,
            options: { snmpVersion: version },
            credentials: { community: community.trim() },
            timeoutMs: 1500,
          };
          try {
            const client = (io.snmp ?? createSnmpClient)(target);
            try {
              const [name, description] = await client.get([
                "1.3.6.1.2.1.1.5.0",
                "1.3.6.1.2.1.1.1.0",
              ]);
              if (!name && !description) return null;
              const text = (value: typeof name) =>
                value
                  ? Buffer.isBuffer(value.value)
                    ? value.value.toString("utf8").replace(/\0+$/g, "").trim()
                    : String(value.value)
                  : "";
              const about = text(description);
              return {
                address,
                driver: /routeros/i.test(about) ? "routeros" : "snmp",
                name: text(name) || address,
                description: about.slice(0, 200) || undefined,
                added: known.has(address),
              };
            } finally {
              client.close();
            }
          } catch {
            return null;
          }
        },
      );
      return found.filter((item): item is DiscoveryResult => item !== null);
    },
  };
}
