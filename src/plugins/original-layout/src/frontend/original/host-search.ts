import type { Host, HostFolder } from "@termix-ssh/plugin-sdk/ui";

export function isFolder(item: Host | HostFolder): item is HostFolder {
  return "children" in item && !("ip" in item);
}

export interface HostQuery {
  fields: Record<string, string>;
  text: string;
}

/** Splits "tag:prod user:root web" into field filters and free text. */
export function parseHostQuery(raw: string): HostQuery {
  const fields: Record<string, string> = {};
  const words: string[] = [];
  for (const word of raw.trim().toLowerCase().split(/\s+/)) {
    if (!word) continue;
    const match = /^(\w+):(.+)$/.exec(word);
    if (match) fields[match[1]] = match[2];
    else words.push(word);
  }
  return { fields, text: words.join(" ") };
}

function fieldMatches(host: Host, field: string, value: string): boolean {
  const has = (text: string | undefined | null) =>
    (text ?? "").toLowerCase().includes(value);
  switch (field) {
    case "tag":
    case "tags":
      return (host.tags ?? []).some((tag) => has(tag));
    case "name":
      return has(host.name);
    case "user":
    case "username":
      return has(host.username);
    case "ip":
    case "host":
      return has(host.ip);
    case "port":
      return String(host.port).includes(value);
    case "folder":
      return has(host.folder);
    case "auth":
    case "authtype":
      return has(host.authType);
    default:
      // An unknown field reads as plain text, so "foo:bar" still finds things.
      return has(`${field}:${value}`) || hostText(host).includes(value);
  }
}

function hostText(host: Host): string {
  return [
    host.name,
    host.username,
    host.ip,
    host.folder,
    host.authType,
    ...(host.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
}

export function hostMatches(host: Host, query: HostQuery): boolean {
  for (const [field, value] of Object.entries(query.fields)) {
    if (!fieldMatches(host, field, value)) return false;
  }
  if (!query.text) return true;
  const text = hostText(host);
  return query.text.split(" ").every((word) => text.includes(word));
}

export function isEmptyQuery(query: HostQuery): boolean {
  return !query.text && Object.keys(query.fields).length === 0;
}

/** A host stays when it or one of its sub-hosts matches. */
function filterHost(host: Host, query: HostQuery): Host | null {
  const children = (host.childHosts ?? [])
    .map((child) => filterHost(child, query))
    .filter((child): child is Host => !!child);
  if (hostMatches(host, query) || children.length > 0) {
    return children.length === (host.childHosts?.length ?? 0)
      ? host
      : { ...host, childHosts: children };
  }
  return null;
}

/** The tree with only matching hosts and the folders that hold them. */
export function filterTree(folder: HostFolder, query: HostQuery): HostFolder {
  if (isEmptyQuery(query)) return folder;
  const children: (Host | HostFolder)[] = [];
  for (const child of folder.children) {
    if (isFolder(child)) {
      const sub = filterTree(child, query);
      if (sub.children.length > 0) children.push(sub);
    } else {
      const host = filterHost(child, query);
      if (host) children.push(host);
    }
  }
  return { ...folder, children };
}

/** Pinned hosts first, then by name, like the old sidebar. */
export function sortHosts(hosts: Host[]): Host[] {
  return [...hosts].sort((a, b) => {
    if (!!a.pin !== !!b.pin) return a.pin ? -1 : 1;
    return (a.name || a.ip).localeCompare(b.name || b.ip);
  });
}

export function countHosts(folder: HostFolder): number {
  let count = 0;
  const walk = (host: Host) => {
    count += 1;
    host.childHosts?.forEach(walk);
  };
  for (const child of folder.children) {
    if (isFolder(child)) count += countHosts(child);
    else walk(child);
  }
  return count;
}
