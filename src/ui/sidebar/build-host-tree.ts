import type { SSHHostWithStatus } from "@/main-axios";
import type { HostFolder } from "@/types/ui-types";
import { sshHostToHost } from "./HostManagerData";

/**
 * Builds the sidebar's host tree from the flat host list returned by the
 * API, nesting via two independent mechanisms:
 *
 * - folder: a " / "-separated string path, split into synthetic HostFolder
 *   nodes (folders are virtual and only exist as this derived tree).
 * - parentHostId: sub-host nesting, where a real host acts as an
 *   organizational parent for other real hosts. A host with children stays
 *   a normal, connectable Host. It is never wrapped in a synthetic node,
 *   just given a childHosts array the tree and virtualizer walk into.
 *
 * folder and parentHostId are mutually exclusive, and cycles are rejected on
 * write, but this still defends against stale or imported data: a missing,
 * inaccessible or cyclic parent falls back to folder or root placement rather
 * than being dropped or looping.
 */
export function buildHostTree(
  hosts: SSHHostWithStatus[],
  folderMeta?: Map<
    string,
    {
      color?: string;
      icon?: string;
      credentialId?: number | null;
      sortOrder?: number | null;
    }
  >,
): HostFolder {
  const root: HostFolder = { name: "root", children: [] };
  const folderMap = new Map<string, HostFolder>();
  const getOrCreateFolder = (path: string): HostFolder => {
    if (folderMap.has(path)) return folderMap.get(path)!;
    const parts = path.split(" / ");
    let current = root;
    let accumulated = "";
    for (const part of parts) {
      accumulated = accumulated ? `${accumulated} / ${part}` : part;
      if (!folderMap.has(accumulated)) {
        const meta = folderMeta?.get(accumulated);
        const folder: HostFolder = {
          name: part,
          path: accumulated,
          color: meta?.color,
          icon: meta?.icon,
          credentialId: meta?.credentialId ?? null,
          sortOrder: meta?.sortOrder ?? null,
          children: [],
        };
        folderMap.set(accumulated, folder);
        current.children.push(folder);
      }
      current = folderMap.get(accumulated)!;
    }
    return current;
  };
  // Surface empty folders (created but with no hosts yet) so they stay visible.
  if (folderMeta) {
    for (const path of folderMeta.keys()) getOrCreateFolder(path);
  }

  const mappedHosts = hosts.map((h) => sshHostToHost(h));
  const hostsById = new Map(mappedHosts.map((h) => [h.id, h]));

  // Cycles are rejected on write, but stale or imported data could still hold
  // one. Walking a candidate parent's ancestor chain before attaching keeps
  // the tree build from looping forever.
  function isDescendantOf(candidateId: string, ancestorId: string): boolean {
    let current: string | null | undefined = candidateId;
    const visited = new Set<string>();
    while (current) {
      if (current === ancestorId) return true;
      if (visited.has(current)) return false;
      visited.add(current);
      current = hostsById.get(current)?.parentHostId;
    }
    return false;
  }

  // Sub-host nesting (parentHostId) takes priority over folder placement.
  // Setting one clears the other, but a host is placed by whichever it
  // currently has.
  const nested = new Set<string>();
  for (const host of mappedHosts) {
    if (!host.parentHostId) continue;
    const parent = hostsById.get(host.parentHostId);
    // A parent that's missing (deleted), not visible to this user (e.g. a
    // shared host whose parent link was stripped server-side), or would form
    // a cycle falls back to folder/root placement below, same as any other
    // orphaned host.
    if (!parent) continue;
    if (isDescendantOf(host.parentHostId, host.id)) continue;
    parent.childHosts = parent.childHosts ?? [];
    parent.childHosts.push(host);
    nested.add(host.id);
  }

  for (const host of mappedHosts) {
    if (nested.has(host.id)) continue;
    if (host.folder) {
      getOrCreateFolder(host.folder).children.push(host);
    } else {
      root.children.push(host);
    }
  }
  return root;
}
