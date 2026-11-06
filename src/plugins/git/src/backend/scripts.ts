import {
  HostScriptError,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";

export const MARK = "@@GIT@@";
export const DIFF_LIMIT = 300_000;

const CONTROL_RE = /[\0-\x1f\x7f]/;
const BRANCH_RE = /^[A-Za-z0-9._/+-]{1,200}$/;
const REF_RE = /^[A-Za-z0-9._/+@{}^~-]{1,200}$/;
const HASH_RE = /^[0-9a-f]{7,40}$/;
const REMOTE_RE = /^[A-Za-z0-9._-]{1,64}$/;
const URL_RE =
  /^(https?:\/\/|ssh:\/\/|git:\/\/|git@|[A-Za-z0-9._-]+@[A-Za-z0-9.-]+:)[^\s]{3,500}$/;

function bad(message: string): never {
  throw new HostScriptError(message);
}

/** A folder on the host, absolute or starting with ~. */
export function cleanPath(value: unknown): string {
  const path = typeof value === "string" ? value.trim() : "";
  if (
    !path ||
    path.length > 1024 ||
    CONTROL_RE.test(path) ||
    !(path === "~" || path.startsWith("~/") || path.startsWith("/"))
  ) {
    bad("The folder is not valid");
  }
  return path.length > 1 ? path.replace(/\/+$/, "") || "/" : path;
}

/** Shell text for a cleaned path, with ~ left to the host's HOME. */
export function pathExpr(path: string): string {
  if (path === "~") return '"$HOME"';
  if (path.startsWith("~/")) return `"$HOME"/${shellQuote(path.slice(2))}`;
  return shellQuote(path);
}

export function cleanBranch(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (
    !BRANCH_RE.test(name) ||
    name.startsWith("-") ||
    name.startsWith("/") ||
    name.endsWith("/") ||
    name.endsWith(".") ||
    name.endsWith(".lock") ||
    name.includes("..") ||
    name.includes("//")
  ) {
    bad("The branch name is not valid");
  }
  return name;
}

/** A branch, tag or commit to start from. */
export function cleanRef(value: unknown): string {
  const ref = typeof value === "string" ? value.trim() : "";
  if (!REF_RE.test(ref) || ref.startsWith("-")) bad("The ref is not valid");
  return ref;
}

export function cleanHash(value: unknown): string {
  const hash = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!HASH_RE.test(hash)) bad("The commit is not valid");
  return hash;
}

export function cleanRemote(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "origin";
  if (!REMOTE_RE.test(name) || name.startsWith("-"))
    bad("The remote name is not valid");
  return name;
}

export function cleanUrl(value: unknown): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (!URL_RE.test(url) || url.startsWith("-"))
    bad("Use an https, ssh or git address");
  return url;
}

/** One file path inside a repo. No absolute paths and no .. parts. */
export function cleanFile(value: unknown): string {
  const file = typeof value === "string" ? value : "";
  if (
    !file ||
    file.length > 1024 ||
    CONTROL_RE.test(file) ||
    file.startsWith("/") ||
    file.split("/").includes("..")
  ) {
    bad("The file path is not valid");
  }
  return file;
}

export function cleanFiles(value: unknown, max = 500): string[] {
  if (!Array.isArray(value)) return [];
  if (value.length > max) bad(`Pick at most ${max} files`);
  return value.map(cleanFile);
}

export function cleanInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isInteger(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

const quoteAll = (files: string[]) => files.map(shellQuote).join(" ");

/**
 * Start of every script. git never asks questions and never reads the
 * script from stdin, since the script itself arrives there.
 */
const PRELUDE = `export LC_ALL=C GIT_TERMINAL_PROMPT=0 GIT_OPTIONAL_LOCKS=0 GIT_PAGER=cat GIT_EDITOR=true
export GIT_SSH_COMMAND="\${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=15}"
command -v git >/dev/null 2>&1 || { echo "git is not installed on this host" >&2; exit 127; }
git() { command git "$@" </dev/null; }
`;

const enter = (path: string) =>
  `cd -- ${pathExpr(path)} 2>/dev/null || { echo "That folder is not on the host" >&2; exit 3; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "That folder is not a git repo" >&2; exit 3; }
`;

export const HOST_SCRIPT = `${PRELUDE}echo "version=$(git --version | sed 's/git version //')"
echo "user=$(id -un)"
exit 0
`;

/** Reads the state of many repos in one trip. */
export function infoScript(paths: string[]): string {
  const blocks = paths.map(
    (path) => `echo "${MARK}repo"
printf '%s\\n' ${shellQuote(path)}
(
  cd -- ${pathExpr(path)} 2>/dev/null || { echo "${MARK}missing"; exit 0; }
  git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "${MARK}notrepo"; exit 0; }
  echo "${MARK}status"
  git status --porcelain=v2 -b --untracked-files=normal 2>/dev/null
  echo "${MARK}last"
  git log -1 --format='%H%x1f%an%x1f%aI%x1f%s' 2>/dev/null
  echo "${MARK}remote"
  git remote get-url origin 2>/dev/null || git remote -v 2>/dev/null | head -n1 | awk '{print $2}'
  echo "${MARK}stash"
  git stash list 2>/dev/null | wc -l
)
`,
  );
  return `${PRELUDE}${blocks.join("")}exit 0\n`;
}

export function statusScript(path: string): string {
  return `${PRELUDE}${enter(path)}git status --porcelain=v2 -b -z --untracked-files=normal
`;
}

export interface LogOptions {
  ref?: string;
  file?: string;
  limit: number;
  skip: number;
  all: boolean;
}

export function logScript(path: string, o: LogOptions): string {
  const target = o.all ? "--all" : o.ref ? shellQuote(o.ref) : "";
  const file = o.file ? ` -- ${shellQuote(o.file)}` : "";
  return `${PRELUDE}${enter(path)}git log --format='%H%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s%x1e' -n ${o.limit} --skip=${o.skip} ${target}${file} 2>/dev/null
exit 0
`;
}

export function showScript(path: string, hash: string): string {
  return `${PRELUDE}${enter(path)}echo "${MARK}head"
git show -s --no-color --format='%H%x1f%h%x1f%an%x1f%aI%x1f%D%x1f%s%x1e%b' ${hash}
echo "${MARK}stat"
git show --no-color --format= --stat=120 ${hash}
echo "${MARK}diff"
git show --no-color --format= --patch ${hash} | head -c ${DIFF_LIMIT + 1}
`;
}

export function diffScript(
  path: string,
  file: string,
  mode: "tree" | "staged" | "untracked",
): string {
  const f = shellQuote(file);
  const cmd =
    mode === "untracked"
      ? `git diff --no-color --no-index -- /dev/null ${f}; true`
      : mode === "staged"
        ? `git diff --no-color --cached -- ${f}`
        : `git diff --no-color -- ${f}`;
  return `${PRELUDE}${enter(path)}${cmd} | head -c ${DIFF_LIMIT + 1}
`;
}

export function branchesScript(path: string): string {
  return `${PRELUDE}${enter(path)}git for-each-ref --format='%(HEAD)%1f%(refname)%1f%(refname:short)%1f%(upstream:short)%1f%(upstream:track)%1f%(objectname:short)%1f%(contents:subject)' refs/heads refs/remotes 2>/dev/null
exit 0
`;
}

export function remotesScript(path: string): string {
  return `${PRELUDE}${enter(path)}git remote -v
exit 0
`;
}

export function stashListScript(path: string): string {
  return `${PRELUDE}${enter(path)}git stash list --format='%gd%x1f%gs' 2>/dev/null
exit 0
`;
}

/** The top folder of a repo, or an error when the folder is not one. */
export function toplevelScript(path: string): string {
  return `${PRELUDE}cd -- ${pathExpr(path)} 2>/dev/null || { echo "That folder is not on the host" >&2; exit 3; }
git rev-parse --show-toplevel 2>/dev/null || { echo "That folder is not a git repo" >&2; exit 3; }
`;
}

/** Finds repos under the scan folders. */
export function discoverScript(roots: string[]): string {
  const finds = roots.map(
    (root) =>
      `find ${pathExpr(root)} -maxdepth 4 \\( -name node_modules -o -name .cache -o -name .npm -o -name .cargo \\) -prune -o -name .git -print 2>/dev/null`,
  );
  return `{ ${finds.join("; ")}; } | head -n 300 | while IFS= read -r p; do dirname "$p"; done
exit 0
`;
}

/** Wraps a change so its output and errors come back together. */
function action(path: string, body: string): string {
  return `exec 2>&1
${PRELUDE}${enter(path)}${body}
`;
}

export const actions = {
  fetch: (path: string) => action(path, "git fetch --all --prune"),
  pull: (path: string) => action(path, "git pull --ff-only"),
  push: (path: string, remote: string) =>
    action(
      path,
      `if git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1; then git push; else git push -u ${shellQuote(remote)} HEAD; fi`,
    ),
  checkout: (path: string, name: string, track: boolean) =>
    action(
      path,
      `git checkout ${track ? "--track " : ""}${shellQuote(name)} --`,
    ),
  createBranch: (path: string, name: string, start?: string) =>
    action(
      path,
      `git checkout -b ${shellQuote(name)}${start ? ` ${shellQuote(start)}` : ""}`,
    ),
  deleteBranch: (path: string, name: string, force: boolean) =>
    action(path, `git branch ${force ? "-D" : "-d"} ${shellQuote(name)}`),
  merge: (path: string, name: string) =>
    action(
      path,
      `git merge --no-edit ${shellQuote(name)} || { s=$?; git merge --abort 2>/dev/null && echo "The merge had conflicts and was undone"; exit $s; }`,
    ),
  stage: (path: string, files: string[], all: boolean) =>
    action(path, all ? "git add -A" : `git add -- ${quoteAll(files)}`),
  unstage: (path: string, files: string[]) =>
    action(
      path,
      `git restore --staged -- ${quoteAll(files)} || git reset -q -- ${quoteAll(files)}`,
    ),
  discard: (path: string, tracked: string[], untracked: string[]) =>
    action(
      path,
      [
        tracked.length
          ? `git restore -- ${quoteAll(tracked)} || git checkout -- ${quoteAll(tracked)}`
          : "",
        untracked.length ? `git clean -fd -- ${quoteAll(untracked)}` : "",
        "true",
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  commit: (path: string, message: string, all: boolean) =>
    action(
      path,
      `msg=$(mktemp) || exit 1
trap 'rm -f "$msg"' EXIT
printf '%s' ${shellQuote(toBase64(message))} | base64 -d > "$msg"
git commit${all ? " -a" : ""} -F "$msg"`,
    ),
  stash: (
    path: string,
    op: "push" | "pop" | "apply" | "drop",
    index: number,
    message: string,
    untracked: boolean,
  ) => {
    if (op === "push") {
      const msg = message
        ? ` -m "$(printf '%s' ${shellQuote(toBase64(message))} | base64 -d)"`
        : "";
      return action(path, `git stash push${untracked ? " -u" : ""}${msg}`);
    }
    return action(path, `git stash ${op} ${shellQuote(`stash@{${index}}`)}`);
  },
  resetHard: (path: string, ref: string) =>
    action(path, `git reset --hard ${shellQuote(ref)} --`),
  clone: (url: string, dest: string) =>
    `exec 2>&1
${PRELUDE}d=${pathExpr(dest)}
[ -e "$d" ] && { echo "That folder already exists"; exit 1; }
git clone -- ${shellQuote(url)} "$d" && ( cd "$d" && git rev-parse --show-toplevel )
`,
};

/**
 * Pulls when the repo is clean and can fast forward. The first marker line
 * says what happened: pulled, uptodate, skipped or failed.
 */
export function autoPullScript(path: string, postCommand: string): string {
  const post = postCommand
    ? `pc=$(mktemp) || exit 1
trap 'rm -f "$pc"' EXIT
printf '%s' ${shellQuote(toBase64(postCommand))} | base64 -d > "$pc"
if out=$(bash "$pc" 2>&1 </dev/null); then
  echo "$out" | tail -n 20
else
  echo "Post command failed:"; echo "$out" | tail -n 20; exit 0
fi`
    : "";
  return `exec 2>&1
${PRELUDE}cd -- ${pathExpr(path)} 2>/dev/null || { echo "${MARK}failed"; echo "The folder is gone"; exit 0; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "${MARK}failed"; echo "That folder is not a git repo"; exit 0; }
git rev-parse --abbrev-ref '@{u}' >/dev/null 2>&1 || { echo "${MARK}skipped"; echo "The branch has no upstream"; exit 0; }
if [ -n "$(git status --porcelain --untracked-files=no | head -c1)" ]; then echo "${MARK}skipped"; echo "There are uncommitted changes"; exit 0; fi
if ! out=$(git fetch --prune 2>&1); then echo "${MARK}failed"; echo "$out" | tail -n 10; exit 0; fi
set -- $(git rev-list --left-right --count 'HEAD...@{u}')
ahead=$1; behind=$2
if [ "$behind" = 0 ]; then echo "${MARK}uptodate"; echo "Already up to date"; exit 0; fi
if [ "$ahead" != 0 ]; then echo "${MARK}skipped"; echo "The branch has diverged from its upstream"; exit 0; fi
if ! out=$(git merge --ff-only '@{u}' 2>&1); then echo "${MARK}failed"; echo "$out" | tail -n 10; exit 0; fi
echo "${MARK}pulled"
echo "Pulled $behind commit(s)"
${post}
exit 0
`;
}
