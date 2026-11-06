import type {
  PluginContext,
  PluginOperationContext,
} from "@termix-ssh/plugin-sdk/backend";
import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import { readHostSettings } from "./host-settings.js";
import { actions, cleanBranch, cleanPath, cleanRef } from "./scripts.js";
import type { GitService } from "./service.js";

type Status = "ok" | "warn" | "fail" | "unknown";
type Input = Record<string, unknown>;
type Repos = Awaited<ReturnType<GitService["repos"]>>;

function requireHost(context: PluginOperationContext): number {
  if (context.hostId === undefined) throw new Error("This needs a host");
  return context.hostId;
}

function requireRepo(context: PluginOperationContext): string {
  return cleanPath(context.resourceKey);
}

/** Everything Git offers to the rest of Termix. */
export function registerOperations(
  ctx: PluginContext,
  service: GitService,
): void {
  if (typeof ctx.operations?.register !== "function") return;

  const settings = async (hostId: number, change: boolean) => {
    const s = await readHostSettings(ctx, hostId);
    if (change && s.readOnly) {
      throw new HostScriptError("This host is read only in Git", 403);
    }
    return s;
  };

  ctx.operations.register("git.list-repos", {
    run: async (_input, context) => {
      const hostId = requireHost(context);
      const repos = await service.repos(hostId, await settings(hostId, false));
      const rows = repos.map((r) => ({
        id: r.path,
        name: r.name,
        state: r.error
          ? "missing"
          : r.conflicts
            ? "conflict"
            : r.changed || r.untracked
              ? "dirty"
              : r.behind
                ? "behind"
                : r.ahead
                  ? "ahead"
                  : "clean",
        branch: r.branch || "(detached)",
        ahead: r.ahead,
        behind: r.behind,
        changed: r.changed + r.untracked,
      }));
      return { summary: `${rows.length} repos`, data: { rows } };
    },
  });

  // Each change runs the same script as the tab does and reports git's output.
  const change = (
    id: string,
    describe: (path: string, input: Input) => string,
    build: (path: string, input: Input) => string,
    slow: boolean,
    done: string,
  ) =>
    ctx.operations.register(id, {
      describe: (input, context) => describe(requireRepo(context), input),
      run: async (input, context) => {
        const hostId = requireHost(context);
        const path = requireRepo(context);
        const result = await service.change(
          hostId,
          await settings(hostId, true),
          path,
          build(path, input),
          slow,
        );
        if (!result.ok) {
          throw new HostScriptError(result.output || "Git failed");
        }
        return {
          summary: done,
          changed: true,
          data: { output: result.output },
        };
      },
    });

  change(
    "git.fetch",
    (p) => `Would fetch ${p}`,
    (p) => actions.fetch(p),
    true,
    "Fetched",
  );
  change(
    "git.pull",
    (p) => `Would pull ${p} with fast forward only`,
    (p) => actions.pull(p),
    true,
    "Pulled",
  );
  change(
    "git.push",
    (p) => `Would push ${p}`,
    (p) => actions.push(p, "origin"),
    true,
    "Pushed",
  );
  change(
    "git.checkout",
    (p, i) => `Would switch ${p} to ${String(i.branch ?? "")}`,
    (p, i) => actions.checkout(p, cleanBranch(i.branch), false),
    false,
    "Switched branch",
  );
  change(
    "git.reset-hard",
    (p, i) =>
      `Would discard all uncommitted changes in ${p} and reset to ${String(i.ref || "HEAD")}`,
    (p, i) => actions.resetHard(p, cleanRef(i.ref || "HEAD")),
    false,
    "Reset",
  );

  // Status tiles. Each read is one host call.
  const signal = (
    id: string,
    read: (repos: Repos) => {
      value: number;
      status: Status;
      label: string;
      items?: { label: string; status?: Status }[];
    },
  ) =>
    ctx.operations.register(`git.${id}`, {
      run: async (_input, context) => {
        const hostId = requireHost(context);
        const repos = (
          await service.repos(hostId, await settings(hostId, false))
        ).filter((r) => !r.error);
        const data = read(repos);
        return { summary: data.label, data };
      },
    });

  signal("read-behind", (repos) => {
    const behind = repos.filter((r) => r.behind > 0);
    return {
      value: behind.length,
      status: behind.length ? "warn" : "ok",
      label: behind.length
        ? `${behind.length} repos are behind`
        : "All repos are up to date",
      items: behind.map((r) => ({
        label: `${r.name} is ${r.behind} behind`,
        status: "warn" as Status,
      })),
    };
  });

  signal("read-dirty", (repos) => {
    const dirty = repos.filter((r) => r.changed || r.untracked || r.conflicts);
    return {
      value: dirty.length,
      status: dirty.some((r) => r.conflicts)
        ? "fail"
        : dirty.length
          ? "warn"
          : "ok",
      label: dirty.length
        ? `${dirty.length} repos have uncommitted changes`
        : "All repos are clean",
      items: dirty.map((r) => ({
        label: `${r.name}: ${r.changed + r.untracked} changes`,
        status: (r.conflicts ? "fail" : "warn") as Status,
      })),
    };
  });

  signal("read-pull-failing", (repos) => {
    const failing = repos.filter((r) => r.auto?.failing);
    return {
      value: failing.length,
      status: failing.length ? "fail" : "ok",
      label: failing.length
        ? `${failing.length} repos fail to auto pull`
        : "Auto pull is fine",
      items: failing.map((r) => ({
        label: `${r.name} fails to pull`,
        status: "fail" as Status,
      })),
    };
  });
}
