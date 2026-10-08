/**
 * The fake backend's data. Each collection starts from its fixture and is
 * saved to localStorage on change, so edits survive a reload until the demo
 * is reset.
 */

const PREFIX = "termix-demo-db:";
const SCHEMA = "3";
const SCHEMA_KEY = "termix-demo-schema";

try {
  if (localStorage.getItem(SCHEMA_KEY) !== SCHEMA) {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith(PREFIX)) localStorage.removeItem(key);
    }
    localStorage.setItem(SCHEMA_KEY, SCHEMA);
  }
} catch {
  // Storage is off; everything lives in memory for this visit.
}

const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flush(): void {
  flushTimer = null;
  for (const [key, value] of pending) {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Quota or private mode; keep going in memory.
    }
  }
  pending.clear();
}

function schedule(key: string, value: unknown): void {
  pending.set(key, value);
  if (!flushTimer) flushTimer = setTimeout(flush, 250);
}

function load<T>(key: string, seed: () => T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw) return JSON.parse(raw) as T;
  } catch {
    // Fall back to the fixture.
  }
  return seed();
}

/** A single persisted value. */
export function value<T>(key: string, seed: () => T) {
  let current = load(key, seed);
  return {
    get: (): T => current,
    set(next: T): T {
      current = next;
      schedule(key, current);
      return current;
    },
    update(fn: (prev: T) => T): T {
      return this.set(fn(current));
    },
  };
}

/** A persisted list of records with an id. */
export function collection<T extends { id: string | number }>(
  key: string,
  seed: () => T[],
) {
  const store = value<T[]>(key, seed);
  return {
    all: (): T[] => store.get(),
    find: (id: string | number): T | undefined =>
      store.get().find((item) => String(item.id) === String(id)),
    insert(item: T): T {
      store.update((items) => [...items, item]);
      return item;
    },
    patch(id: string | number, changes: Partial<T>): T | undefined {
      let updated: T | undefined;
      store.update((items) =>
        items.map((item) => {
          if (String(item.id) !== String(id)) return item;
          updated = { ...item, ...changes };
          return updated;
        }),
      );
      return updated;
    },
    remove(id: string | number): void {
      store.update((items) =>
        items.filter((item) => String(item.id) !== String(id)),
      );
    },
    replace(items: T[]): void {
      store.set(items);
    },
    nextId(): number {
      return (
        store
          .get()
          .reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1
      );
    },
  };
}

/** Wipes everything the demo and the app stored and starts over. */
export function resetDemo(): void {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // Nothing to clear.
  }
  document.cookie = "jwt=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
  window.location.reload();
}
