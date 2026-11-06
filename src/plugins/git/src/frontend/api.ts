import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";
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
} from "../shared/types";

let client: TermixApp["api"] | null = null;

export function initApi(api: TermixApp["api"]): void {
  client = api;
}

function api(): TermixApp["api"] {
  if (!client) throw new Error("Git is not ready");
  return client;
}

/** The server's message for a failed call, or the fallback. */
export function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: unknown } } })
    ?.response?.data?.error;
  return typeof message === "string" && message ? message : fallback;
}

export function errorCode(error: unknown): string {
  const code = (error as { response?: { data?: { code?: unknown } } })?.response
    ?.data?.code;
  return typeof code === "string" ? code : "";
}

const enc = encodeURIComponent;
const q = (
  path: string,
  extra: Record<string, string | number | undefined> = {},
) => {
  const params = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return `?${params.toString()}`;
};

export async function getStatus(host: number): Promise<GitStatus> {
  return (await api().get<GitStatus>(`/${host}/status`)).data;
}

export async function getRepos(host: number): Promise<RepoInfo[]> {
  return (await api().get<{ repos: RepoInfo[] }>(`/${host}/repos`)).data.repos;
}

export async function addRepos(host: number, paths: string[]): Promise<void> {
  await api().post(`/${host}/repos`, { paths });
}

export async function removeRepo(host: number, path: string): Promise<void> {
  await api().delete(`/${host}/repos${q(path)}`);
}

export async function discover(host: number): Promise<string[]> {
  return (await api().get<{ found: string[] }>(`/${host}/discover`)).data.found;
}

export async function cloneRepo(
  host: number,
  url: string,
  path: string,
): Promise<ActionResult & { path?: string }> {
  return (
    await api().post<ActionResult & { path?: string }>(`/${host}/clone`, {
      url,
      path,
    })
  ).data;
}

export async function getRepoStatus(
  host: number,
  path: string,
): Promise<StatusView> {
  return (await api().get<StatusView>(`/${host}/repo/status${q(path)}`)).data;
}

export async function getLog(
  host: number,
  path: string,
  options: { ref?: string; file?: string; all?: boolean; skip?: number },
): Promise<Commit[]> {
  return (
    await api().get<{ commits: Commit[] }>(
      `/${host}/repo/log${q(path, {
        ref: options.ref,
        file: options.file,
        all: options.all ? "1" : undefined,
        skip: options.skip,
      })}`,
    )
  ).data.commits;
}

export async function getCommit(
  host: number,
  path: string,
  hash: string,
): Promise<CommitDetail> {
  return (
    await api().get<CommitDetail>(`/${host}/repo/commit${q(path, { hash })}`)
  ).data;
}

export async function getDiff(
  host: number,
  path: string,
  file: string,
  mode: "tree" | "staged" | "untracked",
): Promise<DiffView> {
  return (
    await api().get<DiffView>(`/${host}/repo/diff${q(path, { file, mode })}`)
  ).data;
}

export async function getBranches(
  host: number,
  path: string,
): Promise<Branch[]> {
  return (
    await api().get<{ branches: Branch[] }>(`/${host}/repo/branches${q(path)}`)
  ).data.branches;
}

export async function getRemotes(
  host: number,
  path: string,
): Promise<Remote[]> {
  return (
    await api().get<{ remotes: Remote[] }>(`/${host}/repo/remotes${q(path)}`)
  ).data.remotes;
}

export async function getStashes(
  host: number,
  path: string,
): Promise<StashEntry[]> {
  return (
    await api().get<{ stashes: StashEntry[] }>(
      `/${host}/repo/stashes${q(path)}`,
    )
  ).data.stashes;
}

async function change(
  host: number,
  name: string,
  body: Record<string, unknown>,
): Promise<ActionResult> {
  return (await api().post<ActionResult>(`/${host}/repo/${name}`, body)).data;
}

export const fetchRepo = (host: number, path: string) =>
  change(host, "fetch", { path });
export const pullRepo = (host: number, path: string) =>
  change(host, "pull", { path });
export const pushRepo = (host: number, path: string) =>
  change(host, "push", { path });
export const checkout = (
  host: number,
  path: string,
  branch: string,
  remote: boolean,
) => change(host, "checkout", { path, branch, remote });
export const createBranch = (
  host: number,
  path: string,
  name: string,
  start?: string,
) => change(host, "branch", { path, name, start });
export const mergeBranch = (host: number, path: string, branch: string) =>
  change(host, "merge", { path, branch });
export const stage = (
  host: number,
  path: string,
  files: string[],
  all = false,
) => change(host, "stage", { path, files, all });
export const unstage = (host: number, path: string, files: string[]) =>
  change(host, "unstage", { path, files });
export const discard = (
  host: number,
  path: string,
  tracked: string[],
  untracked: string[],
) => change(host, "discard", { path, tracked, untracked });
export const commit = (
  host: number,
  path: string,
  message: string,
  all: boolean,
) => change(host, "commit", { path, message, all });
export const stash = (
  host: number,
  path: string,
  op: "push" | "pop" | "apply" | "drop",
  extra: { index?: number; message?: string; untracked?: boolean } = {},
) => change(host, "stash", { path, op, ...extra });
export const resetHard = (host: number, path: string, ref = "HEAD") =>
  change(host, "reset", { path, ref });

export async function deleteBranch(
  host: number,
  path: string,
  name: string,
  force: boolean,
): Promise<ActionResult> {
  return (
    await api().delete<ActionResult>(
      `/${host}/repo/branch${q(path, { name, force: force ? "1" : undefined })}`,
    )
  ).data;
}

export async function setAuto(
  host: number,
  path: string,
  body: { enabled: boolean; intervalMin: number; postCommand: string },
): Promise<AutoPull | undefined> {
  return (
    await api().put<{ auto?: AutoPull }>(`/${host}/repo/auto`, {
      path,
      ...body,
    })
  ).data.auto;
}

export async function runAuto(host: number, path: string): Promise<PullRun> {
  return (
    await api().post<{ run: PullRun }>(`/${host}/repo/auto/run`, { path })
  ).data.run;
}

export { enc };
