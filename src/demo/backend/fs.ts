import { value } from "./store";
import {
  CONTENTS,
  TREE,
  baseName,
  parentOf,
  type FsEntry,
} from "../fixtures/filesystem";

/** The fake filesystem, editable from the file manager and the shell. */
const tree = value<Record<string, FsEntry[]>>("fs-tree", () =>
  structuredClone(TREE),
);
const contents = value<Record<string, string>>("fs-contents", () => ({
  ...CONTENTS,
}));

export function list(path: string): FsEntry[] | undefined {
  return tree.get()[path];
}

export function stat(path: string): FsEntry | undefined {
  if (path === "/") {
    return {
      name: "/",
      type: "directory",
      size: 4096,
      mode: "drwxr-xr-x",
      owner: "root",
      group: "root",
      modified: new Date().toISOString(),
    };
  }
  return tree.get()[parentOf(path)]?.find((e) => e.name === baseName(path));
}

export function isDir(path: string): boolean {
  return !!tree.get()[path];
}

export function read(path: string): string | undefined {
  const entry = stat(path);
  if (!entry || entry.type === "directory") return undefined;
  return contents.get()[path] ?? "";
}

export function write(path: string, body: string, owner = "deploy"): void {
  const parent = parentOf(path);
  const name = baseName(path);
  const now = new Date().toISOString();
  tree.update((t) => {
    const entries = [...(t[parent] ?? [])];
    const i = entries.findIndex((e) => e.name === name);
    const entry: FsEntry = {
      ...(i >= 0
        ? entries[i]
        : { name, type: "file", mode: "-rw-r--r--", owner, group: owner }),
      size: new Blob([body]).size,
      modified: now,
    } as FsEntry;
    if (i >= 0) entries[i] = entry;
    else entries.push(entry);
    return { ...t, [parent]: entries };
  });
  contents.update((c) => ({ ...c, [path]: body }));
}

export function mkdir(path: string, owner = "deploy"): void {
  const parent = parentOf(path);
  tree.update((t) => ({
    ...t,
    [path]: t[path] ?? [],
    [parent]: [
      ...(t[parent] ?? []).filter((e) => e.name !== baseName(path)),
      {
        name: baseName(path),
        type: "directory",
        size: 4096,
        mode: "drwxr-xr-x",
        owner,
        group: owner,
        modified: new Date().toISOString(),
      },
    ],
  }));
}

export function remove(path: string): void {
  const parent = parentOf(path);
  tree.update((t) => {
    const next: Record<string, FsEntry[]> = {};
    for (const [key, entries] of Object.entries(t)) {
      if (key === path || key.startsWith(`${path}/`)) continue;
      next[key] = entries;
    }
    next[parent] = (next[parent] ?? []).filter(
      (e) => e.name !== baseName(path),
    );
    return next;
  });
  contents.update((c) => {
    const next = { ...c };
    for (const key of Object.keys(next)) {
      if (key === path || key.startsWith(`${path}/`)) delete next[key];
    }
    return next;
  });
}

export function move(from: string, to: string): void {
  const entry = stat(from);
  if (!entry) return;
  tree.update((t) => {
    const next: Record<string, FsEntry[]> = {};
    for (const [key, entries] of Object.entries(t)) {
      if (key === from || key.startsWith(`${from}/`)) {
        next[to + key.slice(from.length)] = entries;
      } else next[key] = entries;
    }
    next[parentOf(from)] = (next[parentOf(from)] ?? []).filter(
      (e) => e.name !== baseName(from),
    );
    next[parentOf(to)] = [
      ...(next[parentOf(to)] ?? []).filter((e) => e.name !== baseName(to)),
      { ...entry, name: baseName(to), modified: new Date().toISOString() },
    ];
    return next;
  });
  contents.update((c) => {
    const next: Record<string, string> = {};
    for (const [key, body] of Object.entries(c)) {
      if (key === from || key.startsWith(`${from}/`))
        next[to + key.slice(from.length)] = body;
      else next[key] = body;
    }
    return next;
  });
}

export function copy(from: string, to: string): void {
  const entry = stat(from);
  if (!entry) return;
  if (entry.type === "directory") {
    mkdir(to, entry.owner);
    for (const child of list(from) ?? []) {
      copy(`${from}/${child.name}`, `${to}/${child.name}`);
    }
    return;
  }
  write(to, read(from) ?? "", entry.owner);
}

export function chmod(path: string, mode: string): void {
  const parent = parentOf(path);
  tree.update((t) => ({
    ...t,
    [parent]: (t[parent] ?? []).map((e) =>
      e.name === baseName(path) ? { ...e, mode } : e,
    ),
  }));
}
