import type { Inventory, VmState } from "../shared/types.js";
import type { Target, VmProvider } from "./provider.js";

export const CACHE_MS = 60_000;
const EXPECT_MS = 5 * 60_000;

export interface Transition {
  hostId: number;
  uuid: string;
  name: string;
  from: VmState;
  to: VmState;
  /** Termix asked for this, so it is not news. */
  expected: boolean;
}

export interface InventoryStore {
  get: (
    target: Target,
    options?: { fresh?: boolean; maxAgeMs?: number },
  ) => Promise<Inventory>;
  /** Drops the cached copy after a change. */
  invalidate: (hostId: number) => void;
  /** The next state change on this VM came from Termix. */
  expect: (hostId: number, uuid: string) => void;
}

const UP: VmState[] = ["running", "blocked", "paused", "pmsuspended"];

export function isUp(state: VmState): boolean {
  return UP.includes(state);
}

export function diffStates(
  hostId: number,
  before: Inventory,
  after: Inventory,
  expected: (uuid: string) => boolean,
): Transition[] {
  const previous = new Map(before.vms.map((vm) => [vm.uuid, vm.state]));
  const out: Transition[] = [];
  for (const vm of after.vms) {
    const from = previous.get(vm.uuid);
    if (from === undefined || from === vm.state) continue;
    out.push({
      hostId,
      uuid: vm.uuid,
      name: vm.name,
      from,
      to: vm.state,
      expected: expected(vm.uuid),
    });
  }
  return out;
}

/** One cached read per host, shared by the dashboard, signals and watches. */
export function createInventory(
  provider: VmProvider,
  onRead: (hostId: number, inventory: Inventory, changes: Transition[]) => void,
): InventoryStore {
  const cache = new Map<number, { at: number; inventory: Inventory }>();
  const flying = new Map<number, Promise<Inventory>>();
  const expecting = new Map<string, number>();
  // Survives invalidate, or a change would never be seen as a change.
  const last = new Map<number, Inventory>();

  const expected = (hostId: number, uuid: string) => {
    const at = expecting.get(`${hostId}:${uuid}`);
    return at !== undefined && Date.now() - at < EXPECT_MS;
  };

  return {
    invalidate(hostId) {
      cache.delete(hostId);
    },
    expect(hostId, uuid) {
      expecting.set(`${hostId}:${uuid}`, Date.now());
    },
    async get(target, options = {}) {
      const { hostId } = target;
      const cached = cache.get(hostId);
      const maxAge = options.maxAgeMs ?? CACHE_MS;
      if (!options.fresh && cached && Date.now() - cached.at < maxAge) {
        return cached.inventory;
      }
      const running = flying.get(hostId);
      if (running) return running;
      const read = provider
        .inventory(target)
        .then((inventory) => {
          const before = last.get(hostId);
          cache.set(hostId, { at: Date.now(), inventory });
          last.set(hostId, inventory);
          onRead(
            hostId,
            inventory,
            before
              ? diffStates(hostId, before, inventory, (uuid) =>
                  expected(hostId, uuid),
                )
              : [],
          );
          return inventory;
        })
        .finally(() => flying.delete(hostId));
      flying.set(hostId, read);
      return read;
    },
  };
}
