import {
  HostScriptError,
  parseKeys,
  scrub,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ActionResult,
  AutoPull,
  Branch,
  Commit,
  CommitDetail,
  DiffView,
  GitStatus,
  PullRun,
  Remote,
  RepoInfo,
  StashEntry,
  StatusView,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import {
  parseBranches,
  parseCommitHead,
  parseInfo,
  parseLog,
  parseRemotes,
  parseStashes,
  parseStatus,
  parseAutoResult,
  sections,
} from "./parse.js";
import type { Remote as Runner, RunOptions } from "./remote.js";
import {
  DIFF_LIMIT,
  HOST_SCRIPT,
  actions,
  autoPullScript,
  branchesScript,
  diffScript,
  discoverScript,
  infoScript,
  logScript,
  remotesScript,
  showScript,
  stashListScript,
  statusScript,
  toplevelScript,
  type LogOptions,
} from "./scripts.js";
import { MAX_RUNS, type RepoStore, type SavedAuto } from "./store.js";

const OUTPUT_LIMIT = 6000;
const NET_TIMEOUT = 5 * 60_000;

export function toAutoPull(auto: SavedAuto | undefined): AutoPull | undefined {
  if (!auto) return undefined;
  return {
    enabled: auto.enabled,
    intervalMin: auto.intervalMin,
    postCommand: auto.postCommand,
    runs: auto.runs,
    nextAt: auto.nextAt,
    failing: auto.failing,
  };
}

export function createService(remote: Runner, store: RepoStore) {
  const run = (
    hostId: number,
    s: HostSettings,
    script: string,
    options: RunOptions = {},
  ) =>
    s.sudo
      ? remote.root(hostId, true, script, options)
      : remote.plain(hostId, script, options);

  /** Throws unless the path is a repo the user has added to this host. */
  async function saved(hostId: number, path: string) {
    const repo = (await store.list(hostId)).find((r) => r.path === path);
    if (!repo) throw new HostScriptError("That repo is not in the list", 404);
    return repo;
  }

  async function act(
    hostId: number,
    s: HostSettings,
    script: string,
    timeoutMs = 120_000,
  ): Promise<ActionResult> {
    const result = await run(hostId, s, script, {
      timeoutMs,
      allowFail: true,
      maxOutputBytes: 400_000,
    });
    return {
      ok: result.code === 0,
      output: scrub(result.stdout || result.stderr, OUTPUT_LIMIT),
    };
  }

  const service = {
    async host(hostId: number, s: HostSettings): Promise<Partial<GitStatus>> {
      const result = await run(hostId, s, HOST_SCRIPT, { allowFail: true });
      if (result.code === 127) {
        return { installed: false, version: "", user: "", roots: s.roots };
      }
      const keys = parseKeys(result.stdout);
      return {
        installed: true,
        version: keys.version ?? "",
        user: keys.user ?? "",
        roots: s.roots,
      };
    },

    async repos(hostId: number, s: HostSettings): Promise<RepoInfo[]> {
      const list = await store.list(hostId);
      if (!list.length) return [];
      const result = await run(hostId, s, infoScript(list.map((r) => r.path)), {
        timeoutMs: 60_000,
      });
      const parsed = new Map(parseInfo(result.stdout).map((p) => [p.path, p]));
      return list.map((r) => {
        const p = parsed.get(r.path);
        const st = p?.status;
        return {
          path: r.path,
          name: p?.name ?? r.path.split("/").pop() ?? r.path,
          error: p?.error ?? (p ? undefined : "unreadable"),
          branch: st?.branch ?? "",
          detached: st?.detached ?? false,
          upstream: st?.upstream ?? "",
          ahead: st?.ahead ?? 0,
          behind: st?.behind ?? 0,
          changed: st?.changed ?? 0,
          untracked: st?.untracked ?? 0,
          conflicts: st?.conflicts ?? 0,
          stashes: p?.stashes ?? 0,
          remoteUrl: p?.remoteUrl ?? "",
          last: p?.last,
          auto: toAutoPull(r.auto),
        };
      });
    },

    async status(
      hostId: number,
      s: HostSettings,
      path: string,
    ): Promise<StatusView> {
      await saved(hostId, path);
      const result = await run(hostId, s, statusScript(path));
      const { branch, detached, upstream, ahead, behind, files } = parseStatus(
        result.stdout,
        true,
      );
      return { branch, detached, upstream, ahead, behind, files };
    },

    async log(
      hostId: number,
      s: HostSettings,
      path: string,
      options: LogOptions,
    ): Promise<Commit[]> {
      await saved(hostId, path);
      return parseLog((await run(hostId, s, logScript(path, options))).stdout);
    },

    async show(
      hostId: number,
      s: HostSettings,
      path: string,
      hash: string,
    ): Promise<CommitDetail> {
      await saved(hostId, path);
      const out = sections(
        (await run(hostId, s, showScript(path, hash))).stdout,
      );
      const { commit, body } = parseCommitHead(out.head ?? "");
      if (!commit) throw new HostScriptError("Commit not found", 404);
      const diff = out.diff ?? "";
      return {
        commit,
        body,
        stat: (out.stat ?? "").trim(),
        diff: diff.slice(0, DIFF_LIMIT),
        truncated: diff.length > DIFF_LIMIT,
      };
    },

    async diff(
      hostId: number,
      s: HostSettings,
      path: string,
      file: string,
      mode: "tree" | "staged" | "untracked",
    ): Promise<DiffView> {
      await saved(hostId, path);
      const text = (await run(hostId, s, diffScript(path, file, mode))).stdout;
      return {
        text: text.slice(0, DIFF_LIMIT),
        truncated: text.length > DIFF_LIMIT,
      };
    },

    async branches(
      hostId: number,
      s: HostSettings,
      path: string,
    ): Promise<Branch[]> {
      await saved(hostId, path);
      return parseBranches((await run(hostId, s, branchesScript(path))).stdout);
    },

    async remotes(
      hostId: number,
      s: HostSettings,
      path: string,
    ): Promise<Remote[]> {
      await saved(hostId, path);
      return parseRemotes((await run(hostId, s, remotesScript(path))).stdout);
    },

    async stashes(
      hostId: number,
      s: HostSettings,
      path: string,
    ): Promise<StashEntry[]> {
      await saved(hostId, path);
      return parseStashes((await run(hostId, s, stashListScript(path))).stdout);
    },

    /** Runs a change in a saved repo. Fetch, pull and push may be slow. */
    async change(
      hostId: number,
      s: HostSettings,
      path: string,
      script: string,
      slow = false,
    ): Promise<ActionResult> {
      await saved(hostId, path);
      return act(hostId, s, script, slow ? NET_TIMEOUT : 120_000);
    },

    async toplevel(
      hostId: number,
      s: HostSettings,
      path: string,
    ): Promise<string> {
      const result = await run(hostId, s, toplevelScript(path), {
        allowFail: true,
      });
      const top = result.stdout.trim().split("\n").pop()?.trim() ?? "";
      if (result.code !== 0 || !top.startsWith("/")) {
        throw new HostScriptError(
          scrub(result.stdout || result.stderr, 300) ||
            "That folder is not a git repo",
        );
      }
      return top;
    },

    async add(hostId: number, paths: string[]): Promise<void> {
      await store.update(hostId, (repos) => {
        for (const path of paths) {
          if (!repos.some((r) => r.path === path)) repos.push({ path });
        }
      });
    },

    async remove(hostId: number, path: string): Promise<void> {
      await store.update(hostId, (repos) => {
        const i = repos.findIndex((r) => r.path === path);
        if (i < 0)
          throw new HostScriptError("That repo is not in the list", 404);
        repos.splice(i, 1);
      });
    },

    async discover(hostId: number, s: HostSettings): Promise<string[]> {
      const result = await run(hostId, s, discoverScript(s.roots), {
        timeoutMs: 60_000,
      });
      const known = new Set((await store.list(hostId)).map((r) => r.path));
      return [
        ...new Set(
          result.stdout
            .split("\n")
            .map((l) => l.trim())
            .filter((l) => l.startsWith("/") && !known.has(l)),
        ),
      ].sort();
    },

    async clone(
      hostId: number,
      s: HostSettings,
      url: string,
      dest: string,
    ): Promise<ActionResult & { path?: string }> {
      const result = await act(
        hostId,
        s,
        actions.clone(url, dest),
        10 * 60_000,
      );
      if (!result.ok) return result;
      const top = result.output.trim().split("\n").pop()?.trim() ?? "";
      if (!top.startsWith("/")) return { ...result, ok: false };
      await service.add(hostId, [top]);
      return { ...result, path: top };
    },

    async setAuto(
      hostId: number,
      path: string,
      input: {
        enabled: boolean;
        intervalMin: number;
        postCommand: string;
        userId: string;
      },
    ): Promise<AutoPull | undefined> {
      return store.update(hostId, (repos) => {
        const repo = repos.find((r) => r.path === path);
        if (!repo)
          throw new HostScriptError("That repo is not in the list", 404);
        const same =
          repo.auto?.intervalMin === input.intervalMin &&
          repo.auto?.enabled === input.enabled;
        repo.auto = {
          enabled: input.enabled,
          intervalMin: input.intervalMin,
          postCommand: input.postCommand,
          updatedBy: input.userId,
          runs: repo.auto?.runs ?? [],
          failing: input.enabled ? repo.auto?.failing : false,
          nextAt:
            input.enabled && !same
              ? new Date(Date.now() + 5_000).toISOString()
              : repo.auto?.nextAt,
        };
        return toAutoPull(repo.auto);
      });
    },

    /** Records a skipped run and waits for the next interval. */
    async snooze(hostId: number, path: string, message: string): Promise<void> {
      await store.update(hostId, (repos) => {
        const auto = repos.find((r) => r.path === path)?.auto;
        if (!auto) return;
        auto.runs = [
          {
            at: new Date().toISOString(),
            outcome: "skipped" as const,
            message,
          },
          ...auto.runs,
        ].slice(0, MAX_RUNS);
        auto.nextAt = new Date(
          Date.now() + auto.intervalMin * 60_000,
        ).toISOString();
      });
    },

    /** Runs one auto pull and records it. Returns the run and the failing change. */
    async autoPull(
      hostId: number,
      s: HostSettings,
      path: string,
      postCommand: string,
    ): Promise<{ run: PullRun; wasFailing: boolean; nowFailing: boolean }> {
      let pull: PullRun;
      try {
        const result = await run(hostId, s, autoPullScript(path, postCommand), {
          timeoutMs: NET_TIMEOUT,
          allowFail: true,
        });
        pull = {
          at: new Date().toISOString(),
          ...parseAutoResult(result.stdout),
        };
      } catch (error) {
        pull = {
          at: new Date().toISOString(),
          outcome: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
      return store.update(hostId, (repos) => {
        const repo = repos.find((r) => r.path === path);
        if (!repo?.auto)
          return { run: pull, wasFailing: false, nowFailing: false };
        const wasFailing = repo.auto.failing === true;
        const nowFailing = pull.outcome === "failed";
        repo.auto.runs = [pull, ...repo.auto.runs].slice(0, MAX_RUNS);
        repo.auto.failing = nowFailing;
        repo.auto.nextAt = new Date(
          Date.now() + repo.auto.intervalMin * 60_000,
        ).toISOString();
        return { run: pull, wasFailing, nowFailing };
      });
    },
  };

  return service;
}

export type GitService = ReturnType<typeof createService>;
