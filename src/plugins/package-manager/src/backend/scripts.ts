import {
  HostScriptError,
  shellQuote,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { Manager, PackageAction } from "../shared/types.js";

export const MARK = "@@TERMIX@@";
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9+._:@-]{0,127}$/;
const QUERY_RE = /^[A-Za-z0-9+._-]{2,64}$/;

/** Package names from a request. Refuses anything a shell could misread. */
export function cleanNames(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [value];
  const names = list
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (names.length === 0) throw new HostScriptError("Pick a package");
  if (names.length > 200) throw new HostScriptError("Too many packages");
  for (const name of names) {
    if (!NAME_RE.test(name)) {
      throw new HostScriptError(`"${name}" is not a valid package name`);
    }
  }
  return [...new Set(names)];
}

export function cleanQuery(value: unknown): string {
  const query = typeof value === "string" ? value.trim() : "";
  if (!QUERY_RE.test(query)) {
    throw new HostScriptError("Search for 2 to 64 letters, numbers or . + - _");
  }
  return query;
}

export const STATUS_SCRIPT = `. /etc/os-release 2>/dev/null
echo "os=\${PRETTY_NAME:-$(uname -s)}"
if [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; then echo root=1; else echo root=0; fi
pm=none
for c in apt-get dnf yum zypper pacman apk; do
  if command -v $c >/dev/null 2>&1; then pm=$c; break; fi
done
[ "$pm" = apt-get ] && pm=apt
echo "manager=$pm"
if [ -f /var/run/reboot-required ]; then echo reboot=1
elif command -v needs-restarting >/dev/null 2>&1; then
  needs-restarting -r >/dev/null 2>&1; [ $? -eq 1 ] && echo reboot=1 || echo reboot=0
elif [ "$pm" = zypper ]; then
  zypper -q needs-rebooting >/dev/null 2>&1; [ $? -eq 102 ] && echo reboot=1 || echo reboot=0
elif [ "$pm" = apt ]; then echo reboot=0
fi
[ "$pm" = apt ] && echo "index=$(stat -c %Y /var/cache/apt/pkgcache.bin 2>/dev/null)"
exit 0
`;

const APT_ENV = `export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a
APT="apt-get -y -q -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold -o DPkg::Lock::Timeout=120"
`;

const words = (names: string[]) => names.map(shellQuote).join(" ");

export function updatesScript(pm: Manager): string {
  switch (pm) {
    case "apt":
      return `apt list --upgradable 2>/dev/null | tail -n +2; exit 0\n`;
    case "dnf":
    case "yum":
      return `${pm} -q check-update 2>/dev/null
echo "${MARK}SEC"
${pm} -q updateinfo list --updates security 2>/dev/null || ${pm} -q updateinfo list security 2>/dev/null
echo "${MARK}INST"
rpm -qa --qf '%{NAME}.%{ARCH} %{VERSION}-%{RELEASE}\\n' 2>/dev/null
exit 0
`;
    case "zypper":
      return `zypper -q -n --no-refresh list-updates 2>/dev/null; exit 0\n`;
    case "pacman":
      return `if command -v checkupdates >/dev/null 2>&1; then checkupdates 2>/dev/null; else pacman -Qu 2>/dev/null; fi; exit 0\n`;
    case "apk":
      return `apk -u list 2>/dev/null; exit 0\n`;
  }
}

export function installedScript(pm: Manager): string {
  switch (pm) {
    case "apt":
      return `dpkg-query -W -f='\${db:Status-Abbrev}\\t\${Package}\\t\${Version}\\t\${Installed-Size}\\t\${binary:Summary}\\n' 2>/dev/null
echo "${MARK}HELD"
apt-mark showhold 2>/dev/null
exit 0
`;
    case "dnf":
    case "yum":
    case "zypper":
      return `rpm -qa --qf 'ii \\t%{NAME}\\t%{VERSION}-%{RELEASE}\\t%{SIZE}\\t%{SUMMARY}\\n' 2>/dev/null
echo "${MARK}HELD"
${pm === "zypper" ? "zypper -q -n locks 2>/dev/null" : `${pm} -q versionlock list 2>/dev/null`}
exit 0
`;
    case "pacman":
      return `pacman -Qi 2>/dev/null | awk -F' *: ' '/^Name/{n=$2} /^Version/{v=$2} /^Description/{d=$2} /^Installed Size/{s=$2} /^$/{if(n!="") print "ii \\t" n "\\t" v "\\t" s "\\t" d; n=""}'
exit 0
`;
    case "apk":
      return `apk list -I 2>/dev/null; exit 0\n`;
  }
}

export function searchScript(pm: Manager, query: string): string {
  const q = shellQuote(query);
  switch (pm) {
    case "apt":
      return `r=$(apt-cache search --names-only -- ${q} 2>/dev/null | head -n 100)
printf '%s\\n' "$r"
echo "${MARK}INST"
printf '%s\\n' "$r" | awk '{print $1}' | xargs -r dpkg-query -W -f='\${Package} \${db:Status-Abbrev}\\n' 2>/dev/null
exit 0
`;
    case "dnf":
    case "yum":
      return `r=$(${pm} -q search ${q} 2>/dev/null | head -n 150)
printf '%s\\n' "$r"
echo "${MARK}INST"
rpm -qa --qf '%{NAME}\\n' 2>/dev/null | grep -i -- ${q}
exit 0
`;
    case "zypper":
      return `zypper -q -n --no-refresh search -- ${q} 2>/dev/null | head -n 150; exit 0\n`;
    case "pacman":
      return `pacman -Ss -- ${q} 2>/dev/null | head -n 200; exit 0\n`;
    case "apk":
      return `apk search -v -d -- ${q} 2>/dev/null | head -n 100
echo "${MARK}INST"
apk info 2>/dev/null | grep -i -- ${q}
exit 0
`;
  }
}

export function historyScript(pm: Manager): string {
  switch (pm) {
    case "apt":
      return `zcat -f /var/log/apt/history.log.1.gz /var/log/apt/history.log 2>/dev/null | tail -n 3000; exit 0\n`;
    case "dnf":
    case "yum":
      return `${pm} history list 2>/dev/null | head -n 80; exit 0\n`;
    case "zypper":
      return `grep -v '^#' /var/log/zypp/history 2>/dev/null | tail -n 300; exit 0\n`;
    case "pacman":
      return `grep -E '\\[ALPM\\] (installed|upgraded|removed|downgraded|reinstalled)' /var/log/pacman.log 2>/dev/null | tail -n 300; exit 0\n`;
    case "apk":
      return `exit 0\n`;
  }
}

export function reposScript(pm: Manager): string {
  switch (pm) {
    case "apt":
      return `for f in /etc/apt/sources.list /etc/apt/sources.list.d/*.list; do
  [ -f "$f" ] && grep -hE '^[[:space:]]*#?[[:space:]]*deb(-src)?[[:space:]]' "$f" | sed "s|^|\${f##*/}\\t|"
done
for f in /etc/apt/sources.list.d/*.sources; do
  [ -f "$f" ] && { echo "${MARK}FILE \${f##*/}"; cat "$f"; echo; }
done
exit 0
`;
    case "dnf":
    case "yum":
      return `${pm} -q repolist --all 2>/dev/null; exit 0\n`;
    case "zypper":
      return `zypper -q -n lr -u 2>/dev/null; exit 0\n`;
    case "pacman":
      return `grep -E '^\\[' /etc/pacman.conf 2>/dev/null | tr -d '[]' | grep -vx options; exit 0\n`;
    case "apk":
      return `cat /etc/apk/repositories 2>/dev/null; exit 0\n`;
  }
}

/** Throws for actions a package manager can't do safely. */
export function checkAction(pm: Manager, action: PackageAction): void {
  if (pm === "pacman" && action === "update") {
    throw new HostScriptError(
      "Arch only supports full upgrades. Use Upgrade all instead.",
    );
  }
  if ((action === "hold" || action === "unhold") && !supportsHolds(pm)) {
    throw new HostScriptError("This package manager can't hold packages");
  }
}

export function supportsHolds(pm: Manager): boolean {
  return pm === "apt" || pm === "dnf" || pm === "yum" || pm === "zypper";
}

/** The script for a change. Runs as root. */
export function actionScript(
  pm: Manager,
  action: PackageAction,
  names: string[] = [],
): string {
  checkAction(pm, action);
  const command = actionCommand(pm, action, words(names));
  return `${pm === "apt" ? APT_ENV : ""}{ ${command}; } 2>&1
`;
}

function actionCommand(
  pm: Manager,
  action: PackageAction,
  list: string,
): string {
  switch (pm) {
    case "apt":
      return {
        refresh: `$APT update`,
        update: `$APT install --only-upgrade ${list}`,
        "upgrade-all": `$APT update && $APT upgrade`,
        install: `$APT install ${list}`,
        remove: `$APT remove ${list}`,
        hold: `apt-mark hold ${list}`,
        unhold: `apt-mark unhold ${list}`,
      }[action];
    case "dnf":
    case "yum": {
      const up = pm === "dnf" ? "upgrade" : "update";
      return {
        refresh: `${pm} -y -q makecache`,
        update: `${pm} -y ${up} ${list}`,
        "upgrade-all": `${pm} -y ${up}`,
        install: `${pm} -y install ${list}`,
        remove: `${pm} -y remove ${list}`,
        hold: `${pm} -y versionlock add ${list}`,
        unhold: `${pm} -y versionlock delete ${list}`,
      }[action];
    }
    case "zypper":
      return {
        refresh: `zypper -n refresh`,
        update: `zypper -n update ${list}`,
        "upgrade-all": `zypper -n refresh && zypper -n update`,
        install: `zypper -n install ${list}`,
        remove: `zypper -n remove ${list}`,
        hold: `zypper -n addlock ${list}`,
        unhold: `zypper -n removelock ${list}`,
      }[action];
    case "pacman":
      return {
        refresh: `pacman -Sy --noconfirm`,
        update: `false`,
        "upgrade-all": `pacman -Syu --noconfirm`,
        install: `pacman -S --noconfirm --needed ${list}`,
        remove: `pacman -R --noconfirm ${list}`,
        hold: `false`,
        unhold: `false`,
      }[action];
    case "apk":
      return {
        refresh: `apk update`,
        update: `apk add -u ${list}`,
        "upgrade-all": `apk update && apk upgrade`,
        install: `apk add ${list}`,
        remove: `apk del ${list}`,
        hold: `false`,
        unhold: `false`,
      }[action];
  }
}
