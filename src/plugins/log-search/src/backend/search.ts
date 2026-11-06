import type {
  PluginContext,
  PluginHostSummary,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  HostResult,
  LogEntry,
  SearchRequest,
  SearchResponse,
  SearchableHost,
  Source,
} from "../shared/types.js";
import { readHostSettings, type HostSettings } from "./host-settings.js";
import {
  parseDockerOutput,
  parseFilesOutput,
  parseJournalOutput,
  type Parsed,
} from "./parse.js";
import { levelPasses, lineMatcher, originPasses } from "./query.js";
import type { Remote } from "./remote.js";
import { dockerScript, filesScript, journalSearchScript } from "./scripts.js";

/** Hosts searched at the same time. */
export const HOST_CONCURRENCY = 6;
const SOURCE_TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 4_000_000;

export const hostLabel = (host: PluginHostSummary): string =>
  host.name || host.ip || `Host ${host.id}`;

/** Runs `fn` over `items`, at most `limit` at a time. */
export async function pool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

export interface SearchService {
  hosts: () => Promise<SearchableHost[]>;
  run: (req: SearchRequest, now?: number) => Promise<SearchResponse>;
}

export function createSearch(
  ctx: PluginContext,
  remote: Remote,
): SearchService {
  async function usable(host: PluginHostSummary): Promise<HostSettings | null> {
    if (!(await ctx.hosts.checkAccess(host.id, "connect")).hasAccess) {
      return null;
    }
    const settings = await readHostSettings(ctx, host.id);
    return settings.enabled ? settings : null;
  }

  async function hosts(): Promise<SearchableHost[]> {
    const out: SearchableHost[] = [];
    for (const host of await ctx.hosts.list()) {
      if (await usable(host)) {
        out.push({ id: host.id, name: hostLabel(host), folder: host.folder });
      }
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  async function readSource(
    source: Source,
    hostId: number,
    settings: HostSettings,
    req: SearchRequest,
    now: number,
  ): Promise<Parsed> {
    const options = {
      timeoutMs: SOURCE_TIMEOUT_MS,
      maxOutputBytes: MAX_OUTPUT,
    };
    if (source === "journal") {
      const result = await remote.read(
        hostId,
        settings.sudo,
        journalSearchScript(req, now),
        options,
      );
      return parseJournalOutput(result.stdout, req, now);
    }
    if (source === "files") {
      const result = await remote.read(
        hostId,
        settings.sudo,
        filesScript(req, settings.logRoots, now),
        options,
      );
      return parseFilesOutput(result.stdout, now);
    }
    const result = await remote.read(
      hostId,
      settings.sudo,
      dockerScript(req, now),
      options,
    );
    return parseDockerOutput(result.stdout);
  }

  async function run(
    req: SearchRequest,
    now = Date.now(),
  ): Promise<SearchResponse> {
    const started = Date.now();
    const all = await ctx.hosts.list();
    const wanted = req.hostIds.length
      ? new Set(req.hostIds)
      : new Set(all.map((host) => host.id));
    const results: HostResult[] = [];
    const targets: Array<{ host: PluginHostSummary; settings: HostSettings }> =
      [];

    for (const id of req.hostIds) {
      if (!all.some((host) => host.id === id)) {
        results.push({
          hostId: id,
          host: `Host ${id}`,
          status: "error",
          count: 0,
          error: "Host not found",
          sources: {},
        });
      }
    }
    for (const host of all) {
      if (!wanted.has(host.id)) continue;
      const settings = await usable(host);
      if (settings) {
        targets.push({ host, settings });
      } else if (req.hostIds.length) {
        results.push({
          hostId: host.id,
          host: hostLabel(host),
          status: "error",
          count: 0,
          error: "Log Search is off for this host or you can't connect to it",
          sources: {},
        });
      }
    }

    const matches = lineMatcher(req);
    const entries: LogEntry[] = [];

    await pool(targets, HOST_CONCURRENCY, async ({ host, settings }) => {
      const result: HostResult = {
        hostId: host.id,
        host: hostLabel(host),
        status: "ok",
        count: 0,
        sources: {},
      };
      for (const source of req.sources) {
        try {
          const parsed = await readSource(source, host.id, settings, req, now);
          let count = 0;
          for (const entry of parsed.entries) {
            if (entry.time && (entry.time < req.from || entry.time > req.to)) {
              continue;
            }
            if (!levelPasses(entry.level, req.level)) continue;
            if (!originPasses(entry.origin, req.origin)) continue;
            if (!matches(entry.message)) continue;
            entries.push({
              ...entry,
              hostId: host.id,
              host: result.host,
              source,
            });
            count++;
          }
          result.sources[source] = { count, error: parsed.error };
          result.count += count;
        } catch (error) {
          if (!(error instanceof HostScriptError)) {
            ctx.log.warn(
              `Log read failed on host ${host.id}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
          result.sources[source] = {
            count: 0,
            error:
              error instanceof HostScriptError
                ? error.message
                : "Could not read this host",
          };
        }
      }
      const failed = Object.values(result.sources).filter((s) => s?.error);
      if (failed.length === req.sources.length) {
        result.status = "error";
        result.error = failed[0]?.error;
      }
      results.push(result);
    });

    entries.sort((a, b) => b.time - a.time);
    results.sort((a, b) => a.host.localeCompare(b.host));
    return {
      entries: entries.slice(0, req.limit),
      hosts: results,
      truncated: entries.length > req.limit,
      tookMs: Date.now() - started,
    };
  }

  return { hosts, run };
}
