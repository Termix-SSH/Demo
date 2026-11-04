import type { Policy, Rule, RuleAction, RuleSpec } from "../../shared/types.js";
import { FirewallError } from "../errors.js";
import { errLine, hashId, words } from "../shell.js";
import { specKey } from "../validate.js";
import type {
  BackendModule,
  Change,
  HostState,
  Plan,
  Sections,
} from "./types.js";
import { snapshotOf } from "./types.js";

interface Tuple {
  action: RuleAction;
  log: "" | "log" | "log-all";
  route: boolean;
  protocol: string;
  port: string;
  destination: string;
  sourcePort: string;
  source: string;
  direction: string;
  iface: string;
  app: string;
  sourceApp: string;
  comment: string;
}

const ANY = new Set(["0.0.0.0/0", "::/0", "any"]);
const POLICY: Record<string, Policy> = {
  ACCEPT: "allow",
  DROP: "deny",
  REJECT: "reject",
};

function decodeHex(hex: string): string {
  if (!/^([0-9a-fA-F]{2})*$/.test(hex)) return "";
  return Buffer.from(hex, "hex").toString("utf8");
}

/** Reads one `### tuple ###` line from user.rules. */
export function parseTuple(line: string): Tuple | null {
  const body = line.replace(/^### tuple ###\s*/, "").trim();
  if (!body) return null;
  let comment = "";
  const tokens = body.split(/\s+/).filter((token) => {
    if (token.startsWith("comment=")) {
      comment = decodeHex(token.slice(8));
      return false;
    }
    return true;
  });
  if (tokens.length !== 7 && tokens.length !== 9) return null;
  // Rules with an app profile carry the app names beside their ports.
  const [actionTok, protocol, dport, dst, sport, src, dirTok, dapp, sapp] =
    tokens.length === 9
      ? [
          tokens[0],
          tokens[1],
          tokens[2],
          tokens[4],
          tokens[5],
          tokens[7],
          tokens[8],
          tokens[3],
          tokens[6],
        ]
      : tokens;
  let route = false;
  let action = actionTok;
  if (action.startsWith("route:")) {
    route = true;
    action = action.slice(6);
  }
  let log: Tuple["log"] = "";
  if (action.endsWith("_log-all")) {
    log = "log-all";
    action = action.slice(0, -8);
  } else if (action.endsWith("_log")) {
    log = "log";
    action = action.slice(0, -4);
  }
  if (!["allow", "deny", "reject", "limit"].includes(action)) return null;
  const [direction, ...ifaceParts] = dirTok.split("_");
  const app = (s: string | undefined) =>
    !s || s === "-" ? "" : s.replace(/%20/g, " ");
  return {
    action: action as RuleAction,
    log,
    route,
    protocol,
    port: dport === "any" ? "" : dport.replace(/:/g, "-"),
    destination: ANY.has(dst) ? "" : dst,
    sourcePort: sport === "any" ? "" : sport,
    source: ANY.has(src) ? "" : src,
    direction,
    iface: ifaceParts.join("_"),
    app: app(dapp),
    sourceApp: app(sapp),
    comment,
  };
}

function readOnlyReason(t: Tuple): string | undefined {
  if (t.route) return "Routed rules can't be changed here yet";
  if (t.direction !== "in" && t.direction !== "out")
    return "This rule has an unusual direction";
  if (t.iface.includes("!")) return "This rule names two interfaces";
  if (!["tcp", "udp", "any"].includes(t.protocol))
    return `Protocol ${t.protocol} can't be changed here`;
  if (t.sourcePort) return "Rules with a source port can't be changed here";
  if (t.sourceApp)
    return "Rules with a source app profile can't be changed here";
  return undefined;
}

function sameFlow(a: Tuple, b: Tuple): boolean {
  return (
    a.action === b.action &&
    a.log === b.log &&
    a.route === b.route &&
    a.protocol === b.protocol &&
    a.port === b.port &&
    a.sourcePort === b.sourcePort &&
    a.direction === b.direction &&
    a.iface === b.iface &&
    a.app === b.app &&
    a.sourceApp === b.sourceApp &&
    a.comment === b.comment &&
    !a.source &&
    !a.destination &&
    !b.source &&
    !b.destination
  );
}

function toRule(
  t: Tuple,
  raw: string,
  family: Rule["family"],
  position: number,
): Rule {
  const reason = readOnlyReason(t);
  const protocol = (
    ["tcp", "udp", "any"].includes(t.protocol) ? t.protocol : "any"
  ) as Rule["protocol"];
  return {
    id: hashId(`${family}|${raw}`),
    action: t.action,
    direction: t.direction === "out" ? "out" : "in",
    protocol,
    port: t.port,
    source: t.source,
    destination: t.destination,
    iface: t.iface,
    family,
    comment: t.comment,
    managed: !reason,
    deleteOnly: !reason && (!!t.app || !!t.log),
    readOnlyReason: reason,
    raw,
    app: t.app || undefined,
    position,
  };
}

/** Merges the v4 and v6 rule files into one list, in UFW's order. */
export function parseUfwRules(v4Text: string, v6Text: string): Rule[] {
  const read = (text: string) =>
    text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("### tuple"))
      .map((line) => ({ line, tuple: parseTuple(line) }));
  const v4 = read(v4Text);
  const v6 = read(v6Text);
  const used = new Set<number>();
  const rules: Rule[] = [];
  v4.forEach((entry, index) => {
    if (!entry.tuple) {
      rules.push(unknownRule(entry.line, "ipv4", index + 1));
      return;
    }
    const pair = v6.findIndex(
      (other, j) =>
        !used.has(j) && other.tuple && sameFlow(entry.tuple!, other.tuple),
    );
    const bothAny = !entry.tuple.source && !entry.tuple.destination;
    if (pair >= 0 && bothAny) {
      used.add(pair);
      rules.push(toRule(entry.tuple, entry.line, "any", index + 1));
    } else {
      rules.push(toRule(entry.tuple, entry.line, "ipv4", index + 1));
    }
  });
  v6.forEach((entry, j) => {
    if (used.has(j)) return;
    const position = v4.length + j + 1;
    rules.push(
      entry.tuple
        ? toRule(entry.tuple, entry.line, "ipv6", position)
        : unknownRule(entry.line, "ipv6", position),
    );
  });
  return rules;
}

function unknownRule(
  raw: string,
  family: Rule["family"],
  position: number,
): Rule {
  return {
    id: hashId(`${family}|${raw}`),
    action: "allow",
    direction: "in",
    protocol: "any",
    port: "",
    source: "",
    destination: "",
    iface: "",
    family,
    comment: "",
    managed: false,
    readOnlyReason: "Termix could not read this rule",
    raw,
    position,
  };
}

export function parseUfw(sections: Sections, state: HostState): void {
  state.version = (sections["ufw-version"] ?? "").trim();
  state.active = /^Status: active/m.test(sections["ufw-status"] ?? "");
  const defaults: Record<string, Policy> = {};
  for (const line of (sections["ufw-defaults"] ?? "").split("\n")) {
    const m = /^DEFAULT_(INPUT|OUTPUT|FORWARD)_POLICY="?([A-Z]+)"?/.exec(
      line.trim(),
    );
    if (m && POLICY[m[2]]) defaults[m[1]] = POLICY[m[2]];
  }
  state.defaults = {
    incoming: defaults.INPUT ?? "deny",
    outgoing: defaults.OUTPUT ?? "allow",
    routed: defaults.FORWARD ?? "deny",
  };
  state.rules = parseUfwRules(
    sections["ufw-rules"] ?? "",
    sections["ufw-rules6"] ?? "",
  );
  state.persistent = true;
}

/** The UFW words for a rule, without the leading `ufw`. */
export function ufwArgs(
  spec: RuleSpec & { app?: string },
  options: { delete?: boolean; log?: string } = {},
): string[] {
  const args: string[] = [spec.action, spec.direction];
  if (spec.iface) args.push("on", spec.iface);
  if (options.log) args.push(options.log);
  if (spec.protocol !== "any" && !spec.app) args.push("proto", spec.protocol);
  const anyAddr =
    spec.source || spec.destination
      ? "any"
      : spec.family === "ipv4"
        ? "0.0.0.0/0"
        : spec.family === "ipv6"
          ? "::/0"
          : "any";
  args.push("from", spec.source || anyAddr, "to", spec.destination || anyAddr);
  if (spec.app) args.push("app", spec.app);
  else if (spec.port) args.push("port", spec.port.replace(/-/g, ":"));
  if (!options.delete && spec.comment) args.push("comment", spec.comment);
  return args;
}

function deleteArgs(rule: Rule): string[] {
  const tuple = parseTuple(rule.raw);
  if (!tuple || !rule.managed) {
    throw new FirewallError(
      rule.readOnlyReason ?? "This rule can't be deleted here",
    );
  }
  return ufwArgs(
    { ...rule, app: tuple.app || undefined },
    { delete: true, log: tuple.log || undefined },
  );
}

function checkSpec(spec: RuleSpec): void {
  if (spec.service)
    throw new FirewallError(
      "Services are a firewalld feature. Use ports on UFW.",
    );
}

function asRule(spec: RuleSpec, id: string): Rule {
  return { ...spec, id, managed: true, raw: "" };
}

export function findRule(state: HostState, id: string): Rule {
  const rule = state.rules.find((r) => r.id === id);
  if (!rule) {
    throw new FirewallError(
      "That rule changed on the host. Refresh and try again.",
      409,
      {
        code: "stale",
      },
    );
  }
  return rule;
}

function ufw(args: string[]): string {
  return `ufw ${words(args)}`;
}

function addLines(
  state: HostState,
  specs: RuleSpec[],
): { lines: string[]; added: Rule[] } {
  const keys = new Set(state.rules.map((r) => specKey(r)));
  const lines: string[] = [];
  const added: Rule[] = [];
  for (const spec of specs) {
    checkSpec(spec);
    const key = specKey(spec);
    if (keys.has(key)) continue;
    keys.add(key);
    lines.push(
      `${ufw(ufwArgs(spec))} || { ${errLine("UFW refused the rule")}; exit 1; }`,
    );
    added.push(asRule(spec, `new-${added.length}`));
  }
  return { lines, added };
}

export function sshAllowSpecs(ports: number[]): RuleSpec[] {
  return ports.map((port) => ({
    action: "allow",
    direction: "in",
    protocol: "tcp",
    port: String(port),
    source: "",
    destination: "",
    iface: "",
    family: "any",
    comment: "Termix SSH",
  }));
}

function plan(state: HostState, change: Change): Plan {
  const before = snapshotOf(state);
  switch (change.kind) {
    case "add":
    case "addMany": {
      const specs = change.kind === "add" ? [change.spec] : change.specs;
      const { lines, added } = addLines(state, specs);
      if (change.kind === "add" && !lines.length) {
        throw new FirewallError("This rule is already there");
      }
      return {
        script: lines.join("\n"),
        after: { ...before, rules: [...state.rules, ...added] },
        noop: !lines.length,
      };
    }
    case "update": {
      const old = findRule(state, change.id);
      if (!old.managed || old.deleteOnly) {
        throw new FirewallError(
          old.readOnlyReason ?? "This rule can only be deleted",
        );
      }
      checkSpec(change.spec);
      const position = old.position ?? 0;
      const oldArgs = deleteArgs(old);
      const restoreOld = ufw(ufwArgs(old));
      const newRule = ufw(ufwArgs(change.spec));
      const insert = ufw(["insert", String(position), ...ufwArgs(change.spec)]);
      const failed = `{ ${restoreOld} >/dev/null 2>&1; ${errLine("UFW refused the new rule, the old one is back")}; exit 1; }`;
      const script = [
        `ufw --force delete ${words(oldArgs)} || { ${errLine("UFW could not delete the old rule")}; exit 1; }`,
        `C=$(ufw status numbered 2>/dev/null | grep -c '^\\[')`,
        `if [ ${position} -ge 1 ] && [ ${position} -le "$C" ]; then`,
        `  ${insert} || ${newRule} || ${failed}`,
        `else`,
        `  ${newRule} || ${failed}`,
        `fi`,
      ].join("\n");
      return {
        script,
        after: {
          ...before,
          rules: state.rules.map((r) =>
            r.id === old.id ? asRule(change.spec, old.id) : r,
          ),
        },
      };
    }
    case "remove": {
      const old = findRule(state, change.id);
      return {
        script: `ufw --force delete ${words(deleteArgs(old))} || { ${errLine("UFW could not delete the rule")}; exit 1; }`,
        after: { ...before, rules: state.rules.filter((r) => r.id !== old.id) },
      };
    }
    case "defaults": {
      const lines: string[] = [];
      const next = {
        ...(state.defaults ?? { incoming: "deny", outgoing: "allow" }),
      };
      for (const [key, word] of [
        ["incoming", "incoming"],
        ["outgoing", "outgoing"],
        ["routed", "routed"],
      ] as const) {
        const value = change.defaults[key];
        if (!value) continue;
        next[key] = value;
        lines.push(
          `ufw default ${value} ${word} >/dev/null || { ${errLine("UFW could not set the default")}; exit 1; }`,
        );
      }
      return {
        script: lines.join("\n"),
        after: { ...before, defaults: next },
        noop: !lines.length,
      };
    }
    case "enable": {
      const { lines, added } = change.allowSsh
        ? addLines(state, sshAllowSpecs(state.ssh.ports))
        : { lines: [], added: [] };
      lines.push(
        `ufw --force enable >/dev/null || { ${errLine("UFW could not be turned on")}; exit 1; }`,
      );
      return {
        script: lines.join("\n"),
        after: { ...before, active: true, rules: [...state.rules, ...added] },
      };
    }
    case "disable":
      return {
        script: "ufw --force disable >/dev/null",
        after: { ...before, active: false },
      };
    default:
      throw new FirewallError("Zones are a firewalld feature");
  }
}

export const ufwModule: BackendModule = {
  plan,
  backup: `
mkdir -p "$DIR/ufw"
for f in user.rules user6.rules ufw.conf; do [ -f /etc/ufw/$f ] && cp -p /etc/ufw/$f "$DIR/ufw/$f"; done
[ -f /etc/default/ufw ] && cp -p /etc/default/ufw "$DIR/ufw/default"
if ufw status 2>/dev/null | head -n 1 | grep -q 'Status: active'; then echo 1 > "$DIR/ufw/was_on"; else echo 0 > "$DIR/ufw/was_on"; fi
`,
  restore: `
for f in user.rules user6.rules ufw.conf; do [ -f "$DIR/ufw/$f" ] && cp -p "$DIR/ufw/$f" /etc/ufw/$f; done
[ -f "$DIR/ufw/default" ] && cp -p "$DIR/ufw/default" /etc/default/ufw
if [ "$(cat "$DIR/ufw/was_on" 2>/dev/null)" = 1 ]; then
  if ufw status 2>/dev/null | head -n 1 | grep -q 'Status: active'; then ufw reload >/dev/null 2>&1; else ufw --force enable >/dev/null 2>&1; fi
else
  ufw --force disable >/dev/null 2>&1
fi
`,
  raw: `ufw status verbose 2>&1; echo; echo "Rules (ufw show added):"; ufw show added 2>&1`,
};
