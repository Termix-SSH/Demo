import {
  errLine,
  shellQuote,
  toBase64,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { KeepPolicy, OverwritePolicy } from "../shared/types.js";
import { exportLines, type Env } from "./repo-env.js";

// Bash parameter expansions inside these template literals are escaped as
// \${...} so TypeScript leaves them alone.

const q = shellQuote;

export const BASE_DIR = "/var/lib/termix-backups";
export const RUNS_DIR = `${BASE_DIR}/runs`;
export const STAGE_DIR = `${BASE_DIR}/staging`;
/** Marks the start of a section in script output. */
export const MARK = "@@termix:";

/** The release downloaded when the package manager has no restic 0.17+. */
export const RESTIC_PIN = {
  version: "0.19.1",
  sha256: {
    amd64: "f415415624dcc452f2a02b8c33641791a8c6d6d3b65bbb3543fcf9a25151585c",
    arm64: "a5f64aaab53d51e311fa3829124c5b703f2d14cf187d8640b6be3b2b49376465",
    arm: "1edc5f67b0dd0d028586ab28c34b4da7522eabce933b3f6cd04f9ea184c2a502",
    "386": "c715a3de2fffb70a4c7864ef2d195db8bad96bc0284757cd5bd0f43362f2a191",
  } as Record<string, string>,
};

const PATH_LINE = `export PATH="$PATH:/usr/local/bin:/usr/local/sbin:/usr/sbin:/sbin"`;

const PM = `pm=none
for c in apt-get dnf yum pacman apk zypper; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done`;

/** Exits 0 when restic is 0.17 or newer. */
const RESTIC_OK = `restic_ok() {
  v=$(restic version 2>/dev/null | awk '{print $2}')
  [ -n "$v" ] && printf '%s' "$v" | awk -F. '{ exit !($1 > 0 || $2 >= 17) }'
}`;

export const STATUS_SCRIPT = `${PATH_LINE}
echo "kernel=$(uname -s 2>/dev/null)"
echo "arch=$(uname -m 2>/dev/null)"
if { [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; }; then echo root=1; else echo root=0; fi
. /etc/os-release 2>/dev/null
echo "os=$PRETTY_NAME"
${PM}
echo "pm=$pm"
${RESTIC_OK}
echo "restic=$(restic version 2>/dev/null | awk '{print $2}')"
if restic_ok; then echo restic_ok=1; else echo restic_ok=0; fi
echo "rclone=$(rclone version 2>/dev/null | head -n1 | awk '{print $2}')"
command -v docker >/dev/null 2>&1 && echo docker=1 || echo docker=0
{ command -v mysqldump || command -v mariadb-dump; } >/dev/null 2>&1 && echo mysqldump=1 || echo mysqldump=0
command -v pg_dump >/dev/null 2>&1 && echo pg_dump=1 || echo pg_dump=0
command -v sqlite3 >/dev/null 2>&1 && echo sqlite3=1 || echo sqlite3=0
`;

function pinCases(): string {
  return Object.entries(RESTIC_PIN.sha256)
    .map(([arch, sha]) => `  ${arch}) sha=${sha} ;;`)
    .join("\n");
}

export const INSTALL_SCRIPT = `${PATH_LINE}
${PM}
${RESTIC_OK}
if ! restic_ok; then
  case "$pm" in
    apt-get) export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq restic bzip2 >/dev/null 2>&1 || true ;;
    dnf) dnf install -y -q restic bzip2 >/dev/null 2>&1 || true ;;
    yum) yum install -y -q restic bzip2 >/dev/null 2>&1 || true ;;
    pacman) pacman -S --noconfirm --needed restic bzip2 >/dev/null 2>&1 || true ;;
    apk) apk add -q restic bzip2 >/dev/null 2>&1 || true ;;
    zypper) zypper --non-interactive install restic bzip2 >/dev/null 2>&1 || true ;;
  esac
fi
if ! restic_ok; then
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    armv6l|armv7l) arch=arm ;;
    i386|i686) arch=386 ;;
    *) ${errLine("No restic download for this CPU")}; exit 5 ;;
  esac
  case "$arch" in
${pinCases()}
  esac
  command -v bunzip2 >/dev/null 2>&1 || { ${errLine("bzip2 is needed to unpack restic")}; exit 5; }
  url="https://github.com/restic/restic/releases/download/v${RESTIC_PIN.version}/restic_${RESTIC_PIN.version}_linux_$arch.bz2"
  tmp=$(mktemp -d)
  if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$tmp/restic.bz2" "$url" || true
  elif command -v wget >/dev/null 2>&1; then wget -q -O "$tmp/restic.bz2" "$url" || true
  else ${errLine("curl or wget is needed to download restic")}; rm -rf "$tmp"; exit 5; fi
  if ! echo "$sha  $tmp/restic.bz2" | sha256sum -c - >/dev/null 2>&1; then
    rm -rf "$tmp"; ${errLine("The restic download did not match its checksum")}; exit 6
  fi
  bunzip2 "$tmp/restic.bz2"
  install -m 0755 "$tmp/restic" /usr/local/bin/restic
  rm -rf "$tmp"
fi
if ! restic_ok; then ${errLine("restic is still missing or older than 0.17")}; exit 6; fi
mkdir -p ${RUNS_DIR} ${STAGE_DIR}
chmod 700 ${BASE_DIR}
echo "version=$(restic version | awk '{print $2}')"
`;

export const INSTALL_RCLONE_SCRIPT = `${PATH_LINE}
${PM}
if ! command -v rclone >/dev/null 2>&1; then
  case "$pm" in
    apt-get) export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq rclone >/dev/null 2>&1 ;;
    dnf) dnf install -y -q rclone >/dev/null 2>&1 ;;
    yum) yum install -y -q rclone >/dev/null 2>&1 ;;
    pacman) pacman -S --noconfirm --needed rclone >/dev/null 2>&1 ;;
    apk) apk add -q rclone >/dev/null 2>&1 ;;
    zypper) zypper --non-interactive install rclone >/dev/null 2>&1 ;;
  esac
fi
command -v rclone >/dev/null 2>&1 || { ${errLine("Could not install rclone with the package manager")}; exit 5; }
echo "version=$(rclone version | head -n1 | awk '{print $2}')"
`;

const NEED_RESTIC = `${PATH_LINE}
command -v restic >/dev/null 2>&1 || { ${errLine("restic is not installed on this host")}; exit 7; }`;

/** A short command with the repository open. Secrets come from the export lines. */
export function withRepo(env: Env, body: string): string {
  return `${NEED_RESTIC}
${exportLines(env)}
cd /
${body}
`;
}

export function snapshotsScript(env: Env, tag: string): string {
  return withRepo(
    env,
    `restic snapshots --json --no-lock --tag ${q(tag)} 2>&1 || { ${errLine("Could not read the snapshots")}; exit 1; }`,
  );
}

export function lsScript(env: Env, snapshot: string, dir: string): string {
  return withRepo(
    env,
    `restic ls --json --no-lock ${q(snapshot)} ${q(dir)} 2>&1 || { ${errLine("Could not list the snapshot")}; exit 1; }`,
  );
}

/** Streams a file, or a folder as zip, to stdout. */
export function dumpScript(
  env: Env,
  snapshot: string,
  path: string,
  folder: boolean,
): string {
  const archive = folder ? "--archive zip " : "";
  return withRepo(
    env,
    `exec restic dump --no-lock ${archive}${q(snapshot)} ${q(path)}`,
  );
}

export function forgetSnapshotScript(env: Env, snapshot: string): string {
  return withRepo(
    env,
    `restic forget --prune ${q(snapshot)} 2>&1 || { ${errLine("Could not remove the snapshot")}; exit 1; }`,
  );
}

/** Opens the repository, or makes it when `init` is set and it does not exist. */
export function testRepoScript(env: Env, init: boolean): string {
  return withRepo(
    env,
    `if restic cat config --no-lock >/dev/null 2>/tmp/termix-backups-test.$$; then
  rm -f /tmp/termix-backups-test.$$
  echo ok=1
  exit 0
fi
out=$(tail -c 1500 /tmp/termix-backups-test.$$); rm -f /tmp/termix-backups-test.$$
${
  init
    ? `if restic init >/dev/null 2>/tmp/termix-backups-init.$$; then rm -f /tmp/termix-backups-init.$$; echo init=1; exit 0; fi
out=$(tail -c 1500 /tmp/termix-backups-init.$$); rm -f /tmp/termix-backups-init.$$`
    : ""
}
echo ok=0
echo "${MARK}error"
printf '%s\\n' "$out"
exit 0`,
  );
}

export const DOCKER_SCRIPT = `${PATH_LINE}
command -v docker >/dev/null 2>&1 || { echo "${MARK}nodocker"; exit 0; }
echo "${MARK}volumes"
vols=$(docker volume ls -q 2>/dev/null)
if [ -n "$vols" ]; then
  docker volume inspect -f '{{.Name}}|{{.Mountpoint}}|{{index .Labels "com.docker.compose.project"}}' $vols 2>/dev/null
fi
echo "${MARK}stacks"
docker compose ls -a --format json 2>/dev/null
exit 0
`;

export interface DumpPlan {
  /** Names the dump file, safe for a path. */
  file: string;
  engine: "mysql" | "postgres" | "sqlite";
  address: string;
  port: number | null;
  username: string;
  /** Name of the env value with the password, or null. */
  passwordEnv: string | null;
  runAs: string;
  /** Empty dumps every database. For SQLite, the file paths. */
  databases: string[];
}

export interface BackupPlan {
  uid: string;
  jobUid: string;
  paths: string[];
  excludes: string[];
  dumps: DumpPlan[];
  stopStacks: string[];
  oneFileSystem: boolean;
  keep: KeepPolicy;
  pre: string;
  post: string;
}

export interface RestorePlan {
  uid: string;
  snapshot: string;
  target: string;
  includes: string[];
  overwrite: OverwritePolicy;
}

const COMMON = `D="$1"
echo $$ > "$D/pid"
${PATH_LINE}
STATUS=failed
CODE=1
MSG=
STOPPED=
log() { printf '%s %s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >> "$D/log"; }
fail() { MSG="$1"; log "$1"; exit 1; }
as_user() {
  u="$1"; shift
  if [ -z "$u" ] || [ "$u" = root ]; then "$@"
  elif command -v runuser >/dev/null 2>&1; then runuser -u "$u" -- "$@"
  else sudo -n -E -u "$u" -- "$@"; fi
}
# Keeps the last restic status line, the summary and the first errors.
restic_json() {
  n=0
  while IFS= read -r line; do
    case "$line" in
      *'"message_type":"status"'*) printf '%s\\n' "$line" > "$D/progress.tmp" && mv -f "$D/progress.tmp" "$D/progress" ;;
      *'"message_type":"summary"'*) printf '%s\\n' "$line" > "$D/summary" ;;
      *'"message_type":"error"'*) n=$((n + 1)); [ "$n" -le 50 ] && printf '%s\\n' "$line" >> "$D/errors" ;;
      *) [ -n "$line" ] && printf '%s\\n' "$line" >> "$D/log" ;;
    esac
  done
}
open_repo() {
  restic unlock >> "$D/log" 2>&1 || true
  if ! err=$(restic cat config --no-lock 2>&1 >/dev/null); then
    printf '%s
' "$err" >> "$D/log"
    case "$err" in
      *"wrong password"*) fail "The repository password is wrong" ;;
    esac
    log "Setting up the repository"
    restic init >> "$D/log" 2>&1 || fail "Could not open or set up the repository"
  fi
}
set -o pipefail`;

const FINISH_START = `finish() {
  trap - EXIT TERM INT`;

const FINISH_END = `  { echo "status=$STATUS"; echo "code=$CODE"; echo "message=$MSG"; } > "$D/result.tmp"
  mv -f "$D/result.tmp" "$D/result"
}
trap finish EXIT
trap 'STATUS=canceled; CODE=130; MSG=Canceled; exit 130' TERM INT`;

function dumpLines(dump: DumpPlan, stage: string): string {
  const out = `${stage}/databases/${dump.file}`;
  const host = [
    dump.address ? `-h ${q(dump.address)}` : "",
    dump.port ? `-P ${dump.port}` : "",
  ];
  const lines: string[] = [];
  if (dump.engine === "sqlite") {
    dump.databases.forEach((file, i) => {
      lines.push(
        `log ${q(`Copying SQLite ${file}`)}`,
        `[ -f ${q(file)} ] || fail ${q(`SQLite file ${file} was not found`)}`,
        `sqlite3 ${q(file)} ${q(`.backup ${out}-${i + 1}.sqlite`)} >> "$D/log" 2>&1 || fail ${q(`Copying SQLite ${file} failed`)}`,
      );
    });
    return lines.join("\n");
  }
  const pw = dump.passwordEnv ? `"\${${dump.passwordEnv}:-}"` : "";
  if (dump.engine === "mysql") {
    const user = dump.username ? `-u ${q(dump.username)}` : "";
    const what = dump.databases.length
      ? `--databases ${dump.databases.map(q).join(" ")}`
      : "--all-databases";
    lines.push(
      `log ${q(`Dumping MySQL ${dump.databases.join(", ") || "all databases"}`)}`,
      `DUMP=$(command -v mysqldump || command -v mariadb-dump) || fail "mysqldump is not installed"`,
      pw ? `export MYSQL_PWD=${pw}` : "unset MYSQL_PWD",
      `as_user ${q(dump.runAs)} "$DUMP" --single-transaction --quick --routines --events --triggers ${host.join(" ")} ${user} ${what} > ${q(`${out}.sql`)} 2>> "$D/log" || fail "The MySQL dump failed"`,
      "unset MYSQL_PWD",
    );
    return lines.join("\n");
  }
  const pgHost = [
    dump.address ? `-h ${q(dump.address)}` : "",
    dump.port ? `-p ${dump.port}` : "",
    dump.username ? `-U ${q(dump.username)}` : "",
  ].join(" ");
  lines.push(
    `command -v pg_dump >/dev/null 2>&1 || fail "pg_dump is not installed"`,
    pw ? `export PGPASSWORD=${pw}` : "unset PGPASSWORD",
  );
  if (dump.databases.length === 0) {
    lines.push(
      `log "Dumping all PostgreSQL databases"`,
      `as_user ${q(dump.runAs)} pg_dumpall -w ${pgHost} > ${q(`${out}-all.sql`)} 2>> "$D/log" || fail "The PostgreSQL dump failed"`,
    );
  } else {
    dump.databases.forEach((db, i) => {
      lines.push(
        `log ${q(`Dumping PostgreSQL ${db}`)}`,
        `as_user ${q(dump.runAs)} pg_dump -w -Fc ${pgHost} -d ${q(db)} > ${q(`${out}-${i + 1}.dump`)} 2>> "$D/log" || fail ${q(`The PostgreSQL dump of ${db} failed`)}`,
      );
    });
  }
  lines.push("unset PGPASSWORD");
  return lines.join("\n");
}

function keepFlags(keep: KeepPolicy): string {
  return [
    keep.last ? `--keep-last ${keep.last}` : "",
    keep.daily ? `--keep-daily ${keep.daily}` : "",
    keep.weekly ? `--keep-weekly ${keep.weekly}` : "",
    keep.monthly ? `--keep-monthly ${keep.monthly}` : "",
    keep.yearly ? `--keep-yearly ${keep.yearly}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/** The script that runs on the host for one backup. Holds no secret. */
export function backupRunScript(plan: BackupPlan): string {
  // Per job, not per run: restic finds its parent snapshot by the path list.
  const stage = `${STAGE_DIR}/${plan.jobUid}`;
  const tag = `termix-job:${plan.jobUid}`;
  const keep = keepFlags(plan.keep);
  return `#!/bin/bash
${COMMON}
${FINISH_START}
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
${FINISH_END}
log "Backup started"
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
    // Only what runs now is started again, not services that were already off.
    (s) => `log ${q(`Stopping stack ${s}`)}
docker compose -p ${q(s)} ps --services --status running > ${q(`$D/stack-${s}`).replace(/'/g, '"')} 2>> "$D/log"
STOPPED="$STOPPED ${s}"
docker compose -p ${q(s)} stop >> "$D/log" 2>&1 || fail ${q(`Could not stop stack ${s}`)}`,
  )
  .join("\n")}
open_repo
log "Backing up"
restic backup --json --tag termix --tag ${q(tag)}${plan.oneFileSystem ? " --one-file-system" : ""}${plan.excludes.length ? ` --exclude-file "$D/excludes"` : ""} --files-from-verbatim "$D/paths" 2>> "$D/log" | restic_json
CODE=\${PIPESTATUS[0]}
case "$CODE" in
  0)
    STATUS=success
    # restic skips a missing path and still exits 0.
    if grep -q 'does not exist, skipping' "$D/log"; then
      STATUS=warning
      MSG="Some paths do not exist on this host"
    fi
    ;;
  3) STATUS=warning; MSG="Some files could not be read" ;;
  *) fail "restic backup failed with exit code $CODE" ;;
esac
log "Backup saved"
${
  keep
    ? `log "Removing old snapshots"
if ! restic forget --tag ${q(tag)} --group-by '' ${keep} --prune >> "$D/log" 2>&1; then
  STATUS=warning
  MSG="The backup is saved, but removing old snapshots failed"
fi`
    : ""
}
exit 0
`;
}

/** The script that runs on the host for one restore. Holds no secret. */
export function restoreRunScript(plan: RestorePlan): string {
  return `#!/bin/bash
${COMMON}
${FINISH_START}
${FINISH_END}
log ${q(`Restoring ${plan.snapshot} to ${plan.target}`)}
mkdir -p ${q(plan.target)}
restic restore ${q(plan.snapshot)} --json --target ${q(plan.target)} --overwrite ${plan.overwrite}${plan.includes.length ? ` --include-file "$D/includes"` : ""} 2>> "$D/log" | restic_json
CODE=\${PIPESTATUS[0]}
[ "$CODE" = 0 ] || fail "restic restore failed with exit code $CODE"
STATUS=success
log "Restore done"
exit 0
`;
}

export interface LaunchFiles {
  "run.sh": string;
  paths?: string;
  excludes?: string;
  includes?: string;
  "pre.sh"?: string;
  "post.sh"?: string;
}

/**
 * Writes the run's files and starts it in its own session, so it outlives the
 * SSH connection. Secrets are exported here and inherited, never written.
 */
export function launchScript(
  uid: string,
  files: LaunchFiles,
  env: Env,
): string {
  const dir = `${RUNS_DIR}/${uid}`;
  const writes = Object.entries(files)
    .filter(([, text]) => text)
    .map(
      ([file, text]) =>
        `printf %s '${toBase64(text!)}' | base64 -d > "$D/${file}"`,
    )
    .join("\n");
  return `set -e
umask 077
${NEED_RESTIC}
find ${RUNS_DIR} -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} + 2>/dev/null || true
D=${q(dir)}
mkdir -p "$D"
${writes}
${exportLines(env)}
cd /
if command -v setsid >/dev/null 2>&1; then
  setsid bash "$D/run.sh" "$D" </dev/null >>"$D/log" 2>&1 &
else
  nohup bash "$D/run.sh" "$D" </dev/null >>"$D/log" 2>&1 &
fi
i=0
while [ ! -s "$D/pid" ] && [ "$i" -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
echo started
`;
}

export function pollScript(uids: string[]): string {
  return `for u in ${uids.map(q).join(" ")}; do
  D="${RUNS_DIR}/$u"
  echo "${MARK}run=$u"
  if [ ! -d "$D" ]; then echo "${MARK}missing"; continue; fi
  p=$(cat "$D/pid" 2>/dev/null || true)
  if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "${MARK}alive"; fi
  if [ -f "$D/result" ]; then echo "${MARK}result"; cat "$D/result"; fi
  if [ -f "$D/progress" ]; then echo "${MARK}progress"; tail -n 1 "$D/progress"; fi
  if [ -f "$D/summary" ]; then echo "${MARK}summary"; tail -n 1 "$D/summary"; fi
  if [ -f "$D/errors" ]; then echo "${MARK}errors"; head -n 20 "$D/errors"; fi
  echo "${MARK}log"
  tail -c 8000 "$D/log" 2>/dev/null | tr -d '\\r'
  echo
done
echo "${MARK}end"
`;
}

export function cleanupScript(uids: string[]): string {
  return `for u in ${uids.map(q).join(" ")}; do rm -rf "${RUNS_DIR}/$u"; done
echo done
`;
}

export function cancelScript(uid: string): string {
  return `D=${q(`${RUNS_DIR}/${uid}`)}
p=$(cat "$D/pid" 2>/dev/null || true)
[ -n "$p" ] || { echo none; exit 0; }
kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
echo sent
`;
}
