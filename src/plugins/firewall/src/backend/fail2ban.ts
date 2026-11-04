import type { Fail2banStatus, Jail } from "../shared/types.js";
import { errLine, shellQuote } from "./shell.js";

export const FAIL2BAN_STATUS = `
if ! command -v fail2ban-client >/dev/null 2>&1; then echo "installed=0"; exit 0; fi
echo "installed=1"
echo "version=$(fail2ban-client --version 2>/dev/null | head -n 1)"
if ! fail2ban-client ping >/dev/null 2>&1; then echo "running=0"; exit 0; fi
echo "running=1"
for J in $(fail2ban-client status 2>/dev/null | sed -n 's/.*Jail list:[[:space:]]*//p' | tr ',' ' '); do
  echo "@@jail $J@@"
  fail2ban-client status "$J" 2>/dev/null
done
exit 0
`;

function count(text: string, label: string): number {
  const m = new RegExp(`${label}:\\s*(\\d+)`).exec(text);
  return m ? Number(m[1]) : 0;
}

export function parseFail2ban(output: string): Fail2banStatus {
  const status: Fail2banStatus = {
    installed: false,
    running: false,
    version: "",
    jails: [],
  };
  const chunks = output.split(/^@@jail (.+)@@$/m);
  for (const line of chunks[0].split("\n")) {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim();
    if (key === "installed") status.installed = value === "1";
    if (key === "running") status.running = value === "1";
    if (key === "version") status.version = value;
  }
  for (let i = 1; i < chunks.length; i += 2) {
    const name = chunks[i].trim();
    const text = chunks[i + 1] ?? "";
    const list = /Banned IP list:[ \t]*(.*)$/m.exec(text)?.[1] ?? "";
    const jail: Jail = {
      name,
      currentlyFailed: count(text, "Currently failed"),
      totalFailed: count(text, "Total failed"),
      currentlyBanned: count(text, "Currently banned"),
      totalBanned: count(text, "Total banned"),
      banned: list.split(/\s+/).filter(Boolean),
    };
    status.jails.push(jail);
  }
  return status;
}

/** jail and ip are checked by the route first. */
export function banScript(jail: string, ip: string, ban: boolean): string {
  return `fail2ban-client set ${shellQuote(jail)} ${ban ? "banip" : "unbanip"} ${shellQuote(ip)} >/dev/null || { ${errLine(
    ban
      ? "Fail2ban could not ban the address"
      : "Fail2ban could not unban the address",
  )}; exit 1; }`;
}

export const FAIL2BAN_START = `
if command -v systemctl >/dev/null 2>&1; then systemctl enable --now fail2ban >/dev/null 2>&1 || { ${errLine("Fail2ban could not be started")}; exit 1; }
else fail2ban-client start >/dev/null 2>&1 || { ${errLine("Fail2ban could not be started")}; exit 1; }; fi
`;
