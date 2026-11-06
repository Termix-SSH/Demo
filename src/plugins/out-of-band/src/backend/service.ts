import { eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type {
  BootTarget,
  Device,
  DeviceInput,
  DeviceOptions,
  DeviceStatus,
  Health,
  LogEntry,
  MediaSlot,
  PowerAction,
  Reading,
} from "../shared/types.js";
import {
  getDriver,
  type Credentials,
  type Driver,
  type DriverIo,
  type Target,
} from "./drivers/index.js";
import { createIpmitool } from "./ipmitool.js";

const PERSIST_EVERY_MS = 5 * 60_000;
const DOWN_AFTER_FAILURES = 2;
const POLL_CONCURRENCY = 4;
const MIN_POLL = 30;
const MIN_POLL_RELAY = 60;
const MAX_POLL = 3600;
// Power changes made here are not reported as surprises for this long
const EXPECT_MS = 3 * 60_000;
const RECHECK_MS = 8_000;
const MEDIA_URL = /^(https?|nfs|smb|cifs|ftp):\/\/[^\s]+$/i;
const BOOT_TARGETS: BootTarget[] = ["none", "pxe", "disk", "cd", "usb", "bios"];

export interface DeviceRow {
  id: number;
  createdBy: string;
  hostId: number | null;
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
  reading: Reading | null;
  failures: number;
  lastPolled: number;
  lastPersisted: number;
  expectUntil: number;
  polling: Promise<void> | null;
}

export interface Service {
  list: () => Promise<Device[]>;
  get: (id: number) => Promise<Device>;
  byHost: (hostId: number) => Promise<Device | null>;
  /** A host was deleted: keep its BMC, drop the link. */
  unlinkHost: (hostId: number) => Promise<void>;
  create: (input: DeviceInput, userId: string) => Promise<Device>;
  update: (id: number, input: DeviceInput) => Promise<Device>;
  remove: (id: number) => Promise<void>;
  test: (input: DeviceInput) => Promise<Reading>;
  poll: (id: number) => Promise<Device>;
  runDue: () => Promise<void>;
  power: (id: number, action: PowerAction) => Promise<void>;
  eventLog: (id: number) => Promise<LogEntry[]>;
  clearLog: (id: number) => Promise<void>;
  bootOnce: (id: number, device: BootTarget, uefi: boolean) => Promise<void>;
  mediaList: (id: number) => Promise<MediaSlot[]>;
  mediaMount: (id: number, slotId: string, url: string) => Promise<void>;
  mediaEject: (id: number, slotId: string) => Promise<void>;
  /** The target for a serial console. */
  consoleTarget: (id: number) => Promise<Target>;
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

export function createService(
  ctx: PluginContext,
  store: any,
  overrides: Partial<DriverIo> = {},
): Service {
  const db = () => ctx.db.client<any>();
  const io: DriverIo = {
    fetch: ctx.fetch,
    ipmitool: createIpmitool(ctx),
    ...overrides,
  };
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
        reading: parseJson<Reading | null>(item.snapshot, null),
        failures: 0,
        lastPolled: 0,
        lastPersisted: Date.now(),
        expectUntil: 0,
        polling: null,
      };
      runtime.set(item.id, state);
    }
    return state;
  }

  function driverOf(item: { driver: string }): Driver {
    const driver = getDriver(item.driver);
    if (!driver) throw new ServiceError("Unknown device type", 400);
    return driver;
  }

  async function targetOf(item: DeviceRow): Promise<Target> {
    const driver = driverOf(item);
    let credentials: Credentials = {};
    try {
      credentials = JSON.parse(await ctx.secrets.unseal(item.credentials));
    } catch {
      throw new ServiceError("The saved login can no longer be read", 500);
    }
    return {
      address: item.address,
      port: item.port ?? driver.info.defaultPort,
      options: parseJson<DeviceOptions>(item.options, {}),
      credentials,
      ca: item.ca ?? undefined,
      actor: item.createdBy,
    };
  }

  function toDevice(item: DeviceRow): Device {
    const state = stateOf(item);
    return {
      id: item.id,
      hostId: item.hostId ?? null,
      name: item.name,
      driver: item.driver as Device["driver"],
      address: item.address,
      port: item.port ?? null,
      options: parseJson<DeviceOptions>(item.options, {}),
      hasCa: !!item.ca,
      pollSeconds: item.pollSeconds,
      status: state.status,
      lastError: state.lastError,
      lastSeenAt: state.lastSeenAt,
      reading: state.reading,
    };
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
        snapshot: state.reading ? JSON.stringify(state.reading) : null,
      })
      .where(eq(store.id, item.id));
    await ctx.db.persist({ lazy: true });
  }

  function alert(
    item: DeviceRow,
    kind: string,
    title: string,
    body: string,
    severity: "info" | "warning" | "critical",
  ) {
    void ctx.notify
      .send({
        title,
        body,
        severity,
        category: `out-of-band.${kind}`,
        audience: { userId: item.createdBy },
        dedupeKey: `out-of-band:${item.id}:${kind}`,
        link: { tab: "out-of-band" },
      } as never)
      .catch(() => {});
  }

  function judge(
    item: DeviceRow,
    state: Runtime,
    before: Reading | null,
    now: Reading,
  ) {
    if (before && before.power !== "unknown" && now.power !== before.power) {
      if (Date.now() > state.expectUntil) {
        alert(
          item,
          "power",
          `${item.name} is now ${now.power}`,
          `The power state changed from ${before.power} to ${now.power} without a change from Termix.`,
          now.power === "off" ? "warning" : "info",
        );
      }
    }
    const was: Health = before?.health ?? "unknown";
    if (
      now.health !== was &&
      (now.health === "warning" || now.health === "critical")
    ) {
      const bad = now.sensors
        .filter((sensor) => sensor.state === now.health)
        .map((sensor) => sensor.name)
        .slice(0, 5)
        .join(", ");
      alert(
        item,
        "health",
        `${item.name} health is ${now.health}`,
        bad ? `Sensors: ${bad}` : "The BMC reports a problem.",
        now.health === "critical" ? "critical" : "warning",
      );
    } else if (
      now.health === "ok" &&
      (was === "warning" || was === "critical")
    ) {
      alert(
        item,
        "health",
        `${item.name} health is ok`,
        "All sensors are back to normal.",
        "info",
      );
    }
  }

  async function runPoll(item: DeviceRow): Promise<void> {
    const state = stateOf(item);
    const driver = driverOf(item);
    state.lastPolled = Date.now();
    try {
      const reading = await driver.read(await targetOf(item), io);
      const before = state.reading;
      const wasDown = state.status === "down";
      state.status = "up";
      state.failures = 0;
      state.lastError = null;
      state.lastSeenAt = reading.at;
      state.reading = reading;
      if (wasDown) {
        alert(
          item,
          "down",
          `${item.name} is back`,
          "The BMC answers again.",
          "info",
        );
      }
      judge(item, state, before, reading);
    } catch (error) {
      state.failures += 1;
      state.lastError = error instanceof Error ? error.message : String(error);
      if (state.failures >= DOWN_AFTER_FAILURES && state.status !== "down") {
        state.status = "down";
        alert(
          item,
          "down",
          `${item.name} is unreachable`,
          state.lastError,
          "warning",
        );
      }
    }
    const changed = state.status !== item.status;
    if (changed || Date.now() - state.lastPersisted > PERSIST_EVERY_MS) {
      item.status = state.status;
      await persistState(item, state);
    }
  }

  function poll(id: number): Promise<Device> {
    return (async () => {
      const item = await row(id);
      const state = stateOf(item);
      if (!state.polling) {
        state.polling = runPoll(item).finally(() => {
          state.polling = null;
        });
      }
      await state.polling;
      return toDevice(await row(id));
    })();
  }

  function clean(input: DeviceInput, existing?: DeviceRow) {
    const driverId = existing?.driver ?? input.driver;
    const driver = driverId ? getDriver(driverId) : undefined;
    if (!driver) throw new ServiceError("Pick a device type");
    const name = (input.name ?? existing?.name ?? "").trim();
    if (!name || name.length > 100)
      throw new ServiceError("Give the device a name");
    const address = (input.address ?? existing?.address ?? "").trim();
    if (!address || address.length > 255 || /[\s/\\@?#]/.test(address)) {
      throw new ServiceError("Enter the BMC address, like 192.168.1.50");
    }
    const port =
      input.port === undefined ? (existing?.port ?? null) : input.port;
    if (
      port !== null &&
      (!Number.isInteger(port) || port < 1 || port > 65535)
    ) {
      throw new ServiceError("The port must be between 1 and 65535");
    }
    const given =
      input.options ?? parseJson<DeviceOptions>(existing?.options ?? null, {});
    const options: DeviceOptions = {};
    if (
      driver.info.web &&
      (given.scheme === "http" || given.scheme === "https")
    ) {
      options.scheme = given.scheme;
    }
    if (driver.info.id === "ipmi") {
      if (given.cipher !== undefined) {
        if (
          !Number.isInteger(given.cipher) ||
          given.cipher < 0 ||
          given.cipher > 30
        ) {
          throw new ServiceError(
            "The cipher suite must be a number from 0 to 30",
          );
        }
        options.cipher = given.cipher;
      }
      if (given.relayHostId !== undefined && given.relayHostId !== null) {
        if (!Number.isInteger(given.relayHostId) || given.relayHostId < 1) {
          throw new ServiceError("Bad relay host");
        }
        options.relayHostId = given.relayHostId;
      }
    }
    const hostId =
      input.hostId === undefined ? (existing?.hostId ?? null) : input.hostId;
    if (hostId !== null && (!Number.isInteger(hostId) || hostId < 1)) {
      throw new ServiceError("Bad host");
    }
    const floor = options.relayHostId ? MIN_POLL_RELAY : MIN_POLL;
    const pollSeconds = Math.min(
      MAX_POLL,
      Math.max(
        floor,
        Math.round(input.pollSeconds ?? existing?.pollSeconds ?? 120),
      ),
    );
    const ca =
      input.ca === undefined ? (existing?.ca ?? null) : input.ca.trim() || null;
    if (ca && !ca.includes("BEGIN CERTIFICATE")) {
      throw new ServiceError("The CA must be a PEM certificate");
    }
    return {
      name,
      driver: driver.info.id,
      address,
      port,
      options,
      hostId,
      pollSeconds,
      ca,
    };
  }

  function cleanCredentials(
    driver: Driver,
    given: Record<string, string> | undefined,
  ): Credentials {
    const out: Credentials = {};
    for (const field of driver.info.fields) {
      const value = given?.[field.key];
      if (typeof value === "string" && value.length > 0) out[field.key] = value;
    }
    return out;
  }

  function checkCredentials(driver: Driver, credentials: Credentials) {
    for (const field of driver.info.fields) {
      if (field.required && !credentials[field.key]) {
        throw new ServiceError(`Enter the ${field.key}`);
      }
    }
  }

  async function withDriver<T>(
    id: number,
    feature: "eventLog" | "clearLog" | "bootOnce" | "media",
    run: (driver: Driver, target: Target, item: DeviceRow) => Promise<T>,
  ): Promise<T> {
    const item = await row(id);
    const driver = driverOf(item);
    if (!driver[feature]) {
      throw new ServiceError("This device type does not support that", 400);
    }
    return run(driver, await targetOf(item), item);
  }

  function later(id: number) {
    ctx.schedule.after(RECHECK_MS, () => void poll(id).catch(() => {}));
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

    async byHost(hostId) {
      const found = (await rows()).find((item) => item.hostId === hostId);
      return found ? toDevice(found) : null;
    },

    async unlinkHost(hostId) {
      await (
        await db()
      )
        .update(store)
        .set({ hostId: null })
        .where(eq(store.hostId, hostId));
      await ctx.db.persist({ lazy: true });
    },

    async create(input, userId) {
      const fields = clean(input);
      const driver = getDriver(fields.driver)!;
      const credentials = cleanCredentials(driver, input.credentials);
      checkCredentials(driver, credentials);
      try {
        await (await db()).insert(store).values({
          createdBy: userId,
          hostId: fields.hostId,
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
        hostId: fields.hostId,
        address: fields.address,
        port: fields.port,
        ca: fields.ca,
        options: JSON.stringify(fields.options),
        pollSeconds: fields.pollSeconds,
      };
      const given = cleanCredentials(driver, input.credentials);
      if (Object.keys(given).length > 0) {
        checkCredentials(driver, given);
        changes.credentials = await ctx.secrets.seal(JSON.stringify(given));
      }
      try {
        await (await db()).update(store).set(changes).where(eq(store.id, id));
      } catch {
        throw new ServiceError("A device with this name already exists", 409);
      }
      await ctx.db.persist();
      stateOf(existing).failures = 0;
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
      checkCredentials(driver, credentials);
      return driver.read(
        {
          address: fields.address,
          port: fields.port ?? driver.info.defaultPort,
          options: fields.options,
          credentials,
          ca: fields.ca ?? undefined,
          actor: ctx.currentActor(),
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
      for (let index = 0; index < due.length; index += POLL_CONCURRENCY) {
        await Promise.all(
          due
            .slice(index, index + POLL_CONCURRENCY)
            .map((item) => poll(item.id).catch(() => {})),
        );
      }
    },

    async power(id, action) {
      const item = await row(id);
      const driver = driverOf(item);
      if (!driver.info.powerActions.includes(action)) {
        throw new ServiceError("This device type does not support that", 400);
      }
      await driver.power(await targetOf(item), io, action);
      const state = stateOf(item);
      state.expectUntil = Date.now() + EXPECT_MS;
      later(id);
    },

    eventLog: (id) =>
      withDriver(id, "eventLog", (driver, target) =>
        driver.eventLog!(target, io),
      ),

    clearLog: (id) =>
      withDriver(id, "clearLog", (driver, target) =>
        driver.clearLog!(target, io),
      ),

    async bootOnce(id, device, uefi) {
      if (!BOOT_TARGETS.includes(device))
        throw new ServiceError("Bad boot device");
      await withDriver(id, "bootOnce", (driver, target) =>
        driver.bootOnce!(target, io, device, uefi),
      );
    },

    mediaList: (id) =>
      withDriver(id, "media", (driver, target) =>
        driver.media!.list(target, io),
      ),

    async mediaMount(id, slotId, url) {
      if (!MEDIA_URL.test(url)) {
        throw new ServiceError("Enter an http, https, nfs or smb address");
      }
      await withDriver(id, "media", (driver, target) =>
        driver.media!.mount(target, io, slotId, url),
      );
    },

    mediaEject: (id, slotId) =>
      withDriver(id, "media", (driver, target) =>
        driver.media!.eject(target, io, slotId),
      ).then(() => undefined),

    async consoleTarget(id) {
      const item = await row(id);
      if (item.driver !== "ipmi") {
        throw new ServiceError("This device type has no serial console", 400);
      }
      return targetOf(item);
    },
  };
}
