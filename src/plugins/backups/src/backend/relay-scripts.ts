import { shellQuote, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import type { OverwritePolicy } from "../shared/types.js";
import { exportLines, type Env } from "./repo-env.js";
import {
  BASE_DIR,
  HELPERS,
  MARK,
  NEED_RESTIC,
  PATH_LINE,
  RUNS_DIR,
  STAGE_DIR,
  dumpLines,
  withRepo,
  type DumpPlan,
} from "./scripts.js";

// Scripts for jobs whose files are read from one host and backed up with
// restic on another. Termix carries a tar stream between the two over SSH, so
// the source host needs only tar and the hosts never talk to each other.

const q = shellQuote;

/** Per job, on both hosts: the copy and its state on the restic host, tar's state on the source. */
export const PULL_DIR = `${BASE_DIR}/pull`;

export function pullDir(jobUid: string): string {
  return `${PULL_DIR}/${jobUid}`;
}

/** tar's state for the job on the source host. */
export function sourceStateDir(jobUid: string): string {
  return `${pullDir(jobUid)}/src`;
}

/** The copy of the source host's files on the restic host. */
export function pullRoot(jobUid: string): string {
  return `${pullDir(jobUid)}/root`;
}

/** Paths relative to /, so restic stores them as they were on the source. */
export function relativePaths(paths: string[]): string[] {
  const rels = paths.map(
    (p) => p.replace(/^\/+/, "").replace(/\/+$/, "") || ".",
  );
  if (rels.includes(".")) return ["."];
  return [...new Set(rels)];
}

/** restic exclude patterns as GNU tar options, so excluded files are not copied. */
export function tarExcludes(patterns: string[]): string[] {
  const args: string[] = [];
  let anchored: boolean | null = null;
  for (const raw of patterns) {
    if (raw.startsWith("!")) continue;
    const isAnchored = raw.startsWith("/");
    const pattern = raw
      .replace(/^\/+/, "")
      .replace(/\*\*/g, "*")
      .replace(/\/+$/, "");
    if (!pattern) continue;
    if (anchored !== isAnchored) {
      args.push(isAnchored ? "--anchored" : "--no-anchored");
      anchored = isAnchored;
    }
    args.push(`--exclude=${pattern}`);
  }
  return args;
}

/** restic matches excludes on the restic host's paths: absolute ones move under the copy. */
export function resticExcludes(patterns: string[], root: string): string[] {
  return patterns.map((p) => {
    const negate = p.startsWith("!");
    const body = negate ? p.slice(1) : p;
    const moved = body.startsWith("/") ? `${root}${body}` : body;
    return negate ? `!${moved}` : moved;
  });
}

/** Snapshot paths as they were on the source host. */
export function sourcePath(path: string, root: string): string {
  if (path === root) return "/";
  return path.startsWith(`${root}/`) ? path.slice(root.length) : path;
}

/** Runs a bash script as root, or through passwordless sudo, with stdin left free for data. */
export function rootBash(script: string): string {
  const inner = `if [ "$(id -u)" = 0 ]; then exec bash -c ${q(script)}; else exec sudo -n bash -c ${q(script)}; fi`;
  return `sh -c ${q(inner)}`;
}

/** What a host can do for a copy, and the copy state it holds for the job. */
export function probeScript(genFile: string, needRestic: boolean): string {
  return `${needRestic ? NEED_RESTIC : PATH_LINE}
if tar --version 2>/dev/null | head -n 1 | grep -q 'GNU tar'; then echo gnu=1; else echo gnu=0; fi
command -v tar >/dev/null 2>&1 && echo tar=1 || echo tar=0
echo "gen=$(head -c 200 ${q(genFile)} 2>/dev/null | tr -d '\\n')"
`;
}

export interface RelaySourcePlan {
  uid: string;
  jobUid: string;
  /** Relative to /. */
  paths: string[];
  /** restic patterns, used by GNU tar. */
  excludes: string[];
  dumps: DumpPlan[];
  stopStacks: string[];
  oneFileSystem: boolean;
  pre: string;
  post: string;
  /** GNU tar on the source host. */
  gnu: boolean;
  /** Send only what changed since the last copy (GNU tar on both hosts). */
  incremental: boolean;
  /** Start over: the last copy is gone or does not match. */
  full: boolean;
  /** Saved on both hosts after a good copy, so the next one can build on it. */
  gen: string;
}

/**
 * Runs on the source host. Dumps databases, stops stacks, runs the pre
 * command, then writes a tar of the paths to stdout. The log, the result and
 * the paths that were found go to stderr at the end.
 */
export function relaySourceScript(plan: RelaySourcePlan, env: Env): string {
  // Not the run's folder, so a copy within one host can't clash with the receiver.
  const dir = `${RUNS_DIR}/${plan.uid}-src`;
  const stage = `${STAGE_DIR}/${plan.jobUid}`;
  const state = sourceStateDir(plan.jobUid);
  const gnuArgs = plan.gnu
    ? [
        "--numeric-owner",
        "--ignore-failed-read",
        ...(plan.oneFileSystem ? ["--one-file-system"] : []),
        ...tarExcludes(plan.excludes).map(q),
        ...(plan.incremental ? [`--listed-incremental="$D/snar"`] : []),
        "$VF",
      ].join(" ")
    : "";
  const files: Array<[string, string]> = [
    ["paths", plan.paths.join("\n") + "\n"],
  ];
  if (plan.pre) files.push(["pre.sh", plan.pre]);
  if (plan.post) files.push(["post.sh", plan.post]);
  return `main() {
umask 077
D=${q(dir)}
rm -rf "$D"
mkdir -p "$D" ${q(state)}
exec 3>&1 1>&2
${HELPERS}
${files.map(([name, text]) => `printf %s '${toBase64(text)}' | base64 -d > "$D/${name}"`).join("\n")}
${exportLines(env)}
cd /
finish() {
  trap - EXIT TERM INT HUP
  trap "" PIPE
  for s in $STOPPED; do
    log "Starting stack $s"
    services=$(cat "$D/stack-$s" 2>/dev/null)
    [ -n "$services" ] || continue
    docker compose -p "$s" start $services >> "$D/log" 2>&1 || log "Could not start stack $s"
  done
  rm -rf ${q(stage)}
  if [ -s "$D/post.sh" ]; then
    log "Running the post command"
    TERMIX_BACKUP_STATUS="$STATUS" bash "$D/post.sh" >> "$D/log" 2>&1 || log "The post command failed"
  fi
  {
    tail -c 60000 "$D/log" 2>/dev/null
    echo "${MARK}result"
    echo "status=$STATUS"
    echo "code=$CODE"
    echo "message=$MSG"
    echo "${MARK}present"
    cat "$D/present" 2>/dev/null
  } >&2
  rm -rf "$D"
}
trap finish EXIT
trap 'STATUS=canceled; CODE=130; MSG=Canceled; exit 130' TERM INT HUP PIPE
log "Copy started on the source host"
if [ -s "$D/pre.sh" ]; then
  log "Running the pre command"
  bash "$D/pre.sh" >> "$D/log" 2>&1 || fail "The pre command failed"
fi
${
  plan.dumps.length
    ? `mkdir -p ${q(`${stage}/databases`)}
chmod 700 ${q(stage)}
${plan.dumps.map((dump) => dumpLines(dump, stage)).join("\n")}`
    : ""
}
${plan.stopStacks
  .map(
    (s) => `log ${q(`Stopping stack ${s}`)}
docker compose -p ${q(s)} ps --services --status running > ${q(`$D/stack-${s}`).replace(/'/g, '"')} 2>> "$D/log"
STOPPED="$STOPPED ${s}"
docker compose -p ${q(s)} stop >> "$D/log" 2>&1 || fail ${q(`Could not stop stack ${s}`)}`,
  )
  .join("\n")}
command -v tar >/dev/null 2>&1 || fail "tar is not installed on the source host"
: > "$D/present"
while IFS= read -r p; do
  [ -n "$p" ] || continue
  if [ -e "/$p" ] || [ -L "/$p" ]; then printf '%s\\n' "$p" >> "$D/present"
  else log "/$p does not exist, skipping"; fi
done < "$D/paths"
[ -s "$D/present" ] || fail "None of the paths exist on the source host"
${plan.full ? `rm -f ${q(`${state}/snar`)} ${q(`${state}/gen`)}` : ""}
${plan.incremental && !plan.full ? `cp -f ${q(`${state}/snar`)} "$D/snar" 2>/dev/null || true` : ""}
VF=
${plan.gnu ? `tar --help 2>/dev/null | grep -q -- --verbatim-files-from && VF=--verbatim-files-from` : ""}
log "Sending the files"
tar -c -f - -C / ${gnuArgs} -T "$D/present" >&3 2>> "$D/log"
CODE=$?
case "$CODE" in
  0) STATUS=success ;;
${plan.gnu ? `  1) STATUS=warning; MSG="Some files changed while they were copied" ;;\n` : ""}  *) fail "tar failed on the source host with exit code $CODE" ;;
esac
if [ "$STATUS" = success ] && grep -q 'Cannot open\\|Cannot read\\|Permission denied' "$D/log"; then
  STATUS=warning
  MSG="Some files could not be read on the source host"
fi
${
  plan.incremental
    ? `mv -f "$D/snar" ${q(`${state}/snar`)} && printf '%s' ${q(plan.gen)} > ${q(`${state}/gen`)}`
    : ""
}
CODE=0
log "Files sent"
exit 0
}
main </dev/null
`;
}

/** Writes the run folder and the receive script on the restic host. Holds no secret. */
export function receivePrepScript(uid: string, receive: string): string {
  return `set -e
umask 077
D=${q(`${RUNS_DIR}/${uid}`)}
mkdir -p "$D" ${q(PULL_DIR)}
chmod 700 ${q(PULL_DIR)}
: > "$D/copying"
printf %s '${toBase64(receive)}' | base64 -d > "$D/receive.sh"
echo ready
`;
}

export interface ReceivePlan {
  uid: string;
  jobUid: string;
  gnu: boolean;
  incremental: boolean;
  full: boolean;
  gen: string;
}

/** Unpacks the tar stream from stdin into the job's copy on the restic host. */
export function receiveScript(plan: ReceivePlan): string {
  const dir = pullDir(plan.jobUid);
  const root = pullRoot(plan.jobUid);
  const flags = [
    plan.gnu ? "--numeric-owner" : "",
    plan.incremental ? "--listed-incremental=/dev/null" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `#!/bin/bash
${PATH_LINE}
umask 077
D=${q(`${RUNS_DIR}/${plan.uid}`)}
mkdir -p ${q(dir)}
chmod 700 ${q(dir)}
rm -f ${q(`${dir}/gen`)}
${plan.full ? `rm -rf ${q(root)}` : ""}
mkdir -p ${q(root)}
cd ${q(root)} || exit 1
# Folders tar makes for parents of the paths get normal modes.
umask 022
tar -x -f - ${flags} 2>> "$D/receive.log"
c=$?
if [ "$c" != 0 ]; then
  tail -c 1500 "$D/receive.log" >&2
  echo "${MARK}message=Unpacking the files on the restic host failed" >&2
  exit 1
fi
${plan.gnu ? `printf '%s' ${q(plan.gen)} > ${q(`${dir}/gen`)}` : ""}
exit 0
`;
}

/** Streams a snapshot path from the restic host: a tar for a folder, the bytes for a file. */
export function relayDumpScript(
  env: Env,
  snapshot: string,
  path: string,
): string {
  return withRepo(
    env,
    `exec restic dump --no-lock --archive tar ${q(snapshot)} ${q(path)}`,
  );
}

/** Unpacks a tar from stdin into the restore folder on the target host. */
export function restoreTarSink(
  target: string,
  overwrite: OverwritePolicy,
  gnu: boolean,
): string {
  const flags = gnu
    ? [
        "--numeric-owner",
        overwrite === "never" ? "--skip-old-files" : "",
        overwrite === "if-newer" ? "--keep-newer-files" : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";
  return rootBash(
    `${PATH_LINE}\nmkdir -p ${q(target)} && cd ${q(target)} && exec tar -x -f - ${flags}`,
  );
}

/** Writes one file from stdin to its place under the restore folder. */
export function restoreFileSink(
  target: string,
  path: string,
  overwrite: OverwritePolicy,
): string {
  const file = `${target.replace(/\/+$/, "")}${path}`;
  return rootBash(`F=${q(file)}
mkdir -p "$(dirname "$F")" || exit 1
${overwrite === "never" ? `if [ -e "$F" ]; then cat > /dev/null; exit 0; fi` : ""}
exec cat > "$F"`);
}

/** What a target host has for a restore through Termix. */
export const RESTORE_PROBE_SCRIPT = `${PATH_LINE}
if tar --version 2>/dev/null | head -n 1 | grep -q 'GNU tar'; then echo gnu=1; else echo gnu=0; fi
command -v tar >/dev/null 2>&1 && echo tar=1 || echo tar=0
`;

/** Splits the source script's stderr into its log, result and the paths it found. */
export function parseSourceOutput(text: string): {
  log: string;
  status: string | null;
  message: string;
  present: string[];
} {
  const resultAt = text.lastIndexOf(`${MARK}result\n`);
  if (resultAt < 0) {
    return { log: text, status: null, message: "", present: [] };
  }
  const log = text.slice(0, resultAt);
  const rest = text.slice(resultAt + `${MARK}result\n`.length);
  const presentAt = rest.indexOf(`${MARK}present\n`);
  const head = presentAt < 0 ? rest : rest.slice(0, presentAt);
  const present =
    presentAt < 0
      ? []
      : rest
          .slice(presentAt + `${MARK}present\n`.length)
          .split("\n")
          .filter(Boolean);
  const keys: Record<string, string> = {};
  for (const line of head.split("\n")) {
    const at = line.indexOf("=");
    if (at > 0) keys[line.slice(0, at)] = line.slice(at + 1);
  }
  return {
    log,
    status: keys.status ?? null,
    message: keys.message ?? "",
    present,
  };
}
