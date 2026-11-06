import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";

export const MARK = "@@";
export const RUNS_SUBDIR = ".termix-ansible/runs";
const RUNS = `$HOME/${RUNS_SUBDIR}`;
const ERR = "SCRIPT_ERR:";

export const RUN_ID_RE = /^[0-9]{13}-[a-f0-9]{6}$/;
export const FILE_RE = /^[A-Za-z0-9._/-]+$/;
export const EDITABLE_RE = /\.(ya?ml|j2|cfg|ini|json|txt|md)$/i;
export const PLAYBOOK_RE = /\.ya?ml$/i;

const PRELUDE = `export PATH="$HOME/.local/bin:$PATH:/usr/local/bin:/opt/homebrew/bin"
`;

/** Sets $P to the project folder, with ~ expanded. */
function project(dir: string): string {
  return `${PRELUDE}P=${q(dir)}
case "$P" in
  "~") P="$HOME" ;;
  "~/"*) P="$HOME/\${P:2}" ;;
esac
`;
}

/** Prints a multi line failure so scriptError can show all of it. */
const FAIL_FN = `fail() { printf '%s\\n' "$1" | head -n 20 | while IFS= read -r l; do echo "${ERR}$l"; done; exit 1; }
`;

export function cleanRelPath(value: unknown, editable = true): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim().replace(/^\.\//, "");
  if (!path || path.length > 200 || !FILE_RE.test(path)) return null;
  if (path.startsWith("-")) return null;
  const parts = path.split("/");
  if (parts.some((p) => !p || p === "." || p === ".." || p === ".git")) {
    return null;
  }
  if (editable && !EDITABLE_RE.test(path)) return null;
  return path;
}

export function statusScript(dir: string): string {
  return `${project(dir)}echo "user=$(id -un)"
echo "dir=$P"
if command -v ansible-playbook >/dev/null 2>&1; then
  echo "installed=1"
  echo "version=$(ansible --version 2>/dev/null </dev/null | head -n 1)"
fi
[ -d "$P" ] && echo "project=1"
command -v sshpass >/dev/null 2>&1 && echo "sshpass=1"
true
`;
}

export function filesScript(dir: string): string {
  return `${project(dir)}cd "$P" 2>/dev/null || exit 0
find . -maxdepth 4 \\( -name .git -o -name node_modules -o -name collections -o -name .cache \\) -prune -o -type f \\( -name '*.yml' -o -name '*.yaml' -o -name '*.j2' -o -name '*.cfg' -o -name '*.ini' -o -name '*.json' -o -name '*.txt' -o -name '*.md' \\) -print 2>/dev/null | head -n 500 | while IFS= read -r f; do
  f=\${f#./}
  case "$f" in *[!A-Za-z0-9._/-]*) continue ;; esac
  pb=0
  case "$f" in *.yml|*.yaml) grep -qE '^[[:space:]-]*hosts:' "$f" 2>/dev/null && pb=1 ;; esac
  set -- $(stat -c '%s %Y' "$f" 2>/dev/null)
  printf 'F\\t%s\\t%s\\t%s\\t%s\\n' "$f" "\${1:-0}" "\${2:-0}" "$pb"
done
true
`;
}

/** Resolves $F and refuses anything outside the project folder. */
function resolveFile(rel: string, mustExist: boolean): string {
  return `R=$(realpath -m -- "$P")
F=$(realpath -m -- "$P"/${q(rel)})
case "$F" in "$R"/*) ;; *) fail "That path is outside the project folder" ;; esac
${mustExist ? `[ -f "$F" ] || fail "That file does not exist"` : ""}
`;
}

export function readFileScript(dir: string, rel: string): string {
  return `${project(dir)}${FAIL_FN}${resolveFile(rel, true)}
[ "$(stat -c %s "$F")" -le 524288 ] || fail "That file is too large to edit here"
cat -- "$F"
`;
}

export function writeFileScript(
  dir: string,
  rel: string,
  text: string,
  check: boolean,
): string {
  return `set -e
${project(dir)}${FAIL_FN}mkdir -p "$P"
${resolveFile(rel, false)}
mkdir -p "$(dirname "$F")"
N="$F.termix-new"
umask 022
printf %s ${q(toBase64(text))} | base64 -d > "$N"
[ -f "$F" ] && chmod --reference="$F" "$N" 2>/dev/null || true
${
  check
    ? `if command -v ansible-playbook >/dev/null 2>&1; then
  out=$(cd "$R" && ansible-playbook --syntax-check -i localhost, "$N" </dev/null 2>&1) || { rm -f "$N"; fail "$out"; }
fi`
    : ""
}
mv -f "$N" "$F"
echo saved
`;
}

export function deleteFileScript(dir: string, rel: string): string {
  return `${project(dir)}${FAIL_FN}${resolveFile(rel, true)}
rm -f -- "$F"
echo deleted
`;
}

export function vaultFileCheck(file: string): string {
  return file
    ? `[ -f ${q(file)} ] || fail "The vault password file is missing"`
    : "";
}

export interface LaunchPlan {
  uid: string;
  dir: string;
  command: "ansible-playbook" | "ansible";
  /** A ready shell fragment: every user value is already quoted. */
  args: string;
  meta: string;
  inventory: string;
  vars: string;
  keys: Record<string, string>;
  /** Host key checking is off for the generated inventory only. */
  looseHostKeys: boolean;
  vaultFile: string;
}

export function launchScript(plan: LaunchPlan): string {
  const base = `${RUNS}/${plan.uid}`;
  const keyWrites = Object.entries(plan.keys)
    .map(
      ([name, text]) =>
        `printf %s ${q(toBase64(text.endsWith("\n") ? text : `${text}\n`))} | base64 -d > "$D/secret/keys/${name}"`,
    )
    .join("\n");
  const run = `#!/bin/bash
D="$1"
${project(plan.dir)}mkdir -p "$P"
cd "$P" 2>/dev/null || cd "$HOME"
trap 'rm -rf "$D/secret"' EXIT
export ANSIBLE_NOCOLOR=1 ANSIBLE_FORCE_COLOR=0 PYTHONUNBUFFERED=1
VAULT_FILE=${q(plan.vaultFile)}
case "$VAULT_FILE" in "~/"*) VAULT_FILE="$HOME/\${VAULT_FILE:2}" ;; esac
${plan.looseHostKeys ? "export ANSIBLE_HOST_KEY_CHECKING=False" : ""}
echo $$ > "$D/pid"
${plan.command} ${plan.args} </dev/null
code=$?
printf '%s %s\\n' "$code" "$(date +%s)" > "$D/result"
exit $code
`;
  return `set -e
umask 077
${PRELUDE}command -v ${plan.command} >/dev/null 2>&1 || { echo "${ERR}Ansible is not installed on this host"; exit 1; }
mkdir -p "$HOME/${RUNS_SUBDIR}"
find "$HOME/${RUNS_SUBDIR}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} + 2>/dev/null || true
D="${base}"
mkdir -p "$D/secret/keys"
printf %s ${q(toBase64(plan.meta))} | base64 -d > "$D/meta.json"
printf %s ${q(toBase64(run))} | base64 -d > "$D/run.sh"
printf %s ${q(toBase64(plan.inventory))} | base64 -d > "$D/secret/inventory.json"
printf %s ${q(toBase64(plan.vars))} | base64 -d > "$D/secret/vars.json"
${keyWrites}
sed -i "s|@@D@@|$D|g" "$D/secret/inventory.json"
: > "$D/log"
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

/** One line per run: meta, then alive and result markers. */
export function listRunsScript(): string {
  return `R="${RUNS}"
[ -d "$R" ] || exit 0
for D in $(ls -1 "$R" 2>/dev/null | sort -r | head -n 60); do
  D="$R/$D"
  [ -f "$D/meta.json" ] || continue
  echo "${MARK}run"
  tr -d '\\n' < "$D/meta.json"; echo
  p=$(cat "$D/pid" 2>/dev/null || true)
  if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "${MARK}alive"; fi
  [ -f "$D/cancelled" ] && echo "${MARK}cancelled"
  if [ -f "$D/result" ]; then echo "${MARK}result"; cat "$D/result"; fi
done
true
`;
}

export function runDetailScript(uid: string, maxBytes: number): string {
  return `D="${RUNS}/${uid}"
[ -d "$D" ] || { echo "${MARK}missing"; exit 0; }
echo "${MARK}run"
tr -d '\\n' < "$D/meta.json"; echo
p=$(cat "$D/pid" 2>/dev/null || true)
if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "${MARK}alive"; fi
[ -f "$D/cancelled" ] && echo "${MARK}cancelled"
if [ -f "$D/result" ]; then echo "${MARK}result"; cat "$D/result"; fi
echo "${MARK}size"
wc -c < "$D/log" | tr -d ' '
echo "${MARK}log"
tail -c ${maxBytes} "$D/log" 2>/dev/null | tr -d '\\r'
`;
}

export function cancelScript(uid: string): string {
  return `D="${RUNS}/${uid}"
p=$(cat "$D/pid" 2>/dev/null || true)
[ -n "$p" ] || { echo none; exit 0; }
kill -0 "$p" 2>/dev/null || { echo done; exit 0; }
: > "$D/cancelled"
kill -TERM -- "-$p" 2>/dev/null || kill -TERM "$p" 2>/dev/null || true
echo sent
`;
}

export function removeRunScript(uid: string): string {
  return `D="${RUNS}/${uid}"
p=$(cat "$D/pid" 2>/dev/null || true)
if [ -n "$p" ] && kill -0 "$p" 2>/dev/null; then echo "${ERR}Stop the run first"; exit 1; fi
rm -rf "$D"
echo removed
`;
}
