import { shellQuote as q, toBase64 } from "@termix-ssh/plugin-sdk/host-scripts";
import { dirPoolXml, networkXml, type NetworkKind } from "./domain-xml.js";
import { prelude } from "./read.js";

function defineFrom(xml: string, verb: string): string {
  return `t=$(mktemp)
trap 'rm -f "$t"' EXIT
printf '%s' ${q(toBase64(xml))} | base64 -d > "$t"
V ${verb} "$t" >/dev/null
`;
}

export function snapshotCreateScript(
  uri: string,
  uuid: string,
  name: string,
  description: string,
): string {
  const about = description ? ` --description ${q(description)}` : "";
  return `${prelude(uri)}V snapshot-create-as ${q(uuid)} ${q(name)}${about}
`;
}

export function snapshotRevertScript(
  uri: string,
  uuid: string,
  name: string,
): string {
  return `${prelude(uri)}V snapshot-revert ${q(uuid)} ${q(name)} --force
`;
}

export function snapshotDeleteScript(
  uri: string,
  uuid: string,
  name: string,
): string {
  return `${prelude(uri)}V snapshot-delete ${q(uuid)} ${q(name)}
`;
}

export function poolCreateScript(
  uri: string,
  name: string,
  path: string,
): string {
  return `${prelude(uri)}mkdir -p ${q(path)}
${defineFrom(dirPoolXml(name, path), "pool-define")}V pool-start ${q(name)} >/dev/null
V pool-autostart ${q(name)} >/dev/null
`;
}

export type PoolAction = "start" | "stop" | "autostart" | "noautostart";

export function poolActionScript(
  uri: string,
  name: string,
  action: PoolAction,
): string {
  const p = q(name);
  const command = {
    start: `pool-start ${p}`,
    stop: `pool-destroy ${p}`,
    autostart: `pool-autostart ${p}`,
    noautostart: `pool-autostart ${p} --disable`,
  }[action];
  return `${prelude(uri)}V ${command}
`;
}

/** Forgets a pool. Files in its folder stay on the disk. */
export function poolDeleteScript(uri: string, name: string): string {
  const p = q(name);
  return `${prelude(uri)}V pool-destroy ${p} >/dev/null 2>&1 || true
V pool-undefine ${p}
`;
}

export function volumeCreateScript(
  uri: string,
  pool: string,
  name: string,
  gib: number,
): string {
  return `${prelude(uri)}V vol-create-as ${q(pool)} ${q(name)} ${gib}G --format qcow2
`;
}

export function volumeDeleteScript(
  uri: string,
  pool: string,
  name: string,
): string {
  const v = q(name);
  const p = q(pool);
  return `${prelude(uri)}path=$(V vol-path ${v} --pool ${p})
for d in $(V list --all --uuid); do
  if V dumpxml "$d" | grep -qF "$path"; then echo "A VM still uses this volume"; exit 1; fi
done
V vol-delete ${v} --pool ${p}
`;
}

export function volumePathScript(
  uri: string,
  pool: string,
  name: string,
): string {
  return `${prelude(uri)}V vol-path ${q(name)} --pool ${q(pool)}
`;
}

/** The job body that downloads a file into a pool. */
export function downloadJob(
  uri: string,
  pool: string,
  name: string,
  url: string,
): string {
  return `${prelude(uri)}P=$(V pool-dumpxml ${q(pool)} | sed -n 's:.*<path>\\(.*\\)</path>.*:\\1:p' | head -n 1)
[ -d "$P" ] || { echo "This storage pool has no folder"; exit 1; }
[ ! -e "$P/"${q(name)} ] || { echo "${name} already exists in this pool"; exit 1; }
echo "@@phase download"
curl -fL --retry 3 --progress-bar -o "$P/"${q(`${name}.part`)} ${q(url)}
mv "$P/"${q(`${name}.part`)} "$P/"${q(name)}
chmod 644 "$P/"${q(name)}
V pool-refresh ${q(pool)} >/dev/null || true
`;
}

export function networkCreateScript(
  uri: string,
  name: string,
  kind: NetworkKind,
): string {
  return `${prelude(uri)}${defineFrom(networkXml(name, kind), "net-define")}V net-start ${q(name)} >/dev/null
V net-autostart ${q(name)} >/dev/null
`;
}

export type NetworkAction = "start" | "stop" | "autostart" | "noautostart";

export function networkActionScript(
  uri: string,
  name: string,
  action: NetworkAction,
): string {
  const n = q(name);
  const command = {
    start: `net-start ${n}`,
    stop: `net-destroy ${n}`,
    autostart: `net-autostart ${n}`,
    noautostart: `net-autostart ${n} --disable`,
  }[action];
  return `${prelude(uri)}V ${command}
`;
}

export function networkDeleteScript(uri: string, name: string): string {
  const n = q(name);
  return `${prelude(uri)}V net-destroy ${n} >/dev/null 2>&1 || true
V net-undefine ${n}
`;
}
