import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Health, Reading } from "../shared/types.js";
import { overall } from "./conditions.js";
import type { Engine, HostState } from "./engine.js";
import { StorageError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { Remote } from "./remote.js";
import { scrubScript, selfTestScript, type ScrubTarget } from "./scripts.js";
import type { HostRow, Store } from "./store.js";

/** A reading younger than this is reused instead of reading the host again. */
const FRESH_MS = 60_000;

export interface Service {
  /** The saved row for a host, made on first use for the acting user. */
  row: (hostId: number) => Promise<HostRow>;
  /** The latest state, read again when it is old or `force` is set. */
  fresh: (
    hostId: number,
    force?: boolean,
  ) => Promise<{ row: HostRow; state: HostState }>;
  selfTest: (
    hostId: number,
    device: string,
    action: "short" | "long" | "abort",
  ) => Promise<string>;
  scrub: (hostId: number, target: string, stop: boolean) => Promise<string>;
  /** Short health answer for other plugins, from the latest reading. */
  check: (hostId: number) => Promise<{
    status: Health;
    problems: number;
    worstDrive: string;
    readAt: number | null;
  }>;
}

export function createService(
  ctx: PluginContext,
  store: Store,
  engine: Engine,
  remote: Remote,
): Service {
  const service: Service = {
    async row(hostId) {
      const known = await store.get(hostId);
      if (known) return known;
      return store.ensure(hostId, String(ctx.currentActor() ?? ""));
    },
    async fresh(hostId, force = false) {
      const row = await service.row(hostId);
      const known = engine.state(hostId);
      if (!force && known?.readAt && Date.now() - known.readAt < FRESH_MS) {
        return { row, state: known };
      }
      const settings = await readHostSettings(ctx, hostId);
      const state = await engine.refresh(row, settings.useSudo);
      return { row, state };
    },
    async selfTest(hostId, device, action) {
      const { state } = await service.fresh(hostId);
      const drive = state.reading?.devices.find((d) => d.id === device);
      if (!drive) throw new StorageError("Drive not found", 404);
      const noSmart =
        drive.passed === null &&
        !drive.attributes.length &&
        drive.criticalWarning === null &&
        !/asleep/i.test(drive.note);
      if (noSmart) {
        throw new StorageError("This drive gives no SMART data", 400);
      }
      const settings = await readHostSettings(ctx, hostId);
      await remote.root(
        hostId,
        settings.useSudo,
        selfTestScript(drive.id, action),
        { timeoutMs: 30_000 },
      );
      const text =
        action === "abort"
          ? `Stopped the self test on ${drive.id}`
          : `Started a ${action} self test on ${drive.id}`;
      await store.addEvent(hostId, "command", text);
      return text;
    },
    async scrub(hostId, target, stop) {
      const { state } = await service.fresh(hostId);
      const reading = state.reading;
      if (!reading) throw new StorageError("Nothing was read yet", 409);
      const found = findTarget(reading, target);
      if (!found)
        throw new StorageError("Pool, filesystem or array not found", 404);
      const settings = await readHostSettings(ctx, hostId);
      await remote.root(
        hostId,
        settings.useSudo,
        scrubScript(found.target, stop),
        { timeoutMs: 30_000 },
      );
      const text = `${stop ? "Stopped" : "Started"} ${found.kind} on ${found.name}`;
      await store.addEvent(hostId, "command", text);
      return text;
    },
    async check(hostId) {
      const state = engine.state(hostId);
      const reading = state?.reading ?? null;
      const drives = reading?.devices ?? [];
      const bad =
        drives.find((d) => d.health === "fail") ??
        drives.find((d) => d.health === "warn");
      const problems = state
        ? [...state.active].filter((k) => !k.startsWith("raid-rebuilding"))
            .length
        : 0;
      return {
        status: overall(reading),
        problems,
        worstDrive: bad?.id ?? "",
        readAt: state?.readAt ?? null,
      };
    },
  };
  return service;
}

function findTarget(
  reading: Reading,
  id: string,
): { target: ScrubTarget; kind: string; name: string } | null {
  const pool = reading.pools.find((p) => p.id === id);
  if (pool) {
    return {
      target: { kind: "zfs", name: pool.name },
      kind: "a scrub",
      name: pool.name,
    };
  }
  const fs = reading.btrfs.find((b) => b.id === id);
  if (fs) {
    return {
      target: { kind: "btrfs", mount: fs.mount },
      kind: "a scrub",
      name: fs.mount,
    };
  }
  const md = reading.arrays.find((a) => a.id === id);
  if (md) {
    return {
      target: { kind: "md", name: md.name },
      kind: "a check",
      name: md.name,
    };
  }
  return null;
}
