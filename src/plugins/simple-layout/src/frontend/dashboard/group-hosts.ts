import type { Host } from "@termix-ssh/plugin-sdk/ui";

export interface HostGroup {
  folder: string;
  hosts: Host[];
}

/**
 * Hosts matching the query, pinned first, grouped by folder. Hosts with no
 * folder come first, then folders by name.
 */
export function groupHosts(hosts: Host[], query: string): HostGroup[] {
  const q = query.trim().toLowerCase();
  const shown = q
    ? hosts.filter((host) =>
        [host.name, host.ip, host.username, host.folder, ...(host.tags ?? [])]
          .filter(Boolean)
          .some((part) => part.toLowerCase().includes(q)),
      )
    : hosts;

  const byFolder = new Map<string, Host[]>();
  for (const host of shown) {
    const key = host.folder ?? "";
    byFolder.set(key, [...(byFolder.get(key) ?? []), host]);
  }

  return [...byFolder.entries()]
    .sort(([a], [b]) => {
      if (!a) return -1;
      if (!b) return 1;
      return a.localeCompare(b);
    })
    .map(([folder, list]) => ({
      folder,
      hosts: [...list].sort(
        (a, b) =>
          Number(!!b.pin) - Number(!!a.pin) ||
          (a.name || a.ip).localeCompare(b.name || b.ip),
      ),
    }));
}
