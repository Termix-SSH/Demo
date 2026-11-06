import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";

/**
 * One script reads everything on the host. Output is split in sections that
 * start with "@@name". Every tool is optional, and a missing one is skipped.
 */
export const READ_SCRIPT = String.raw`export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin:/usr/local/bin"
has() { command -v "$1" >/dev/null 2>&1; }
lim() { if has timeout; then timeout "$@"; else shift; "$@"; fi; }
echo "@@root $(id -u)"
for t in smartctl nvme zpool zfs lsblk findmnt btrfs lvs vgs; do has $t && echo "@@tool $t"; done
[ -r /proc/mdstat ] && echo "@@tool mdstat"
if has lsblk; then
  echo "@@lsblk"
  lsblk -J -b -d -o NAME,TYPE,SIZE,MODEL,SERIAL,ROTA,TRAN 2>/dev/null
  DISKS=$(lsblk -d -n -o NAME,TYPE 2>/dev/null | awk '$2=="disk" && $1 !~ /^(zram|ram|loop|nbd|fd|sr)/ {print $1}')
else
  DISKS=$(ls /sys/block 2>/dev/null | grep -Ev '^(zram|ram|loop|nbd|fd|sr|dm-|md)')
fi
for d in $DISKS; do
  if has smartctl; then
    echo "@@smart $d"
    lim 25 smartctl -a -n standby --json=c "/dev/$d" 2>/dev/null
    echo
  elif has nvme && [ "$(echo "$d" | cut -c1-4)" = "nvme" ]; then
    echo "@@nvme $d"
    lim 25 nvme smart-log -o json "/dev/$d" 2>/dev/null
    echo
  fi
done
if has zpool; then
  echo "@@zlist"
  lim 20 zpool list -Hp -o name,size,alloc,free,health 2>/dev/null
  echo "@@zstatus"
  lim 20 zpool status -p 2>/dev/null
fi
if [ -r /proc/mdstat ]; then
  echo "@@mdstat"
  cat /proc/mdstat
fi
if has btrfs && has findmnt; then
  findmnt -rn -t btrfs -o TARGET,UUID,LABEL 2>/dev/null | sort -u -k2,2 | while read -r t u l; do
    echo "@@btrfs $t|$l"
    lim 20 btrfs device stats "$t" 2>/dev/null
    echo "@@scrub"
    lim 20 btrfs scrub status "$t" 2>/dev/null
  done
fi
if has lvs; then
  echo "@@lvs"
  lim 20 lvs --reportformat json --units b --nosuffix -o lv_name,vg_name,lv_attr,lv_size,data_percent,metadata_percent 2>/dev/null
fi
if has vgs; then
  echo "@@vgs"
  lim 20 vgs --reportformat json --units b --nosuffix -o vg_name,vg_size,vg_free 2>/dev/null
fi
echo "@@end"
`;

export const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;

function check(name: string): string {
  if (!NAME_RE.test(name)) throw new Error("That name is not valid");
  return name;
}

/** Starts or stops a SMART self test. The device was matched to a detected drive. */
export function selfTestScript(
  device: string,
  action: "short" | "long" | "abort",
): string {
  const dev = shellQuote(`/dev/${check(device)}`);
  const flag = action === "abort" ? "-X" : `-t ${action}`;
  return `export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"
command -v smartctl >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\\n' 'smartctl is not installed on this host'; exit 1; }
out=$(smartctl ${flag} ${dev} 2>&1)
code=$?
printf '%s\\n' "$out"
[ $((code & 7)) -eq 0 ] || { printf 'SCRIPT_ERR:%s\\n' "$(printf '%s\\n' "$out" | grep -Ev '^(smartctl |Copyright|$)' | tail -n 2 | tr '\\n' ' ')"; exit 1; }
`;
}

export type ScrubTarget =
  | { kind: "zfs"; name: string }
  | { kind: "btrfs"; mount: string }
  | { kind: "md"; name: string };

/** Starts or stops a scrub (md: a check) on one pool, filesystem or array. */
export function scrubScript(target: ScrubTarget, stop: boolean): string {
  const head = `export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"
`;
  if (target.kind === "zfs") {
    const name = shellQuote(check(target.name));
    return `${head}command -v zpool >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\\n' 'zpool is not installed on this host'; exit 1; }
zpool scrub ${stop ? "-s " : ""}${name} 2>&1 || { printf 'SCRIPT_ERR:%s\\n' 'zpool refused the scrub'; exit 1; }
echo done
`;
  }
  if (target.kind === "btrfs") {
    const mount = shellQuote(target.mount);
    return `${head}command -v btrfs >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\\n' 'btrfs is not installed on this host'; exit 1; }
btrfs scrub ${stop ? "cancel" : "start"} ${mount} >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\\n' 'btrfs refused the scrub'; exit 1; }
echo done
`;
  }
  const name = check(target.name);
  if (!/^md[0-9a-z_]*$/.test(name)) throw new Error("That array is not valid");
  const file = `/sys/block/${name}/md/sync_action`;
  return `${head}[ -w ${shellQuote(file)} ] || { printf 'SCRIPT_ERR:%s\\n' 'This array cannot be checked'; exit 1; }
echo ${stop ? "idle" : "check"} > ${shellQuote(file)} 2>/dev/null || { printf 'SCRIPT_ERR:%s\\n' 'The array is busy, try again after the rebuild'; exit 1; }
echo done
`;
}
