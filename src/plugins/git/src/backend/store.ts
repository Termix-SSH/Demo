import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { PullRun } from "../shared/types.js";

export interface SavedAuto {
  enabled: boolean;
  intervalMin: number;
  postCommand: string;
  /** The user whose rights the schedule runs with. */
  updatedBy: string;
  nextAt?: string;
  failing?: boolean;
  runs: PullRun[];
}

export interface SavedRepo {
  path: string;
  auto?: SavedAuto;
}

export const MAX_RUNS = 20;
const HOSTS_KEY = "auto-hosts";
const key = (hostId: number) => `repos:${hostId}`;

export interface RepoStore {
  list: (hostId: number) => Promise<SavedRepo[]>;
  /** Changes one host's list. Calls for the same plugin run one at a time. */
  update: <T>(
    hostId: number,
    fn: (repos: SavedRepo[]) => T | Promise<T>,
  ) => Promise<T>;
  /** Hosts that have at least one repo with auto pull on. */
  autoHosts: () => Promise<number[]>;
}

function clean(value: unknown): SavedRepo[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (r): r is SavedRepo =>
      !!r &&
      typeof (r as SavedRepo).path === "string" &&
      !!(r as SavedRepo).path,
  );
}

export function createStore(ctx: PluginContext): RepoStore {
  let chain: Promise<unknown> = Promise.resolve();

  const list = async (hostId: number) =>
    clean(await ctx.kv.get(key(hostId)).catch(() => null));

  const syncHosts = async (hostId: number, repos: SavedRepo[]) => {
    const raw = await ctx.kv.get(HOSTS_KEY).catch(() => null);
    const hosts = new Set<number>(
      Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : [],
    );
    const on = repos.some((r) => r.auto?.enabled);
    const had = hosts.has(hostId);
    if (on === had) return;
    if (on) hosts.add(hostId);
    else hosts.delete(hostId);
    await ctx.kv.set(HOSTS_KEY, [...hosts]);
  };

  return {
    list,
    update: (hostId, fn) => {
      const run = chain.then(async () => {
        const repos = await list(hostId);
        const result = await fn(repos);
        await ctx.kv.set(key(hostId), repos);
        await syncHosts(hostId, repos);
        return result;
      });
      chain = run.catch(() => undefined);
      return run;
    },
    autoHosts: async () => {
      const raw = await ctx.kv.get(HOSTS_KEY).catch(() => null);
      return Array.isArray(raw) ? raw.filter((n) => Number.isInteger(n)) : [];
    },
  };
}
