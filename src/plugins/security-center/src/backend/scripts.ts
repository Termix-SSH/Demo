import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";

const DPKG_FMT =
  "${db:Status-Abbrev}\t${source:Package}\t${source:Version}\t${binary:Package}\t${Version}\n";

/**
 * Reads every key and the sshd settings on a host. Output is split in
 * sections that start with "@@". File contents are prefixed with "> " so a
 * line inside a key file can never pass for a section.
 */
export const KEYS_SCRIPT = String.raw`export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin:/usr/local/bin"
has() { command -v "$1" >/dev/null 2>&1; }
lim() { if has timeout; then timeout "$@"; else shift; "$@"; fi; }
mt() { stat -c '%a %Y' "$1" 2>/dev/null || echo "0 0"; }
echo "@@root $(id -u)"
echo "@@os"
cat /etc/os-release 2>/dev/null | sed 's/^/> /'
echo "@@sshdver"
{ ssh -V 2>&1 || true; } | head -n 1
if has sshd; then
  OUT=$(lim 15 sshd -T 2>/dev/null)
  if [ -n "$OUT" ]; then
    echo "@@sshd"
    printf '%s\n' "$OUT" | sed 's/^/> /'
  fi
fi
if [ -r /etc/ssh/sshd_config ]; then
  echo "@@sshdconf"
  grep -Ev '^[[:space:]]*(#|$)' /etc/ssh/sshd_config 2>/dev/null | head -n 300 | sed 's/^/> /'
fi
for f in /etc/ssh/ssh_host_*_key.pub; do
  [ -f "$f" ] || continue
  p=$(printf '%s' "$f" | sed 's/.pub$//')
  printf '@@file\thost\troot\t%s\t%s\n' "$f" "$(mt "$p")"
  head -n 5 "$f" | sed 's/^/> /'
done
getent passwd 2>/dev/null | awk -F: 'NF>=6 && $6!="" {print $1"\t"$6}' | head -n 300 > /tmp/.termix-sec-users.$$ || true
[ -s /tmp/.termix-sec-users.$$ ] || awk -F: 'NF>=6 && $6!="" {print $1"\t"$6}' /etc/passwd 2>/dev/null | head -n 300 > /tmp/.termix-sec-users.$$
while IFS="$(printf '\t')" read -r u h; do
  [ -d "$h/.ssh" ] || continue
  dm=$(stat -c '%a' "$h/.ssh" 2>/dev/null || echo 0)
  printf '@@dir\t%s\t%s\t%s\n' "$u" "$h/.ssh" "$dm"
  for f in "$h/.ssh/authorized_keys" "$h/.ssh/authorized_keys2"; do
    [ -f "$f" ] || continue
    printf '@@file\tauthorized\t%s\t%s\t%s\n' "$u" "$f" "$(mt "$f")"
    head -n 2000 "$f" | sed 's/^/> /'
  done
  for f in "$h"/.ssh/*; do
    [ -f "$f" ] || continue
    case "$f" in
      *.pub|*known_hosts*|*authorized_keys*|*/config|*/environment|*.bak|*.termix.bak) continue ;;
    esac
    head -c 64 "$f" 2>/dev/null | grep -q -- '-----BEGIN' || continue
    pub=""
    prot=-1
    if has ssh-keygen; then
      if pub=$(lim 5 ssh-keygen -y -P "" -f "$f" </dev/null 2>/dev/null); then prot=0; else pub=""; prot=1; fi
    fi
    [ -z "$pub" ] && [ -f "$f.pub" ] && pub=$(head -n 1 "$f.pub")
    printf '@@file\tprivate\t%s\t%s\t%s\t%s\n' "$u" "$f" "$(mt "$f")" "$prot"
    printf '%s\n' "$pub" | sed 's/^/> /'
  done
done < /tmp/.termix-sec-users.$$
rm -f /tmp/.termix-sec-users.$$
if [ -f /var/run/reboot-required ]; then echo "@@reboot 1"; else echo "@@reboot 0"; fi
echo "@@end"
`;

/** Lists installed packages and the OS, for the vulnerability scan. */
export const PACKAGES_SCRIPT = String.raw`export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin:/usr/local/bin"
has() { command -v "$1" >/dev/null 2>&1; }
echo "@@root $(id -u)"
echo "@@os"
cat /etc/os-release 2>/dev/null | sed 's/^/> /'
echo "@@kernel"
uname -r
if has dpkg-query; then
  echo "@@pkgs dpkg"
  dpkg-query -W -f='${DPKG_FMT}' 2>/dev/null | awk -F'\t' '$1 ~ /^(ii|hi)/'
elif has rpm; then
  echo "@@pkgs rpm"
  rpm -qa --qf '%{NAME}\t%{EPOCHNUM}\t%{VERSION}-%{RELEASE}\t%{ARCH}\n' 2>/dev/null
elif has apk; then
  echo "@@pkgs apk"
  apk info -v 2>/dev/null
fi
echo "@@end"
`;

const B64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
export const FP_RE = /^SHA256:[A-Za-z0-9+/]{43}$/;

function b64(text: string): string {
  return Buffer.from(text, "utf8").toString("base64");
}

/** Adds one public key line to the login user's authorized_keys. Runs as that user. */
export function addKeyScript(line: string): string {
  if (/[\r\n]/.test(line)) throw new Error("That key line is not valid");
  return `umask 077
mkdir -p ~/.ssh && chmod 700 ~/.ssh
f=~/.ssh/authorized_keys
touch "$f" && chmod 600 "$f"
cp -p "$f" "$f.termix.bak" 2>/dev/null
line=$(printf '%s' ${shellQuote(b64(line))} | base64 -d)
grep -qxF -- "$line" "$f" || printf '%s\n' "$line" >> "$f"
echo done
`;
}

/** Removes every line with this key from the login user's authorized_keys. */
export function removeKeyScript(blob: string): string {
  if (!B64_RE.test(blob)) throw new Error("That key is not valid");
  return `f=~/.ssh/authorized_keys
[ -f "$f" ] || { echo done; exit 0; }
cp -p "$f" "$f.termix.bak" 2>/dev/null
tmp=$(mktemp) || exit 1
awk -v b=${shellQuote(blob)} 'index($0,b)==0' "$f" > "$tmp" && cat "$tmp" > "$f"
rm -f "$tmp"
echo done
`;
}

/** Checks the login works and prints a marker. */
export const PROBE_COMMAND = "echo termix-key-ok";

/** Removes one key by fingerprint from one authorized_keys file. Runs as root. */
export function revokeScript(path: string, fingerprint: string): string {
  if (!FP_RE.test(fingerprint))
    throw new Error("That fingerprint is not valid");
  if (!/^\/[^\0\r\n]*\/authorized_keys2?$/.test(path)) {
    throw new Error("That file is not an authorized keys file");
  }
  return `export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"
f=${shellQuote(path)}
fp=${shellQuote(fingerprint)}
command -v ssh-keygen >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\n' 'ssh-keygen is not installed on this host'; exit 1; }
[ -f "$f" ] || { printf 'SCRIPT_ERR:%s\n' 'The file is gone'; exit 1; }
cp -p "$f" "$f.termix.bak" 2>/dev/null
tmp=$(mktemp) || exit 1
removed=0
while IFS= read -r line || [ -n "$line" ]; do
  got=$(printf '%s\n' "$line" | ssh-keygen -lf - 2>/dev/null | awk '{print $2}')
  if [ "$got" = "$fp" ]; then removed=$((removed+1)); else printf '%s\n' "$line" >> "$tmp"; fi
done < "$f"
cat "$tmp" > "$f"
rm -f "$tmp"
echo "removed $removed"
`;
}

/** Makes new host keys and restarts sshd. Old keys are copied first and put back on a failed check. */
export const ROTATE_HOST_KEYS_SCRIPT = String.raw`export LC_ALL=C
PATH="$PATH:/usr/sbin:/sbin:/usr/local/sbin"
command -v ssh-keygen >/dev/null 2>&1 || { printf 'SCRIPT_ERR:%s\n' 'ssh-keygen is not installed on this host'; exit 1; }
d=/var/lib/termix-security/hostkeys-$(date +%s)
mkdir -p "$d" && chmod 700 "$d" || exit 1
cp -p /etc/ssh/ssh_host_* "$d"/ 2>/dev/null
restore() { cp -p "$d"/ssh_host_* /etc/ssh/ 2>/dev/null; }
for t in rsa ecdsa ed25519; do
  k=/etc/ssh/ssh_host_"$t"_key
  [ -f "$k" ] || continue
  rm -f "$k" "$k.pub"
  if [ "$t" = rsa ]; then b="-b 4096"; else b=""; fi
  ssh-keygen -q -N "" -t "$t" $b -f "$k" </dev/null || { restore; printf 'SCRIPT_ERR:%s\n' 'Could not make a new host key'; exit 1; }
done
rm -f /etc/ssh/ssh_host_dsa_key /etc/ssh/ssh_host_dsa_key.pub
if command -v sshd >/dev/null 2>&1 && ! sshd -t 2>/dev/null; then
  restore
  printf 'SCRIPT_ERR:%s\n' 'sshd did not accept the new keys, the old ones are back'
  exit 1
fi
if command -v systemctl >/dev/null 2>&1; then
  systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || systemctl restart sshd 2>/dev/null
else
  service ssh restart 2>/dev/null || service sshd restart 2>/dev/null
fi
echo "done $d"
`;
