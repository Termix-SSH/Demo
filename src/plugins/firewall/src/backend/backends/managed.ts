import { randomBytes } from "node:crypto";
import type { Policy, Rule, RuleSpec } from "../../shared/types.js";
import { FirewallError } from "../errors.js";
import { STATE_DIR } from "../paths.js";
import { errLine, writeFile } from "../shell.js";
import { familyOf, parsePorts, parseRuleSpec, specKey } from "../validate.js";
import type {
  BackendModule,
  Change,
  HostState,
  ManagedDoc,
  ManagedRule,
  Plan,
  Sections,
  Snapshot,
} from "./types.js";
import { findRule, sshAllowSpecs } from "./ufw.js";

type ManagedBackend = "nftables" | "iptables";

const ID_RE = /^[a-f0-9]{8}$/;

export function newId(): string {
  return randomBytes(4).toString("hex");
}

export function emptyDoc(backend: ManagedBackend): ManagedDoc {
  return {
    version: 1,
    backend,
    enabled: false,
    defaults: { incoming: "deny", outgoing: "allow" },
    rules: [],
  };
}

const policyOr = (value: unknown, fallback: Policy): Policy =>
  value === "allow" || value === "deny" || value === "reject"
    ? value
    : fallback;

/** Reads rules.json from the host. Anything that does not check out is dropped. */
export function readDoc(
  text: string,
  backend: ManagedBackend,
): { doc: ManagedDoc; dropped: number } {
  const doc = emptyDoc(backend);
  let dropped = 0;
  if (!text.trim()) return { doc, dropped };
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { doc, dropped: 1 };
  }
  doc.enabled = parsed.enabled === true;
  const defaults = (parsed.defaults ?? {}) as Record<string, unknown>;
  doc.defaults = {
    incoming: policyOr(defaults.incoming, "deny"),
    outgoing: policyOr(defaults.outgoing, "allow"),
  };
  for (const item of Array.isArray(parsed.rules) ? parsed.rules : []) {
    try {
      const raw = item as Record<string, unknown>;
      const id = String(raw.id ?? "");
      const spec = parseRuleSpec(raw);
      if (!ID_RE.test(id) || spec.action === "limit" || spec.service)
        throw new Error("bad");
      doc.rules.push({ ...spec, id });
    } catch {
      dropped++;
    }
  }
  return { doc, dropped };
}

export function parseManaged(
  sections: Sections,
  state: HostState,
  backend: ManagedBackend,
): void {
  const { doc, dropped } = readDoc(sections["tx-rules"] ?? "", backend);
  const loaded = (sections["tx-live"] ?? "").includes("loaded");
  state.managed = doc;
  state.version = (sections["tx-version"] ?? "").trim();
  state.active = doc.enabled && loaded;
  state.defaults = { ...doc.defaults };
  state.rules = doc.rules.map((rule) => toRule(rule, backend));
  state.otherRules = Number((sections["tx-other"] ?? "0").trim()) || 0;
  state.persistent = (sections["tx-service"] ?? "").trim() === "enabled";
  if (dropped)
    state.warnings.push(
      `${dropped} saved rule(s) could not be read and were skipped.`,
    );
  if (doc.enabled && !loaded) {
    state.warnings.push(
      "The Termix rules are saved but not loaded. Turn the firewall off and on again.",
    );
  }
  if (doc.enabled && !state.persistent) {
    state.warnings.push(
      "The rules are not loaded again after a reboot on this host.",
    );
  }
  if (state.otherRules) {
    state.warnings.push(
      `Other tools have ${state.otherRules} rule(s) here that Termix leaves alone. A Termix allow can't open a port another tool blocks.`,
    );
  }
  if ((sections["tx-docker"] ?? "").includes("1")) {
    state.warnings.push(
      "Docker manages its own rules for published ports. Termix rules don't change those.",
    );
  }
}

function toRule(rule: ManagedRule, backend: ManagedBackend): Rule {
  return {
    ...rule,
    managed: true,
    raw:
      backend === "nftables"
        ? nftRule(rule)
        : iptRules(rule, "4").concat(iptRules(rule, "6")).join("\n"),
  };
}

const VERDICT = {
  allow: "accept",
  deny: "drop",
  reject: "reject",
  limit: "accept",
} as const;
const TARGET = {
  allow: "ACCEPT",
  deny: "DROP",
  reject: "REJECT",
  limit: "ACCEPT",
} as const;

function commentText(rule: ManagedRule, max: number): string {
  return `tx:${rule.id}${rule.comment ? ` ${rule.comment}` : ""}`.slice(0, max);
}

/** One rule as an nft statement, inside the termix table. */
export function nftRule(rule: ManagedRule): string {
  const parts: string[] = [];
  const addrFamily = familyOf(rule.source || rule.destination);
  if (addrFamily === "any" && rule.family !== "any") {
    parts.push(`meta nfproto ${rule.family}`);
  }
  if (rule.iface)
    parts.push(
      `${rule.direction === "in" ? "iifname" : "oifname"} "${rule.iface}"`,
    );
  if (rule.source)
    parts.push(
      `${familyOf(rule.source) === "ipv6" ? "ip6" : "ip"} saddr ${rule.source}`,
    );
  if (rule.destination) {
    parts.push(
      `${familyOf(rule.destination) === "ipv6" ? "ip6" : "ip"} daddr ${rule.destination}`,
    );
  }
  const ports = parsePorts(rule.port).map((p) =>
    p.from === p.to ? String(p.from) : `${p.from}-${p.to}`,
  );
  const set = ports.length === 1 ? ports[0] : `{ ${ports.join(", ")} }`;
  if (ports.length) {
    parts.push(
      rule.protocol === "any"
        ? `meta l4proto { tcp, udp } th dport ${set}`
        : `${rule.protocol} dport ${set}`,
    );
  } else if (rule.protocol !== "any") {
    parts.push(`meta l4proto ${rule.protocol}`);
  }
  parts.push(VERDICT[rule.action], `comment "${commentText(rule, 120)}"`);
  return parts.join(" ");
}

function inFamily(rule: ManagedRule, v: "4" | "6"): boolean {
  const addr = familyOf(rule.source || rule.destination);
  const family = addr !== "any" ? addr : rule.family;
  return family === "any" || family === (v === "4" ? "ipv4" : "ipv6");
}

/** One rule as iptables-restore lines for one family. Empty when it is for the other family. */
export function iptRules(rule: ManagedRule, v: "4" | "6"): string[] {
  if (!inFamily(rule, v)) return [];
  const chain = rule.direction === "in" ? "TERMIX-IN" : "TERMIX-OUT";
  const base: string[] = ["-A", chain];
  if (rule.iface) base.push(rule.direction === "in" ? "-i" : "-o", rule.iface);
  if (rule.source) base.push("-s", rule.source);
  if (rule.destination) base.push("-d", rule.destination);
  const ports = parsePorts(rule.port).map((p) =>
    p.from === p.to ? String(p.from) : `${p.from}:${p.to}`,
  );
  const tail = [
    "-m",
    "comment",
    "--comment",
    `"${commentText(rule, 200)}"`,
    "-j",
    TARGET[rule.action],
  ];
  const protos =
    rule.protocol === "any"
      ? ports.length
        ? ["tcp", "udp"]
        : []
      : [rule.protocol];
  if (!protos.length) return [[...base, ...tail].join(" ")];
  return protos.map((proto) => {
    const match = ["-p", proto];
    if (ports.length === 1 && !ports[0].includes(":"))
      match.push("--dport", ports[0]);
    else if (ports.length)
      match.push("-m", "multiport", "--dports", ports.join(","));
    return [...base, ...match, ...tail].join(" ");
  });
}

const DEFAULT_VERDICT = { allow: "", deny: "drop", reject: "reject" } as const;
const DEFAULT_TARGET = {
  allow: "",
  deny: "-j DROP",
  reject: "-j REJECT",
} as const;

export function renderNft(doc: ManagedDoc): string {
  const rules = (dir: "in" | "out") =>
    doc.rules
      .filter((r) => r.direction === dir)
      .map((r) => `\t\t${nftRule(r)}`);
  const end = (policy: Policy) =>
    DEFAULT_VERDICT[policy] ? [`\t\t${DEFAULT_VERDICT[policy]}`] : [];
  return [
    "# Written by Termix. Changes here are replaced on the next save.",
    "table inet termix {}",
    "delete table inet termix",
    "table inet termix {",
    "\tchain input {",
    "\t\ttype filter hook input priority -5; policy accept;",
    "\t\tct state established,related accept",
    '\t\tiifname "lo" accept',
    "\t\tmeta l4proto { icmp, ipv6-icmp } accept",
    "\t\tudp sport 67 udp dport 68 accept",
    "\t\tudp sport 547 udp dport 546 accept",
    ...rules("in"),
    ...end(doc.defaults.incoming),
    "\t}",
    "\tchain output {",
    "\t\ttype filter hook output priority -5; policy accept;",
    "\t\tct state established,related accept",
    '\t\toifname "lo" accept',
    "\t\tmeta l4proto { icmp, ipv6-icmp } accept",
    ...rules("out"),
    ...end(doc.defaults.outgoing),
    "\t}",
    "}",
    "",
  ].join("\n");
}

export function renderIptables(doc: ManagedDoc, v: "4" | "6"): string {
  const icmp = v === "4" ? "icmp" : "ipv6-icmp";
  const dhcp = v === "4" ? "--sport 67 --dport 68" : "--sport 547 --dport 546";
  const rules = (dir: "in" | "out") =>
    doc.rules.filter((r) => r.direction === dir).flatMap((r) => iptRules(r, v));
  const end = (chain: string, policy: Policy) =>
    DEFAULT_TARGET[policy] ? [`-A ${chain} ${DEFAULT_TARGET[policy]}`] : [];
  return [
    "# Written by Termix. Changes here are replaced on the next save.",
    "*filter",
    ":TERMIX-IN - [0:0]",
    ":TERMIX-OUT - [0:0]",
    "-A TERMIX-IN -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT",
    "-A TERMIX-IN -i lo -j ACCEPT",
    `-A TERMIX-IN -p ${icmp} -j ACCEPT`,
    `-A TERMIX-IN -p udp ${dhcp} -j ACCEPT`,
    ...rules("in"),
    ...end("TERMIX-IN", doc.defaults.incoming),
    "-A TERMIX-OUT -m conntrack --ctstate RELATED,ESTABLISHED -j ACCEPT",
    "-A TERMIX-OUT -o lo -j ACCEPT",
    `-A TERMIX-OUT -p ${icmp} -j ACCEPT`,
    ...rules("out"),
    ...end("TERMIX-OUT", doc.defaults.outgoing),
    "COMMIT",
    "",
  ].join("\n");
}

/** Loads or unloads the saved rules. Also run at boot by termix-firewall.service. */
export const APPLY_SH = `#!/bin/sh
# Written by Termix. Loads the Termix firewall rules.
D=${STATE_DIR}
B=$(sed -n 's/^BACKEND=//p' "$D/state.env")
E=$(sed -n 's/^ENABLED=//p' "$D/state.env")
if [ "$B" = nftables ]; then
  if [ "$E" = 1 ]; then nft -f "$D/termix.nft"; exit $?; fi
  nft delete table inet termix 2>/dev/null
  exit 0
fi
rc=0
for T in iptables ip6tables; do
  command -v $T >/dev/null 2>&1 || continue
  F="$D/rules.v4"
  [ $T = ip6tables ] && F="$D/rules.v6"
  while $T -D INPUT -j TERMIX-IN 2>/dev/null; do :; done
  while $T -D OUTPUT -j TERMIX-OUT 2>/dev/null; do :; done
  $T -F TERMIX-IN 2>/dev/null
  $T -F TERMIX-OUT 2>/dev/null
  if [ "$E" = 1 ]; then
    $T-restore --noflush < "$F" || rc=1
    $T -I INPUT 1 -j TERMIX-IN || rc=1
    $T -I OUTPUT 1 -j TERMIX-OUT || rc=1
  else
    $T -X TERMIX-IN 2>/dev/null
    $T -X TERMIX-OUT 2>/dev/null
  fi
done
exit $rc
`;

export const UNIT = `[Unit]
Description=Termix firewall rules
DefaultDependencies=no
Wants=network-pre.target
Before=network-pre.target shutdown.target
After=local-fs.target nftables.service netfilter-persistent.service iptables.service ip6tables.service
Conflicts=shutdown.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/bin/sh ${STATE_DIR}/apply.sh

[Install]
WantedBy=sysinit.target
`;

/** Removes every trace of the Termix rules from the running firewall. */
export const UNLOAD = `
command -v nft >/dev/null 2>&1 && nft delete table inet termix 2>/dev/null
for T in iptables ip6tables; do
  command -v $T >/dev/null 2>&1 || continue
  while $T -D INPUT -j TERMIX-IN 2>/dev/null; do :; done
  while $T -D OUTPUT -j TERMIX-OUT 2>/dev/null; do :; done
  for C in TERMIX-IN TERMIX-OUT; do $T -F $C 2>/dev/null; $T -X $C 2>/dev/null; done
done
`;

/** Writes the rules, checks them, saves them and loads them. */
export function saveScript(doc: ManagedDoc, hasSystemd: boolean): string {
  const fail = (message: string) =>
    `{ rm -rf "$T"; ${errLine(message)}; exit 1; }`;
  const lines = [
    `T=$(mktemp -d) || exit 1`,
    writeFile("$T/rules.json", `${JSON.stringify(doc, null, 2)}\n`),
    writeFile(
      "$T/state.env",
      `BACKEND=${doc.backend}\nENABLED=${doc.enabled ? 1 : 0}\n`,
    ),
    writeFile("$T/apply.sh", APPLY_SH, "700"),
  ];
  if (doc.backend === "nftables") {
    lines.push(writeFile("$T/termix.nft", renderNft(doc)));
    if (doc.enabled) {
      lines.push(
        `nft -c -f "$T/termix.nft" >/dev/null || ${fail("nft did not accept the rules")}`,
      );
    }
  } else {
    lines.push(writeFile("$T/rules.v4", renderIptables(doc, "4")));
    lines.push(writeFile("$T/rules.v6", renderIptables(doc, "6")));
    if (doc.enabled) {
      lines.push(
        `iptables-restore --test --noflush < "$T/rules.v4" || ${fail("iptables did not accept the rules")}`,
      );
      lines.push(
        `if command -v ip6tables-restore >/dev/null 2>&1; then ip6tables-restore --test --noflush < "$T/rules.v6" || ${fail("ip6tables did not accept the rules")}; fi`,
      );
    }
  }
  lines.push(
    `mkdir -p ${STATE_DIR} && chmod 700 ${STATE_DIR} && cp -p "$T"/* ${STATE_DIR}/ && rm -rf "$T"`,
  );
  if (hasSystemd) {
    lines.push(
      `if [ ! -f /etc/systemd/system/termix-firewall.service ]; then`,
      `  ${writeFile("/etc/systemd/system/termix-firewall.service", UNIT, "644")}`,
      `  systemctl daemon-reload >/dev/null 2>&1`,
      `fi`,
      `systemctl enable termix-firewall >/dev/null 2>&1`,
    );
  }
  lines.push(
    `sh ${STATE_DIR}/apply.sh || { ${errLine("The rules could not be loaded")}; exit 1; }`,
  );
  return lines.join("\n");
}

function checkSpec(spec: RuleSpec): void {
  if (spec.action === "limit") throw new FirewallError("Limit is only on UFW");
  if (spec.service)
    throw new FirewallError(
      "Services are a firewalld feature. Use ports here.",
    );
}

function snapshot(
  doc: ManagedDoc,
  backend: ManagedBackend,
  state: HostState,
): Snapshot {
  return {
    active: doc.enabled,
    defaults: { ...doc.defaults },
    rules: doc.rules.map((rule) => toRule(rule, backend)),
    zones: state.zones,
    defaultZone: state.defaultZone,
  };
}

function makePlan(backend: ManagedBackend) {
  return (state: HostState, change: Change): Plan => {
    const doc: ManagedDoc = structuredClone(state.managed ?? emptyDoc(backend));
    doc.backend = backend;
    const keys = new Set(doc.rules.map((r) => specKey(r)));
    let noop = false;
    switch (change.kind) {
      case "add":
      case "addMany": {
        const specs = change.kind === "add" ? [change.spec] : change.specs;
        let added = 0;
        for (const spec of specs) {
          checkSpec(spec);
          if (keys.has(specKey(spec))) continue;
          keys.add(specKey(spec));
          doc.rules.push({ ...spec, id: newId() });
          added++;
        }
        if (change.kind === "add" && !added)
          throw new FirewallError("This rule is already there");
        noop = !added;
        break;
      }
      case "update": {
        findRule(state, change.id);
        checkSpec(change.spec);
        doc.rules = doc.rules.map((r) =>
          r.id === change.id ? { ...change.spec, id: r.id } : r,
        );
        break;
      }
      case "remove":
        findRule(state, change.id);
        doc.rules = doc.rules.filter((r) => r.id !== change.id);
        break;
      case "defaults":
        if (change.defaults.incoming)
          doc.defaults.incoming = change.defaults.incoming;
        if (change.defaults.outgoing)
          doc.defaults.outgoing = change.defaults.outgoing;
        break;
      case "enable": {
        if (change.allowSsh) {
          const ssh = sshAllowSpecs(state.ssh.ports).filter(
            (spec) => !keys.has(specKey(spec)),
          );
          doc.rules = [
            ...ssh.map((spec) => ({ ...spec, id: newId() })),
            ...doc.rules,
          ];
        }
        doc.enabled = true;
        break;
      }
      case "disable":
        doc.enabled = false;
        break;
      default:
        throw new FirewallError("Zones are a firewalld feature");
    }
    return {
      script: noop ? "" : saveScript(doc, state.hasSystemd),
      after: snapshot(doc, backend, state),
      noop,
    };
  };
}

const BACKUP = `
mkdir -p "$DIR"
if [ -d ${STATE_DIR} ]; then cp -a ${STATE_DIR} "$DIR/tx"; fi
`;

const RESTORE = `
if [ -d "$DIR/tx" ]; then
  rm -rf ${STATE_DIR} && cp -a "$DIR/tx" ${STATE_DIR} && sh ${STATE_DIR}/apply.sh >/dev/null 2>&1
else
  ${UNLOAD}
  rm -rf ${STATE_DIR}
  if command -v systemctl >/dev/null 2>&1; then
    systemctl disable termix-firewall >/dev/null 2>&1
    rm -f /etc/systemd/system/termix-firewall.service
    systemctl daemon-reload >/dev/null 2>&1
  fi
fi
`;

export const nftablesModule: BackendModule = {
  plan: makePlan("nftables"),
  backup: BACKUP,
  restore: RESTORE,
  raw: `nft list ruleset 2>&1`,
};

export const iptablesModule: BackendModule = {
  plan: makePlan("iptables"),
  backup: BACKUP,
  restore: RESTORE,
  raw: `echo "# IPv4"; iptables-save 2>&1; echo; echo "# IPv6"; ip6tables-save 2>&1`,
};
