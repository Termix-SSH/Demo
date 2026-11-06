export interface GitStatus {
  installed: boolean;
  version: string;
  user: string;
  /** Folders scanned for repos. */
  roots: string[];
  canEdit: boolean;
  readOnly: boolean;
  canRunCommands: boolean;
}

export type PullOutcome = "pulled" | "uptodate" | "skipped" | "failed";

export interface PullRun {
  at: string;
  outcome: PullOutcome;
  message: string;
}

export interface AutoPull {
  enabled: boolean;
  /** Minutes between pulls. */
  intervalMin: number;
  /** Runs in the repo folder after a pull that changed something. */
  postCommand: string;
  runs: PullRun[];
  nextAt?: string;
  failing?: boolean;
}

export interface RepoInfo {
  path: string;
  name: string;
  /** Empty when the folder is gone or not a repo any more. */
  error?: string;
  branch: string;
  detached: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  /** Tracked files with changes. */
  changed: number;
  untracked: number;
  conflicts: number;
  stashes: number;
  remoteUrl: string;
  last?: { hash: string; subject: string; author: string; date: string };
  auto?: AutoPull;
}

export interface FileChange {
  path: string;
  /** Rename source. */
  from?: string;
  /** Index state, one letter or "." */
  index: string;
  /** Working tree state, one letter or "." */
  tree: string;
  untracked?: boolean;
  conflict?: boolean;
}

export interface StatusView {
  branch: string;
  detached: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  files: FileChange[];
}

export interface Commit {
  hash: string;
  short: string;
  author: string;
  date: string;
  refs: string[];
  subject: string;
}

export interface Branch {
  name: string;
  current: boolean;
  remote: boolean;
  upstream: string;
  ahead: number;
  behind: number;
  gone: boolean;
  hash: string;
  subject: string;
}

export interface StashEntry {
  index: number;
  name: string;
  message: string;
}

export interface Remote {
  name: string;
  fetch: string;
  push: string;
}

export interface CommitDetail {
  commit: Commit;
  body: string;
  stat: string;
  diff: string;
  truncated: boolean;
}

export interface DiffView {
  text: string;
  truncated: boolean;
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export interface RepoSummary {
  hostId: number;
  checkedAt: string;
  repos: Array<
    Pick<
      RepoInfo,
      | "path"
      | "name"
      | "branch"
      | "ahead"
      | "behind"
      | "changed"
      | "untracked"
      | "conflicts"
    > & { failing: boolean }
  >;
  error?: string;
}
