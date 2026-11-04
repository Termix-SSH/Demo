import { FirewallError } from "./errors.js";
import { errLine } from "./shell.js";

export const INSTALLABLE = [
  "ufw",
  "firewalld",
  "nftables",
  "fail2ban",
] as const;
export type Installable = (typeof INSTALLABLE)[number];

const COMMANDS: Record<string, (pkg: string) => string> = {
  "apt-get": (pkg) =>
    `export DEBIAN_FRONTEND=noninteractive; apt-get update -qq >/dev/null 2>&1; apt-get install -y -qq ${pkg}`,
  dnf: (pkg) => `dnf install -y -q ${pkg}`,
  yum: (pkg) => `yum install -y -q ${pkg}`,
  zypper: (pkg) => `zypper -n -q install ${pkg}`,
  pacman: (pkg) => `pacman -S --noconfirm --needed ${pkg}`,
  apk: (pkg) => `apk add -q ${pkg}`,
};

/**
 * Installs a firewall tool. firewalld starts by itself on some distros, which
 * could block SSH on a custom port, so it is stopped right after: turning it
 * on is a separate step that allows SSH first.
 */
export function installScript(what: string, packageManager: string): string {
  if (!INSTALLABLE.includes(what as Installable))
    throw new FirewallError(`Termix can't install ${what}`);
  const install = COMMANDS[packageManager];
  if (!install)
    throw new FirewallError(
      "Termix does not know the package manager on this host",
    );
  const lines = [
    `${install(what)} >/tmp/termix-firewall-install.log 2>&1 || { tail -n 5 /tmp/termix-firewall-install.log; ${errLine(`Could not install ${what}`)}; exit 1; }`,
  ];
  if (what === "firewalld") {
    lines.push(`systemctl disable --now firewalld >/dev/null 2>&1 || true`);
  }
  return lines.join("\n");
}
