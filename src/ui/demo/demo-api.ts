import type { Host, Credential, Snippet } from "@/types/ui-types";
import type { FileItem } from "@/types";
import {
  defaultUiPreferences,
  sanitizeUiPreferences,
  type UiPreferences,
} from "@/types/ui-preferences";
import {
  defaultCredentialSidebarPreferences,
  sanitizeCredentialSidebarPreferences,
  type CredentialSidebarPreferences,
} from "@/types/credential-sidebar-preferences";
import {
  defaultHostSidebarPreferences,
  sanitizeHostSidebarPreferences,
  type HostSidebarPreferences,
} from "@/types/host-sidebar-preferences";
import {
  DEMO_ALERTS,
  DEMO_CONTAINER_LOGS,
  DEMO_CONTAINER_STATS,
  DEMO_CONTAINERS,
  DEMO_CREDENTIALS,
  DEMO_DOCKER_INFO,
  DEMO_FILE_CONTENTS,
  DEMO_FS,
  DEMO_HISTORY,
  DEMO_HOST_METRICS,
  DEMO_HOST_METRICS_DEFAULT,
  DEMO_HOSTS,
  DEMO_PINNED_FILES,
  DEMO_PROXMOX_CLUSTER,
  DEMO_PROXMOX_GUESTS,
  DEMO_PROXMOX_INTERFACES,
  DEMO_PROXMOX_NODES,
  DEMO_PROXMOX_STORAGE,
  DEMO_RECENT_FILES,
  DEMO_SESSION_LOGS,
  DEMO_SHORTCUTS,
  DEMO_SNIPPETS,
  DEMO_STORAGE,
  DEMO_TMUX_PANE_OUTPUT,
  DEMO_TMUX_SESSIONS,
  DEMO_TUNNELS,
  type DemoAlert,
  type DemoContainer,
  type DemoContainerStats,
  type DemoHistoryEntry,
  type DemoHostMetrics,
  type DemoProxmoxCluster,
  type DemoProxmoxGuest,
  type DemoProxmoxInterface,
  type DemoProxmoxNode,
  type DemoProxmoxStoragePool,
  type DemoQuickAccessItem,
  type DemoSessionLog,
  type DemoTmuxSession,
  type DemoTunnelRow,
} from "@/demo/demo-data";

// Stands in for main-axios. Everything resolves from memory after a short
// delay, so copied components keep their async shape and loading states.

const LATENCY_MS = 180;

function resolve<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((r) => setTimeout(() => r(value), ms));
}

/** Deep clone so callers mutating results cannot corrupt the fixtures. */
function clone<T>(value: T): T {
  return structuredClone(value);
}

export function getSSHHosts(): Promise<Host[]> {
  return resolve(clone(DEMO_HOSTS));
}

export function getHostById(id: string): Promise<Host | undefined> {
  return resolve(clone(DEMO_HOSTS.find((h) => h.id === id)));
}

interface ImportResult {
  message: string;
  success: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: string[];
}

const noImport: ImportResult = {
  message: "No hosts were imported.",
  success: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  errors: [],
};

export function bulkImportSSHHosts(
  _hosts: unknown[],
  _overwrite = false,
  _credentials?: Record<string, unknown>[],
): Promise<ImportResult> {
  return resolve({ ...noImport });
}

export function importSSHConfigHosts(
  _content: string,
  _overwrite = false,
): Promise<ImportResult> {
  return resolve({ ...noImport });
}

export function getCredentials(): Promise<Credential[]> {
  return resolve(clone(DEMO_CREDENTIALS));
}

export function getSnippets(): Promise<Snippet[]> {
  return resolve(clone(DEMO_SNIPPETS));
}

export function getAlertFirings(options?: {
  acknowledged?: boolean;
  limit?: number;
}): Promise<DemoAlert[]> {
  let rows = clone(DEMO_ALERTS);
  if (options?.acknowledged !== undefined) {
    rows = rows.filter((a) => a.acknowledged === options.acknowledged);
  }
  if (options?.limit !== undefined) rows = rows.slice(0, options.limit);
  return resolve(rows);
}

export function getCommandHistory(): Promise<DemoHistoryEntry[]> {
  return resolve(clone(DEMO_HISTORY));
}

export function getSessionLogs(): Promise<DemoSessionLog[]> {
  return resolve(clone(DEMO_SESSION_LOGS));
}

export function getTunnels(): Promise<DemoTunnelRow[]> {
  return resolve(clone(DEMO_TUNNELS));
}

export function listFiles(path: string): Promise<FileItem[]> {
  const normalized = path === "" ? "/" : path.replace(/\/+$/, "") || "/";
  return resolve(clone(DEMO_FS[normalized] ?? []));
}

export function readFile(path: string): Promise<string> {
  const body = DEMO_FILE_CONTENTS[path] ?? `# ${path}\n`;
  return resolve(body);
}

export function getRecentFiles(): Promise<DemoQuickAccessItem[]> {
  return resolve(clone(DEMO_RECENT_FILES));
}

export function getPinnedFiles(): Promise<DemoQuickAccessItem[]> {
  return resolve(clone(DEMO_PINNED_FILES));
}

export function getFolderShortcuts(): Promise<DemoQuickAccessItem[]> {
  return resolve(clone(DEMO_SHORTCUTS));
}

export function getDiskUsage(): Promise<typeof DEMO_STORAGE> {
  return resolve(clone(DEMO_STORAGE));
}

// Persisted in localStorage so layout tweaks survive a refresh.

const PREFS_KEY = "termix-demo-ui-preferences";

export function getUiPreferences(): Promise<UiPreferences> {
  try {
    const stored = localStorage.getItem(PREFS_KEY);
    if (stored) return resolve(sanitizeUiPreferences(JSON.parse(stored)), 0);
  } catch {
    // Fall through to defaults.
  }
  return resolve(defaultUiPreferences(), 0);
}

export function saveUiPreferences(
  preferences: Partial<UiPreferences> & Record<string, unknown>,
): Promise<void> {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Private windows can refuse writes; preferences just will not persist.
  }
  return resolve(undefined, 0);
}

export interface UserPreferences {
  uiPreset?: string | null;
  [key: string]: unknown;
}

export function getUserPreferences(): Promise<UserPreferences> {
  return resolve({}, 0);
}

export function saveUserPreferences(
  _prefs?: Partial<UserPreferences>,
): Promise<void> {
  return resolve(undefined, 0);
}

/** No secrets are stored, so the copy action finds nothing to copy. */
export function getHostPassword(
  _hostId: number | string,
  _field: "password" | "sudoPassword",
): Promise<string> {
  return resolve("", 0);
}

export function getUserInfo(): Promise<{
  username: string;
  is_admin: boolean;
}> {
  return resolve({ username: "demo", is_admin: true }, 0);
}

const CRED_PREFS_KEY = "termix-demo-credential-sidebar-preferences";

export function getCredentialSidebarPreferences(): Promise<CredentialSidebarPreferences> {
  try {
    const stored = localStorage.getItem(CRED_PREFS_KEY);
    if (stored) {
      return resolve(
        sanitizeCredentialSidebarPreferences(JSON.parse(stored)),
        0,
      );
    }
  } catch {
    // Fall through to defaults.
  }
  return resolve(defaultCredentialSidebarPreferences(), 0);
}

export function saveCredentialSidebarPreferences(
  preferences: CredentialSidebarPreferences,
): Promise<void> {
  try {
    localStorage.setItem(CRED_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Private windows can refuse writes; preferences just will not persist.
  }
  return resolve(undefined, 0);
}

/** Reordering is local only, so this reports back what it was given. */
export function reorderCredentials(
  positions: { id: number; sortOrder: number }[],
): Promise<{ updated: number }> {
  return resolve({ updated: positions.length }, 0);
}

const HOST_PREFS_KEY = "termix-demo-host-sidebar-preferences";

export function getHostSidebarPreferences(): Promise<HostSidebarPreferences> {
  try {
    const stored = localStorage.getItem(HOST_PREFS_KEY);
    if (stored) {
      return resolve(sanitizeHostSidebarPreferences(JSON.parse(stored)), 0);
    }
  } catch {
    // Fall through to defaults.
  }
  return resolve(defaultHostSidebarPreferences(), 0);
}

export function saveHostSidebarPreferences(
  preferences: HostSidebarPreferences,
): Promise<void> {
  try {
    localStorage.setItem(HOST_PREFS_KEY, JSON.stringify(preferences));
  } catch {
    // Private windows can refuse writes; preferences just will not persist.
  }
  return resolve(undefined, 0);
}

// Signatures match the real API so copied callers compile unchanged.

export function wakeOnLan(_hostId: number): Promise<{ success: boolean }> {
  return resolve({ success: false });
}

export function bulkUpdateSSHHosts(
  _hostIds: number[],
  _updates: Record<string, unknown>,
): Promise<{ updated: number; failed: number; errors: string[] }> {
  return resolve({ updated: 0, failed: 0, errors: [] });
}

export function createSSHHost(_hostData: unknown): Promise<Host> {
  return Promise.reject(new Error("The host could not be created."));
}

export function deleteSSHHost(
  _hostId: number,
): Promise<Record<string, unknown>> {
  return resolve({});
}

export function renameFolder(
  _oldName: string,
  _newName: string,
): Promise<Record<string, unknown>> {
  return resolve({});
}

export function updateFolderMetadata(
  _name: string,
  _color?: string,
  _icon?: string,
  _credentialId?: number | null,
): Promise<void> {
  return resolve(undefined);
}

export function deleteAllHostsInFolder(
  _folderName: string,
): Promise<{ deletedCount: number }> {
  return resolve({ deletedCount: 0 });
}

export function reorderSSHHosts(
  positions: { id: number; sortOrder: number }[],
): Promise<{ updated: number }> {
  return resolve({ updated: positions.length }, 0);
}

export function reorderFolders(
  positions: { name: string; sortOrder: number }[],
): Promise<{ updated: number }> {
  return resolve({ updated: positions.length }, 0);
}

// ── Docker ──────────────────────────────────────────────────

export function getDockerContainers(): Promise<DemoContainer[]> {
  return resolve(clone(DEMO_CONTAINERS));
}

export function getDockerInfo(): Promise<typeof DEMO_DOCKER_INFO> {
  return resolve(clone(DEMO_DOCKER_INFO));
}

/** Resolves undefined for a container that is not running. */
export function getContainerStats(
  id: string,
): Promise<DemoContainerStats | undefined> {
  return resolve(clone(DEMO_CONTAINER_STATS[id]));
}

export function getContainerLogs(id: string): Promise<string[]> {
  return resolve(clone(DEMO_CONTAINER_LOGS[id] ?? []));
}

// ── Proxmox ─────────────────────────────────────────────────

export interface DemoProxmoxSnapshot {
  nodes: DemoProxmoxNode[];
  guests: DemoProxmoxGuest[];
  interfaces: DemoProxmoxInterface[];
  storage: DemoProxmoxStoragePool[];
  cluster: DemoProxmoxCluster;
}

export function getProxmoxStats(): Promise<DemoProxmoxSnapshot> {
  return resolve(
    clone({
      nodes: DEMO_PROXMOX_NODES,
      guests: DEMO_PROXMOX_GUESTS,
      interfaces: DEMO_PROXMOX_INTERFACES,
      storage: DEMO_PROXMOX_STORAGE,
      cluster: DEMO_PROXMOX_CLUSTER,
    }),
  );
}

// ── Host metrics ────────────────────────────────────────────

export function getHostMetrics(hostId: string): Promise<DemoHostMetrics> {
  return resolve(
    clone(DEMO_HOST_METRICS[hostId] ?? DEMO_HOST_METRICS_DEFAULT),
  );
}

/**
 * A pre-generated series for the non-live time ranges. Deterministic per
 * host and range so switching tabs back and forth does not reshuffle it.
 */
export function getMetricsHistory(
  hostId: string,
  range: "1h" | "6h" | "24h" | "7d",
): Promise<number[]> {
  const points = range === "1h" ? 60 : range === "6h" ? 72 : 96;
  let seed = 0;
  for (const ch of `${hostId}:${range}`) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
  const series = Array.from({ length: points }, (_, i) => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const wave = Math.sin(i / (points / 6)) * 14;
    return Math.min(96, Math.max(3, 42 + wave + ((seed % 1000) / 1000) * 18 - 9));
  });
  return resolve(series);
}

// ── tmux ────────────────────────────────────────────────────

export function getTmuxSessions(): Promise<DemoTmuxSession[]> {
  return resolve(clone(DEMO_TMUX_SESSIONS));
}

export function getTmuxPaneOutput(paneId: string): Promise<string[]> {
  return resolve(clone(DEMO_TMUX_PANE_OUTPUT[paneId] ?? []));
}
