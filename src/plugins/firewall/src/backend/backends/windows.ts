import { randomBytes } from "node:crypto";
import type { Defaults, Policy, Rule, RuleSpec } from "../../shared/types.js";
import { FirewallError } from "../errors.js";
import type { Change, HostState, Plan, Snapshot } from "./types.js";

/** Scripts that start with this run in PowerShell, not sh. */
export const POWERSHELL = "#!powershell\n";

const GROUP = "Termix";
const TASK_PATH = "\\Termix\\";
const TOKEN_RE = /^[a-f0-9]{12,32}$/;

/** A PowerShell single quoted string. */
export function psq(value: string): string {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function ps(body: string): string {
  return `${POWERSHELL}$ErrorActionPreference = 'Stop'\n$ProgressPreference = 'SilentlyContinue'\n${body.trim()}\n`;
}

/**
 * Reads the profiles, the rules people made (built in Windows rules are
 * only counted), the SSH port and Termix's waiting undo tasks, as JSON.
 */
export const WINDOWS_READ = ps(`
$profiles = @(Get-NetFirewallProfile | ForEach-Object {
  [pscustomobject]@{ name = [string]$_.Name; enabled = [string]$_.Enabled;
    inbound = [string]$_.DefaultInboundAction; outbound = [string]$_.DefaultOutboundAction } })
$all = @(Get-NetFirewallRule)
$mine = @($all | Where-Object { -not ([string]$_.Group).StartsWith('@') })
$ports = @{}
Get-NetFirewallPortFilter | ForEach-Object { $ports[$_.InstanceID] = $_ }
$addrs = @{}
Get-NetFirewallAddressFilter | ForEach-Object { $addrs[$_.InstanceID] = $_ }
$rules = @($mine | ForEach-Object {
  $p = $ports[$_.Name]; $a = $addrs[$_.Name]
  [pscustomobject]@{ name = [string]$_.Name; display = [string]$_.DisplayName;
    group = [string]$_.Group; enabled = [string]$_.Enabled;
    direction = [string]$_.Direction; action = [string]$_.Action;
    protocol = [string]$p.Protocol; port = (@($p.LocalPort) -join ',');
    remote = (@($a.RemoteAddress) -join ',') } })
$sshPort = 22
$conf = Join-Path $env:ProgramData 'ssh\\sshd_config'
if (Test-Path $conf) {
  $line = Get-Content $conf | Where-Object { $_ -match '^\\s*Port\\s+\\d+' } | Select-Object -First 1
  if ($line) { $sshPort = [int](($line -split '\\s+')[-1]) }
}
$tasks = @(Get-ScheduledTask -TaskPath '${TASK_PATH}' -ErrorAction SilentlyContinue | ForEach-Object { $_.TaskName })
$os = (Get-CimInstance Win32_OperatingSystem).Caption
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
$client = ''
if ($env:SSH_CLIENT) { $client = ($env:SSH_CLIENT -split ' ')[0] }
[pscustomobject]@{ profiles = $profiles; rules = $rules; total = $all.Count;
  sshPort = $sshPort; tasks = $tasks; os = [string]$os; admin = [bool]$admin;
  client = $client } | ConvertTo-Json -Depth 4 -Compress
`);

interface RawRule {
  name: string;
  display: string;
  group: string;
  enabled: string;
  direction: string;
  action: string;
  protocol: string;
  port: string;
  remote: string;
}

interface RawState {
  profiles: Array<{
    name: string;
    enabled: string;
    inbound: string;
    outbound: string;
  }>;
  rules: RawRule[] | RawRule | null;
  total: number;
  sshPort: number;
  tasks: string[] | string | null;
  os: string;
  admin: boolean;
  client: string;
}

const list = <T>(value: T[] | T | null | undefined): T[] =>
  value === null || value === undefined
    ? []
    : Array.isArray(value)
      ? value
      : [value];

function policy(action: string, fallback: Policy): Policy {
  if (/^block$/i.test(action)) return "deny";
  if (/^allow$/i.test(action)) return "allow";
  return fallback;
}

/** "Any" and the like become an empty string, which means any. */
function anyToEmpty(value: string): string {
  return !value || /^any$/i.test(value) ? "" : value;
}

function toRule(raw: RawRule): Rule {
  const managed = raw.group === GROUP;
  const protocol = /^tcp$/i.test(raw.protocol)
    ? "tcp"
    : /^udp$/i.test(raw.protocol)
      ? "udp"
      : "any";
  const spec: RuleSpec = {
    action: /^block$/i.test(raw.action) ? "deny" : "allow",
    direction: /^outbound$/i.test(raw.direction) ? "out" : "in",
    protocol,
    port: anyToEmpty(raw.port),
    source: anyToEmpty(raw.remote),
    destination: "",
    iface: "",
    family: "any",
    comment: raw.display,
  };
  return {
    ...spec,
    id: raw.name,
    managed,
    ...(managed
      ? {}
      : { deleteOnly: true, readOnlyReason: "Made outside Termix" }),
    raw: `${raw.display} (${raw.name})`,
  };
}

/** The host as Windows Firewall shows it. Only enabled rules count. */
export function parseWindowsState(output: string, hostPort: number): HostState {
  const start = output.indexOf("{");
  let raw: RawState;
  try {
    raw = JSON.parse(output.slice(start)) as RawState;
  } catch {
    throw new FirewallError("Could not read Windows Firewall on this host");
  }
  const profiles = list(raw.profiles);
  const pub =
    profiles.find((p) => p.name === "Public") ?? profiles[0] ?? undefined;
  const defaults: Defaults | null = pub
    ? {
        incoming: policy(pub.inbound, "deny"),
        outgoing: policy(pub.outbound, "allow"),
      }
    : null;
  const rules = list(raw.rules)
    .filter((rule) => /^true$/i.test(rule.enabled))
    .map(toRule);
  const ports = [...new Set([raw.sshPort || 22, hostPort].filter(Boolean))];
  return {
    backend: "windows",
    installed: ["windows"],
    active: profiles.some((p) => /^true$/i.test(p.enabled)),
    version: "",
    defaults,
    rules,
    zones: [],
    defaultZone: "",
    otherRules: Math.max(0, (raw.total || 0) - list(raw.rules).length),
    persistent: true,
    warnings: raw.admin
      ? []
      : ["This login is not an administrator, so changes will fail."],
    ssh: { ports, client: raw.client || "" },
    packageManager: "",
    os: raw.os || "Windows",
    root: !!raw.admin,
    fail2ban: { installed: false, running: false },
    pendingTokens: list(raw.tasks).map((task) =>
      task.replace(/^termix-fw-/, ""),
    ),
    hasSystemd: false,
  };
}

const PORTS_RE = /^\d{1,5}(-\d{1,5})?(,\d{1,5}(-\d{1,5})?)*$/;
const ADDRESS_RE = /^[0-9a-fA-F:.]+(\/\d{1,3})?$/;

/** The New-NetFirewallRule line for a rule, checked again here. */
export function ruleCommand(spec: RuleSpec, name: string): string {
  if (spec.action === "limit") {
    throw new FirewallError("Windows Firewall has no rate limit rules");
  }
  const parts = [
    "New-NetFirewallRule",
    `-Name ${psq(name)}`,
    `-DisplayName ${psq(spec.comment.trim() || `Termix ${spec.direction} ${spec.port || "any"}`)}`,
    `-Group ${psq(GROUP)}`,
    `-Direction ${spec.direction === "out" ? "Outbound" : "Inbound"}`,
    `-Action ${spec.action === "allow" ? "Allow" : "Block"}`,
    "-Profile Any",
  ];
  if (spec.port) {
    if (spec.protocol === "any") {
      throw new FirewallError("Pick TCP or UDP for a rule with a port");
    }
    if (!PORTS_RE.test(spec.port)) throw new FirewallError("Bad port");
    parts.push(`-Protocol ${spec.protocol.toUpperCase()}`);
    const ports = spec.port.split(",").map(psq).join(",");
    parts.push(
      `${spec.direction === "out" ? "-RemotePort" : "-LocalPort"} ${ports}`,
    );
  } else if (spec.protocol !== "any") {
    parts.push(`-Protocol ${spec.protocol.toUpperCase()}`);
  }
  if (spec.source) {
    if (!ADDRESS_RE.test(spec.source)) throw new FirewallError("Bad address");
    parts.push(`-RemoteAddress ${psq(spec.source)}`);
  }
  if (spec.iface || spec.destination) {
    throw new FirewallError(
      "Windows rules from Termix can't name an interface or destination",
    );
  }
  return `${parts.join(" ")} | Out-Null`;
}

export function newRuleName(): string {
  return `termix-${randomBytes(6).toString("hex")}`;
}

function windowsPolicy(value: Policy): string {
  return value === "allow" ? "Allow" : "Block";
}

/** Plans a change as a PowerShell script, plus the firewall after it. */
export function planWindows(state: HostState, change: Change): Plan {
  const after: Snapshot = {
    active: state.active,
    defaults: state.defaults ? { ...state.defaults } : null,
    rules: [...state.rules],
    zones: [],
    defaultZone: "",
  };
  const lines: string[] = [];
  const addRule = (spec: RuleSpec) => {
    const name = newRuleName();
    lines.push(ruleCommand(spec, name));
    after.rules.push({ ...spec, id: name, managed: true, raw: name });
  };
  const findRule = (id: string) => {
    const rule = state.rules.find((r) => r.id === id);
    if (!rule) throw new FirewallError("That rule was not found", 404);
    return rule;
  };
  switch (change.kind) {
    case "add":
      addRule(change.spec);
      break;
    case "addMany":
      change.specs.forEach(addRule);
      break;
    case "update": {
      const rule = findRule(change.id);
      if (!rule.managed) {
        throw new FirewallError("Only rules made in Termix can be changed");
      }
      lines.push(`Remove-NetFirewallRule -Name ${psq(rule.id)}`);
      after.rules = after.rules.filter((r) => r.id !== rule.id);
      addRule(change.spec);
      break;
    }
    case "remove": {
      const rule = findRule(change.id);
      lines.push(`Remove-NetFirewallRule -Name ${psq(rule.id)}`);
      after.rules = after.rules.filter((r) => r.id !== rule.id);
      break;
    }
    case "defaults": {
      const next = {
        ...(state.defaults ?? { incoming: "deny", outgoing: "allow" }),
        ...change.defaults,
      };
      if (next.incoming === "reject" || next.outgoing === "reject") {
        throw new FirewallError(
          "Windows Firewall can allow or block, not reject",
        );
      }
      lines.push(
        `Set-NetFirewallProfile -All -DefaultInboundAction ${windowsPolicy(next.incoming)} -DefaultOutboundAction ${windowsPolicy(next.outgoing)}`,
      );
      after.defaults = { incoming: next.incoming, outgoing: next.outgoing };
      break;
    }
    case "enable":
      if (state.active) return { script: "", after, noop: true };
      if (change.allowSsh) {
        for (const port of state.ssh.ports) {
          addRule({
            action: "allow",
            direction: "in",
            protocol: "tcp",
            port: String(port),
            source: "",
            destination: "",
            iface: "",
            family: "any",
            comment: "SSH (Termix)",
          });
        }
      }
      lines.push("Set-NetFirewallProfile -All -Enabled True");
      after.active = true;
      break;
    case "disable":
      if (!state.active) return { script: "", after, noop: true };
      lines.push("Set-NetFirewallProfile -All -Enabled False");
      after.active = false;
      break;
    default:
      throw new FirewallError("Windows Firewall has no zones");
  }
  return { script: lines.join("\n"), after };
}

function taskOf(token: string): string {
  if (!TOKEN_RE.test(token)) throw new Error("Bad rollback token");
  return `termix-fw-${token}`;
}

const dirLine = (token: string) =>
  `$dir = Join-Path $env:ProgramData ${psq(`Termix\\firewall\\${token}`)}`;

/**
 * Exports the policy, registers a task that imports it back after
 * `seconds`, then runs the change. A change that fails is undone at once.
 */
export function windowsArmScript(
  token: string,
  seconds: number,
  change: string,
): string {
  const task = taskOf(token);
  return ps(`
${dirLine(token)}
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$backup = Join-Path $dir 'backup.wfw'
netsh advfirewall export $backup | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Output 'Could not back up the firewall'; exit 1 }
$undo = "netsh advfirewall import \`"$backup\`"; Unregister-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -Confirm:\`$false; Remove-Item -Recurse -Force \`"$dir\`""
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument ('-NoProfile -NonInteractive -Command ' + $undo)
$trigger = New-ScheduledTaskTrigger -Once -At ((Get-Date).AddSeconds(${seconds}))
Register-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -Action $action -Trigger $trigger -User 'SYSTEM' -RunLevel Highest -Force | Out-Null
Write-Output '@@armed@@'
try {
${change.trim() || "$null = 0"}
} catch {
  Write-Output $_.Exception.Message
  netsh advfirewall import $backup | Out-Null
  Unregister-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -Confirm:$false
  Remove-Item -Recurse -Force $dir
  Write-Output '@@reverted@@'
  exit 1
}
Write-Output '@@applied@@'
exit 0
`);
}

export function windowsKeepScript(token: string): string {
  const task = taskOf(token);
  return ps(`
${dirLine(token)}
$t = Get-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -ErrorAction SilentlyContinue
if (-not $t) { Write-Output 'state=gone'; exit 0 }
Unregister-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -Confirm:$false
Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
Write-Output 'state=kept'
`);
}

export function windowsUndoScript(token: string): string {
  const task = taskOf(token);
  return ps(`
${dirLine(token)}
$t = Get-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -ErrorAction SilentlyContinue
if (-not $t) { Write-Output 'state=gone'; exit 0 }
Unregister-ScheduledTask -TaskName '${task}' -TaskPath '${TASK_PATH}' -Confirm:$false
netsh advfirewall import (Join-Path $dir 'backup.wfw') | Out-Null
Remove-Item -Recurse -Force $dir -ErrorAction SilentlyContinue
Write-Output 'state=reverted'
`);
}

/** A change run without the undo timer. */
export function windowsPlainScript(change: string): string {
  return ps(change || "$null = 0");
}

/** What Windows itself shows, for the raw view. */
export const WINDOWS_RAW = ps(`
Get-NetFirewallProfile | Format-Table Name, Enabled, DefaultInboundAction, DefaultOutboundAction -AutoSize | Out-String -Width 200
Get-NetFirewallRule -Group '${GROUP}' -ErrorAction SilentlyContinue | Format-Table Name, DisplayName, Enabled, Direction, Action -AutoSize | Out-String -Width 200
`);

/** PowerShell's -EncodedCommand wants UTF-16LE base64. */
export function encodedCommand(script: string): string {
  const body = script.startsWith(POWERSHELL)
    ? script.slice(POWERSHELL.length)
    : script;
  return `powershell -NoProfile -NonInteractive -EncodedCommand ${Buffer.from(body, "utf16le").toString("base64")}`;
}
