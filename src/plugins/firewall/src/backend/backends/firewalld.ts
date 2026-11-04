import type {
  Policy,
  Rule,
  RuleAction,
  RuleSpec,
  Zone,
} from "../../shared/types.js";
import { FirewallError } from "../errors.js";
import { errLine, hashId, shellQuote } from "../shell.js";
import { familyOf, parsePorts, requireZone, specKey } from "../validate.js";
import type {
  BackendModule,
  Change,
  HostState,
  Plan,
  Sections,
} from "./types.js";
import { snapshotOf } from "./types.js";
import { findRule } from "./ufw.js";

export const ZONE_TARGETS = [
  "default",
  "ACCEPT",
  "DROP",
  "%%REJECT%%",
  "REJECT",
] as const;

interface ZoneBlock {
  zone: Zone;
  services: string[];
  ports: string[];
  rich: string[];
}

/** Reads `firewall-cmd --list-all-zones`. */
export function parseZones(text: string): ZoneBlock[] {
  const blocks: ZoneBlock[] = [];
  let current: ZoneBlock | null = null;
  let inRich = false;
  for (const raw of text.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) {
      inRich = false;
      continue;
    }
    const header = /^(\S+)(?:\s+\(([^)]*)\))?\s*$/.exec(line);
    if (header && !/^\s/.test(line)) {
      const flags = (header[2] ?? "").split(",").map((s) => s.trim());
      current = {
        zone: {
          name: header[1],
          target: "default",
          active: flags.includes("active"),
          isDefault: flags.includes("default"),
          interfaces: [],
          sources: [],
        },
        services: [],
        ports: [],
        rich: [],
      };
      blocks.push(current);
      inRich = false;
      continue;
    }
    if (!current) continue;
    if (inRich && /^\s+rule\b/.test(line)) {
      current.rich.push(line.trim());
      continue;
    }
    const kv = /^\s+([a-z -]+):\s?(.*)$/.exec(line);
    if (!kv) continue;
    const [, key, value] = kv;
    const list = value.trim() ? value.trim().split(/\s+/) : [];
    inRich = key === "rich rules";
    if (key === "target") current.zone.target = value.trim() || "default";
    else if (key === "interfaces") current.zone.interfaces = list;
    else if (key === "sources") current.zone.sources = list;
    else if (key === "services") current.services = list;
    else if (key === "ports") current.ports = list;
    else if (inRich && value.trim().startsWith("rule"))
      current.rich.push(value.trim());
  }
  return blocks;
}

function splitPortProto(text: string): { port: string; protocol: string } {
  const [port, protocol = ""] = text.split("/");
  return { port, protocol };
}

function serviceRule(zone: string, name: string, ports: string): Rule {
  const parts = ports.split(/\s+/).filter(Boolean).map(splitPortProto);
  const protos = new Set(parts.map((p) => p.protocol));
  const sameProto =
    protos.size === 1 && (protos.has("tcp") || protos.has("udp"));
  return {
    id: hashId(`${zone}|service|${name}`),
    action: "allow",
    direction: "in",
    protocol: sameProto ? ([...protos][0] as "tcp" | "udp") : "any",
    port: sameProto ? parts.map((p) => p.port).join(",") : "",
    source: "",
    destination: "",
    iface: "",
    family: "any",
    comment: "",
    service: name,
    managed: true,
    raw: `service ${name}`,
    zone,
  };
}

function portRule(zone: string, entry: string): Rule {
  const { port, protocol } = splitPortProto(entry);
  const known = protocol === "tcp" || protocol === "udp";
  return {
    id: hashId(`${zone}|port|${entry}`),
    action: "allow",
    direction: "in",
    protocol: known ? protocol : "any",
    port,
    source: "",
    destination: "",
    iface: "",
    family: "any",
    comment: "",
    managed: known,
    readOnlyReason: known
      ? undefined
      : `Protocol ${protocol} can't be changed here`,
    raw: `port ${entry}`,
    zone,
  };
}

const RICH_ACTIONS: Record<string, RuleAction> = {
  accept: "allow",
  drop: "deny",
  reject: "reject",
};

/** Maps a rich rule to a rule. Ones Termix can't fully read can still be deleted. */
export function parseRichRule(zone: string, text: string): Rule {
  const tokens = text.match(/[A-Za-z-]+="[^"]*"|\S+/g) ?? [];
  const value = (token: string | undefined, key: string) => {
    const m = token ? new RegExp(`^${key}="([^"]*)"$`).exec(token) : null;
    return m ? m[1] : null;
  };
  const rule: Rule = {
    id: hashId(`${zone}|rich|${text}`),
    action: "allow",
    direction: "in",
    protocol: "any",
    port: "",
    source: "",
    destination: "",
    iface: "",
    family: "any",
    comment: "",
    managed: true,
    raw: text,
    zone,
  };
  let simple = tokens[0] === "rule";
  let action: RuleAction | null = null;
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    const fam = value(token, "family");
    if (fam) {
      rule.family = fam === "ipv6" ? "ipv6" : "ipv4";
      continue;
    }
    if (token === "source" || token === "destination") {
      const address = value(tokens[i + 1], "address");
      if (address) {
        if (token === "source") rule.source = address;
        else rule.destination = address;
        i++;
      } else {
        simple = false;
      }
      continue;
    }
    if (token === "service") {
      const name = value(tokens[i + 1], "name");
      if (name) {
        rule.service = name;
        i++;
      } else simple = false;
      continue;
    }
    if (token === "port") {
      const port = value(tokens[i + 1], "port");
      const protocol = value(tokens[i + 2], "protocol");
      if (port && (protocol === "tcp" || protocol === "udp")) {
        rule.port = port;
        rule.protocol = protocol;
        i += 2;
      } else simple = false;
      continue;
    }
    if (RICH_ACTIONS[token]) {
      action = RICH_ACTIONS[token];
      continue;
    }
    simple = false;
  }
  if (action) rule.action = action;
  if (!simple || !action) {
    rule.deleteOnly = true;
  }
  return rule;
}

const TARGET_POLICY = (target: string): Policy =>
  target === "ACCEPT" ? "allow" : target === "DROP" ? "deny" : "reject";

export function parseFirewalld(
  sections: Sections,
  state: HostState,
  running: boolean,
): void {
  state.version = (sections["fwd-version"] ?? "").trim();
  state.active = running;
  state.defaultZone = (sections["fwd-default"] ?? "").trim();
  const services = new Map<string, string>();
  for (const line of (sections["fwd-services"] ?? "").split("\n")) {
    const eq = line.indexOf("=");
    if (eq > 0)
      services.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  const blocks = parseZones(sections["fwd-zones"] ?? "");
  for (const block of blocks) {
    if (block.zone.name === state.defaultZone) block.zone.isDefault = true;
  }
  state.zones = blocks.map((b) => b.zone);
  const rules: Rule[] = [];
  for (const block of blocks) {
    if (!block.zone.active && !block.zone.isDefault) continue;
    const zone = block.zone.name;
    for (const name of block.services)
      rules.push(serviceRule(zone, name, services.get(name) ?? ""));
    for (const entry of block.ports) rules.push(portRule(zone, entry));
    for (const text of block.rich) rules.push(parseRichRule(zone, text));
  }
  state.rules = rules;
  const main = state.zones.find((z) => z.isDefault);
  state.defaults = {
    incoming: TARGET_POLICY(main?.target ?? "default"),
    outgoing: "allow",
  };
  if (!running)
    state.warnings.push("firewalld is off. Turn it on to change rules.");
}

function richText(
  spec: RuleSpec,
  port?: { port: string; protocol: string },
): string {
  const parts = ["rule"];
  const family =
    spec.source || spec.destination
      ? familyOf(spec.source || spec.destination)
      : spec.family;
  if (family !== "any") parts.push(`family="${family}"`);
  if (spec.source) parts.push("source", `address="${spec.source}"`);
  if (spec.destination)
    parts.push("destination", `address="${spec.destination}"`);
  if (spec.service) parts.push("service", `name="${spec.service}"`);
  else if (port)
    parts.push("port", `port="${port.port}"`, `protocol="${port.protocol}"`);
  else if (spec.protocol !== "any")
    parts.push("protocol", `value="${spec.protocol}"`);
  parts.push(
    spec.action === "allow"
      ? "accept"
      : spec.action === "deny"
        ? "drop"
        : "reject",
  );
  return parts.join(" ");
}

function portEntries(
  spec: RuleSpec,
): Array<{ port: string; protocol: string }> {
  const protos = spec.protocol === "any" ? ["tcp", "udp"] : [spec.protocol];
  const parts = parsePorts(spec.port);
  const out: Array<{ port: string; protocol: string }> = [];
  for (const part of parts) {
    const port =
      part.from === part.to ? String(part.from) : `${part.from}-${part.to}`;
    for (const protocol of protos) out.push({ port, protocol });
  }
  return out;
}

/** firewall-cmd arguments that add a rule, each run on runtime and permanent. */
export function addArgs(spec: RuleSpec): string[] {
  if (spec.direction === "out") {
    throw new FirewallError("firewalld zones only filter incoming traffic");
  }
  if (spec.iface)
    throw new FirewallError(
      "In firewalld, put the interface in a zone instead",
    );
  if (spec.action === "limit") throw new FirewallError("Limit is only on UFW");
  const plain =
    spec.action === "allow" &&
    !spec.source &&
    !spec.destination &&
    spec.family === "any";
  if (spec.service) {
    return plain
      ? [`--add-service=${spec.service}`]
      : [`--add-rich-rule=${richText(spec)}`];
  }
  const ports = portEntries(spec);
  if (plain && ports.length)
    return ports.map((p) => `--add-port=${p.port}/${p.protocol}`);
  if (!ports.length) return [`--add-rich-rule=${richText(spec)}`];
  return ports.map((p) => `--add-rich-rule=${richText(spec, p)}`);
}

export function removeArgs(rule: Rule): string {
  if (!rule.managed)
    throw new FirewallError(
      rule.readOnlyReason ?? "This rule can't be deleted here",
    );
  if (rule.raw.startsWith("service "))
    return `--remove-service=${rule.raw.slice(8)}`;
  if (rule.raw.startsWith("port ")) return `--remove-port=${rule.raw.slice(5)}`;
  if (rule.raw.startsWith("rule")) return `--remove-rich-rule=${rule.raw}`;
  throw new FirewallError("This rule can't be deleted here");
}

const FW = `fw() { firewall-cmd "$@" >/dev/null || return 1; firewall-cmd --permanent "$@" >/dev/null; }`;

function fwLine(zone: string, arg: string, fail: string): string {
  return `fw --zone=${shellQuote(zone)} ${shellQuote(arg)} || { ${fail} }`;
}

function zoneFor(state: HostState, zone?: string): string {
  const name = zone ? requireZone(zone) : state.defaultZone;
  if (!state.zones.some((z) => z.name === name))
    throw new FirewallError(`There is no zone ${name}`);
  return name;
}

function ruleFrom(spec: RuleSpec, zone: string, id: string): Rule {
  return { ...spec, id, managed: true, raw: "", zone };
}

function requireRunning(state: HostState): void {
  if (!state.active)
    throw new FirewallError("Turn firewalld on first", 409, {
      code: "inactive",
    });
}

function plan(state: HostState, change: Change): Plan {
  const before = snapshotOf(state);
  const fail = (message: string) => `${errLine(message)}; exit 1;`;
  switch (change.kind) {
    case "add":
    case "addMany": {
      requireRunning(state);
      const zone = zoneFor(state, change.zone);
      const specs = change.kind === "add" ? [change.spec] : change.specs;
      const keys = new Set(
        state.rules.filter((r) => r.zone === zone).map((r) => specKey(r)),
      );
      const lines = [FW];
      const added: Rule[] = [];
      for (const spec of specs) {
        if (keys.has(specKey(spec))) continue;
        keys.add(specKey(spec));
        for (const arg of addArgs(spec))
          lines.push(fwLine(zone, arg, fail("firewalld refused the rule")));
        added.push(ruleFrom(spec, zone, `new-${added.length}`));
      }
      if (change.kind === "add" && !added.length)
        throw new FirewallError("This rule is already there");
      return {
        script: lines.join("\n"),
        after: { ...before, rules: [...state.rules, ...added] },
        noop: !added.length,
      };
    }
    case "update": {
      requireRunning(state);
      const old = findRule(state, change.id);
      if (old.deleteOnly)
        throw new FirewallError("This rule can only be deleted");
      const zone = old.zone ?? state.defaultZone;
      const restore = addArgs(old)
        .map(
          (arg) =>
            `fw --zone=${shellQuote(zone)} ${shellQuote(arg)} >/dev/null 2>&1`,
        )
        .join("; ");
      const lines = [
        FW,
        fwLine(
          zone,
          removeArgs(old),
          fail("firewalld could not remove the old rule"),
        ),
      ];
      for (const arg of addArgs(change.spec)) {
        lines.push(
          fwLine(
            zone,
            arg,
            `${restore}; ${fail("firewalld refused the new rule, the old one is back")}`,
          ),
        );
      }
      return {
        script: lines.join("\n"),
        after: {
          ...before,
          rules: state.rules.map((r) =>
            r.id === old.id ? ruleFrom(change.spec, zone, old.id) : r,
          ),
        },
      };
    }
    case "remove": {
      requireRunning(state);
      const old = findRule(state, change.id);
      const zone = old.zone ?? state.defaultZone;
      return {
        script: [
          FW,
          fwLine(
            zone,
            removeArgs(old),
            fail("firewalld could not remove the rule"),
          ),
        ].join("\n"),
        after: { ...before, rules: state.rules.filter((r) => r.id !== old.id) },
      };
    }
    case "defaults": {
      if (change.defaults.outgoing && change.defaults.outgoing !== "allow") {
        throw new FirewallError(
          "firewalld zones don't filter outgoing traffic",
        );
      }
      if (!change.defaults.incoming) {
        return { script: "", after: before, noop: true };
      }
      const target =
        change.defaults.incoming === "allow"
          ? "ACCEPT"
          : change.defaults.incoming === "deny"
            ? "DROP"
            : "%%REJECT%%";
      return plan(state, {
        kind: "zoneTarget",
        zone: state.defaultZone,
        target,
      });
    }
    case "zoneTarget": {
      requireRunning(state);
      const zone = zoneFor(state, change.zone);
      if (
        !ZONE_TARGETS.includes(change.target as (typeof ZONE_TARGETS)[number])
      ) {
        throw new FirewallError(`Bad zone target: ${change.target}`);
      }
      const zones = state.zones.map((z) =>
        z.name === zone ? { ...z, target: change.target } : z,
      );
      const isMain = zone === state.defaultZone;
      return {
        script: [
          `firewall-cmd --permanent --zone=${shellQuote(zone)} --set-target=${shellQuote(change.target)} >/dev/null || { ${fail("firewalld could not set the target")} }`,
          `firewall-cmd --reload >/dev/null || { ${fail("firewalld could not reload")} }`,
        ].join("\n"),
        after: {
          ...before,
          zones,
          defaults: isMain
            ? { incoming: TARGET_POLICY(change.target), outgoing: "allow" }
            : before.defaults,
        },
      };
    }
    case "defaultZone": {
      requireRunning(state);
      const zone = zoneFor(state, change.zone);
      const target =
        state.zones.find((z) => z.name === zone)?.target ?? "default";
      return {
        script: `firewall-cmd --set-default-zone=${shellQuote(zone)} >/dev/null || { ${fail("firewalld could not change the default zone")} }`,
        after: {
          ...before,
          defaultZone: zone,
          zones: state.zones.map((z) => ({ ...z, isDefault: z.name === zone })),
          defaults: { incoming: TARGET_POLICY(target), outgoing: "allow" },
        },
      };
    }
    case "enable": {
      const lines: string[] = [];
      const added: Rule[] = [];
      if (change.allowSsh) {
        lines.push(`if command -v firewall-offline-cmd >/dev/null 2>&1; then`);
        lines.push(
          `  Z=$(firewall-offline-cmd --get-default-zone 2>/dev/null)`,
        );
        for (const port of state.ssh.ports) {
          lines.push(
            `  firewall-offline-cmd --zone="$Z" --add-port=${port}/tcp >/dev/null 2>&1`,
          );
          added.push(
            ruleFrom(
              {
                action: "allow",
                direction: "in",
                protocol: "tcp",
                port: String(port),
                source: "",
                destination: "",
                iface: "",
                family: "any",
                comment: "",
              },
              state.defaultZone,
              `ssh-${port}`,
            ),
          );
        }
        lines.push(`fi`);
      }
      lines.push(
        `systemctl enable --now firewalld >/dev/null 2>&1 || { ${fail("firewalld could not be started")} }`,
      );
      return {
        script: lines.join("\n"),
        after: { ...before, active: true, rules: [...state.rules, ...added] },
      };
    }
    case "disable":
      return {
        script: `systemctl disable --now firewalld >/dev/null 2>&1 || { ${fail("firewalld could not be stopped")} }`,
        after: { ...before, active: false },
      };
  }
}

export const firewalldModule: BackendModule = {
  plan,
  backup: `
mkdir -p "$DIR"
cp -a /etc/firewalld "$DIR/firewalld"
if systemctl is-active -q firewalld 2>/dev/null; then echo 1 > "$DIR/was_on"; else echo 0 > "$DIR/was_on"; fi
if systemctl is-enabled -q firewalld 2>/dev/null; then echo 1 > "$DIR/was_enabled"; else echo 0 > "$DIR/was_enabled"; fi
`,
  restore: `
if [ -d "$DIR/firewalld" ]; then rm -rf /etc/firewalld && cp -a "$DIR/firewalld" /etc/firewalld; fi
if [ "$(cat "$DIR/was_on" 2>/dev/null)" = 1 ]; then
  if systemctl is-active -q firewalld; then firewall-cmd --reload >/dev/null 2>&1; else systemctl start firewalld >/dev/null 2>&1; fi
else
  systemctl stop firewalld >/dev/null 2>&1
fi
if [ "$(cat "$DIR/was_enabled" 2>/dev/null)" = 1 ]; then systemctl enable firewalld >/dev/null 2>&1; else systemctl disable firewalld >/dev/null 2>&1; fi
`,
  raw: `if [ "$(firewall-cmd --state 2>/dev/null)" = running ]; then firewall-cmd --list-all-zones 2>&1; else firewall-offline-cmd --list-all-zones 2>&1; fi`,
};
