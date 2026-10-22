import type { Host, SharePermissionLevel } from "@termix-ssh/plugin-sdk/ui";

const RANK: Record<SharePermissionLevel, number> = {
  connect: 1,
  view: 2,
  edit: 3,
  manage: 4,
};

const rank = (host: Host) => RANK[host.permissionLevel ?? "connect"] ?? 1;

/** A plugin manages this host, so it is read only for everyone. */
export function isLockedHost(host: Host): boolean {
  return !!host.lock;
}

export function canEditHost(host: Host): boolean {
  if (isLockedHost(host)) return false;
  return !host.isShared || rank(host) >= RANK.edit;
}

export function canDeleteHost(host: Host): boolean {
  return !host.isShared && !isLockedHost(host);
}
