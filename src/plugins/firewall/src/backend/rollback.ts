import type { BackendModule } from "./backends/types.js";
import { PENDING_DIR } from "./paths.js";
import { writeFile } from "./shell.js";

const TOKEN_RE = /^[a-f0-9]{12,32}$/;

function dirOf(token: string): string {
  if (!TOKEN_RE.test(token)) throw new Error("Bad rollback token");
  return `${PENDING_DIR}/${token}`;
}

function cancel(token: string): string {
  return `
S=$(sed -n 's/^sched=//p' "$DIR/sched" 2>/dev/null)
if [ "$S" = systemd ]; then
  systemctl stop termix-fw-revert-${token}.timer >/dev/null 2>&1
  systemctl stop termix-fw-revert-${token}.service >/dev/null 2>&1
fi
case "$S" in pid:*) P=$(echo "$S" | cut -d: -f2); kill -- "-$P" 2>/dev/null || kill "$P" 2>/dev/null ;; esac
`;
}

/**
 * Backs up the firewall, schedules the host to put it back after `seconds`,
 * then runs the change. The undo runs on the host, so it still happens when
 * the change cuts the SSH connection. A change that fails is undone at once.
 */
export function armScript(
  module: BackendModule,
  token: string,
  seconds: number,
  change: string,
): string {
  const dir = dirOf(token);
  const revert = `#!/bin/sh
# Written by Termix. Puts the firewall back as it was before a change.
DIR=${dir}
${module.restore}
rm -rf "$DIR"
`;
  return `
DIR=${dir}
mkdir -p "$DIR" && chmod 700 "$DIR" || exit 1
${module.backup}
${writeFile("$DIR/revert.sh", revert, "700")}
if command -v systemd-run >/dev/null 2>&1 && [ -d /run/systemd/system ]; then
  if systemd-run --quiet --unit=termix-fw-revert-${token} --on-active=${seconds}s --timer-property=AccuracySec=1s /bin/sh "$DIR/revert.sh" >/dev/null 2>&1; then
    echo "sched=systemd" > "$DIR/sched"
  fi
fi
if [ ! -f "$DIR/sched" ]; then
  if command -v setsid >/dev/null 2>&1; then
    setsid sh -c "sleep ${seconds}; sh '$DIR/revert.sh'" </dev/null >/dev/null 2>&1 &
  else
    nohup sh -c "sleep ${seconds}; sh '$DIR/revert.sh'" </dev/null >/dev/null 2>&1 &
  fi
  echo "sched=pid:$!" > "$DIR/sched"
fi
echo "@@armed@@"
termix_change() {
${change.trim() || ":"}
}
if ! ( termix_change ); then
  ${cancel(token).trim().split("\n").join("\n  ")}
  sh "$DIR/revert.sh"
  echo "@@reverted@@"
  exit 1
fi
echo "@@applied@@"
exit 0
`;
}

/** Stops the timer and drops the backup, so the change stays. */
export function keepScript(token: string): string {
  return `
DIR=${dirOf(token)}
if [ ! -d "$DIR" ]; then echo "state=gone"; exit 0; fi
${cancel(token)}
rm -rf "$DIR"
echo "state=kept"
`;
}

/** Puts the firewall back now. */
export function undoScript(token: string): string {
  return `
DIR=${dirOf(token)}
if [ ! -d "$DIR" ]; then echo "state=gone"; exit 0; fi
${cancel(token)}
sh "$DIR/revert.sh"
echo "state=reverted"
`;
}
