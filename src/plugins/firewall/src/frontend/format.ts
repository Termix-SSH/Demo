import type { Rule, RuleSpec } from "../shared/types";

type T = (key: string, options?: Record<string, unknown>) => string;

export const EMPTY_SPEC: RuleSpec = {
  action: "allow",
  direction: "in",
  protocol: "tcp",
  port: "",
  source: "",
  destination: "",
  iface: "",
  family: "any",
  comment: "",
};

export interface Preset {
  id: string;
  protocol: RuleSpec["protocol"];
  port: string;
}

/** Common services, for the quick picks in the rule editor. */
export const PRESETS: Preset[] = [
  { id: "ssh", protocol: "tcp", port: "22" },
  { id: "http", protocol: "tcp", port: "80" },
  { id: "https", protocol: "tcp", port: "443" },
  { id: "web", protocol: "tcp", port: "80,443" },
  { id: "dns", protocol: "any", port: "53" },
  { id: "smtp", protocol: "tcp", port: "25,465,587" },
  { id: "mysql", protocol: "tcp", port: "3306" },
  { id: "postgres", protocol: "tcp", port: "5432" },
  { id: "redis", protocol: "tcp", port: "6379" },
  { id: "samba", protocol: "tcp", port: "139,445" },
  { id: "wireguard", protocol: "udp", port: "51820" },
  { id: "minecraft", protocol: "tcp", port: "25565" },
];

/** "tcp 22", "any port" and so on. */
export function portText(rule: RuleSpec & { app?: string }, t: T): string {
  if (rule.service)
    return rule.port ? `${rule.service} (${rule.port})` : rule.service;
  if (rule.app) return rule.app;
  const proto = rule.protocol === "any" ? "" : rule.protocol;
  const port = rule.port || t("rule.anyPort");
  return [proto, port].filter(Boolean).join(" ");
}

/** "from 10.0.0.0/8 | on eth0 | ipv6". */
export function metaText(rule: Rule | RuleSpec, t: T): string {
  return [
    rule.source ? t("rule.from", { address: rule.source }) : "",
    rule.destination ? t("rule.to", { address: rule.destination }) : "",
    rule.iface ? t("rule.on", { iface: rule.iface }) : "",
    rule.family !== "any" ? rule.family : "",
    "zone" in rule && rule.zone ? t("rule.zone", { zone: rule.zone }) : "",
    rule.comment,
  ]
    .filter(Boolean)
    .join(" | ");
}

export function actionTone(
  action: RuleSpec["action"],
): "success" | "destructive" | "warning" | "brand" {
  if (action === "allow") return "success";
  if (action === "limit") return "warning";
  return "destructive";
}

/** Splits the server's "kind|detail" pending label. */
export function pendingLabel(label: string, t: T): string {
  const [kind, ...rest] = label.split("|");
  const detail = rest.join("|");
  const text = t(`pending.kinds.${kind}`, { detail, defaultValue: kind });
  return detail && kind !== "ruleset" ? `${text}: ${detail}` : text;
}
