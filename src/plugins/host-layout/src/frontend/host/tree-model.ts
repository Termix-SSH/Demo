import type { Host, HostFolder } from "@termix-ssh/plugin-sdk/ui";

export type TreeRow =
  | {
      kind: "folder";
      key: string;
      depth: number;
      folder: HostFolder;
      expanded: boolean;
      count: number;
    }
  | {
      kind: "host";
      key: string;
      depth: number;
      host: Host;
      expanded: boolean;
      hasSubHosts: boolean;
    };

export const folderKey = (path: string) => `folder:${path}`;
export const hostKey = (id: string | number) => `host:${id}`;

export function isFolder(node: Host | HostFolder): node is HostFolder {
  return "children" in node && Array.isArray(node.children) && !("ip" in node);
}

function folderPath(folder: HostFolder): string {
  return folder.path ?? folder.name;
}

/** Every host in a folder, its sub folders and sub hosts. */
export function countHosts(folder: HostFolder): number {
  let count = 0;
  const walkHost = (host: Host) => {
    count++;
    host.childHosts?.forEach(walkHost);
  };
  for (const child of folder.children) {
    if (isFolder(child)) count += countHosts(child);
    else walkHost(child);
  }
  return count;
}

export function hostMatches(host: Host, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return [host.name, host.ip, host.username, ...(host.tags ?? [])].some(
    (value) => typeof value === "string" && value.toLowerCase().includes(q),
  );
}

function hostHasMatch(host: Host, query: string): boolean {
  return (
    hostMatches(host, query) ||
    (host.childHosts ?? []).some((child) => hostHasMatch(child, query))
  );
}

function folderHasMatch(folder: HostFolder, query: string): boolean {
  return folder.children.some((child) =>
    isFolder(child) ? folderHasMatch(child, query) : hostHasMatch(child, query),
  );
}

function sortNodes(nodes: (Host | HostFolder)[]): (Host | HostFolder)[] {
  return [...nodes].sort((a, b) => {
    const af = isFolder(a);
    const bf = isFolder(b);
    if (af !== bf) return af ? -1 : 1;
    if (!af && !bf) {
      const ap = (a as Host).pin ? 0 : 1;
      const bp = (b as Host).pin ? 0 : 1;
      if (ap !== bp) return ap - bp;
    }
    const ao = (a as { sortOrder?: number | null }).sortOrder;
    const bo = (b as { sortOrder?: number | null }).sortOrder;
    if (ao != null && bo != null && ao !== bo) return ao - bo;
    if (ao != null && bo == null) return -1;
    if (bo != null && ao == null) return 1;
    return (a.name || "").localeCompare(b.name || "", undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });
}

/**
 * The rows the tree shows, in order. A search opens every folder and host on
 * the way to a match and hides the rest.
 */
export function visibleRows(
  root: HostFolder | null,
  expanded: ReadonlySet<string>,
  query = "",
): TreeRow[] {
  if (!root) return [];
  const q = query.trim();
  const rows: TreeRow[] = [];

  const addHost = (host: Host, depth: number) => {
    if (q && !hostHasMatch(host, q)) return;
    const key = hostKey(host.id);
    const subHosts = host.childHosts ?? [];
    const childMatch = !!q && subHosts.some((child) => hostHasMatch(child, q));
    const open = expanded.has(key) || childMatch;
    rows.push({
      kind: "host",
      key,
      depth,
      host,
      expanded: open,
      hasSubHosts: subHosts.length > 0,
    });
    if (!open) return;
    for (const child of sortNodes(subHosts)) addHost(child as Host, depth + 1);
  };

  const addNodes = (nodes: (Host | HostFolder)[], depth: number) => {
    for (const node of sortNodes(nodes)) {
      if (isFolder(node)) {
        if (q && !folderHasMatch(node, q)) continue;
        const key = folderKey(folderPath(node));
        const open = !!q || expanded.has(key);
        rows.push({
          kind: "folder",
          key,
          depth,
          folder: node,
          expanded: open,
          count: countHosts(node),
        });
        if (open) addNodes(node.children, depth + 1);
      } else {
        addHost(node, depth);
      }
    }
  };

  addNodes(root.children, 0);
  return rows;
}

/** Keys of every folder and host above a host, so it can be shown. */
export function ancestorKeys(
  root: HostFolder | null,
  hostId: string,
): string[] {
  if (!root) return [];
  const walk = (
    nodes: (Host | HostFolder)[],
    trail: string[],
  ): string[] | null => {
    for (const node of nodes) {
      if (isFolder(node)) {
        const found = walk(node.children, [
          ...trail,
          folderKey(folderPath(node)),
        ]);
        if (found) return found;
      } else {
        if (String(node.id) === String(hostId)) return trail;
        const found = walk(node.childHosts ?? [], [...trail, hostKey(node.id)]);
        if (found) return found;
      }
    }
    return null;
  };
  return walk(root.children, []) ?? [];
}

/** Hosts in a folder (or the whole tree), flattened. */
export function hostsIn(folder: HostFolder | null): Host[] {
  if (!folder) return [];
  const out: Host[] = [];
  const walkHost = (host: Host) => {
    out.push(host);
    host.childHosts?.forEach(walkHost);
  };
  for (const child of folder.children) {
    if (isFolder(child)) out.push(...hostsIn(child));
    else walkHost(child);
  }
  return out;
}

export function findFolder(
  root: HostFolder | null,
  path: string,
): HostFolder | null {
  if (!root) return null;
  for (const child of root.children) {
    if (!isFolder(child)) continue;
    if (folderPath(child) === path) return child;
    const found = findFolder(child, path);
    if (found) return found;
  }
  return null;
}
