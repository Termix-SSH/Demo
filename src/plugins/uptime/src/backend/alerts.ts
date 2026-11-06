import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CertInfo } from "../shared/types.js";
import type { MonitorRow } from "./repository.js";

export interface AlertSender {
  down: (monitor: MonitorRow, users: string[], cause: string) => Promise<void>;
  reminder: (
    monitor: MonitorRow,
    users: string[],
    cause: string,
    sinceMs: number,
  ) => Promise<void>;
  up: (monitor: MonitorRow, users: string[], downMs: number) => Promise<void>;
  cert: (monitor: MonitorRow, users: string[], cert: CertInfo) => Promise<void>;
}

export function duration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ${minutes % 60} min`;
  return `${Math.floor(hours / 24)} days`;
}

/** Alerts go through the hub, one per watcher, and never stop a check. */
export function createAlerts(
  ctx: Pick<PluginContext, "notify" | "log">,
): AlertSender {
  const send = async (
    users: string[],
    build: Parameters<PluginContext["notify"]["send"]>[0],
  ) => {
    await Promise.all(
      users.map((userId) =>
        ctx.notify.send({ ...build, audience: { userId } }).catch((error) => {
          ctx.log.warn(
            `Could not send an uptime alert: ${error instanceof Error ? error.message : String(error)}`,
          );
        }),
      ),
    );
  };
  const context = (monitor: MonitorRow, value?: unknown) => ({
    hostId: monitor.hostId ?? undefined,
    sourceId: monitor.key,
    sourceName: monitor.name,
    value,
  });

  return {
    down: (monitor, users, cause) =>
      send(users, {
        title: `${monitor.name} is down`,
        body: cause,
        severity: "critical",
        category: "uptime.down",
        link: { tab: "uptime" },
        dedupeKey: `uptime:${monitor.key}:down`,
        context: context(monitor, cause),
      }),
    reminder: (monitor, users, cause, sinceMs) =>
      send(users, {
        title: `${monitor.name} is still down`,
        body: `Down for ${duration(sinceMs)}. ${cause}`,
        severity: "critical",
        category: "uptime.down",
        link: { tab: "uptime" },
        dedupeKey: `uptime:${monitor.key}:down:${Date.now()}`,
        context: context(monitor, cause),
      }),
    up: (monitor, users, downMs) =>
      send(users, {
        title: `${monitor.name} is back up`,
        body: `It was down for ${duration(downMs)}.`,
        severity: "success",
        category: "uptime.up",
        link: { tab: "uptime" },
        dedupeKey: `uptime:${monitor.key}:up:${Date.now()}`,
        context: context(monitor),
      }),
    cert: (monitor, users, cert) =>
      send(users, {
        title: `The certificate for ${monitor.name} ends in ${cert.daysLeft} days`,
        body: `Valid until ${cert.validTo.slice(0, 10)}.`,
        severity: "warning",
        category: "uptime.cert_expiring",
        link: { tab: "uptime" },
        dedupeKey: `uptime:${monitor.key}:cert:${cert.validTo}:${cert.daysLeft}`,
        context: context(monitor, cert.daysLeft),
      }),
  };
}
