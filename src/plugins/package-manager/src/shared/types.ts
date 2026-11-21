export type Manager = "apt" | "dnf" | "yum" | "zypper" | "pacman" | "apk";

/** Package managers that live next to the system one. */
export type ExtraManager = "flatpak" | "snap" | "brew";
export const EXTRA_MANAGERS: readonly ExtraManager[] = [
  "flatpak",
  "snap",
  "brew",
];

export interface PackagesStatus {
  os: string;
  manager: Manager | "none";
  root: boolean;
  /** True or false when the host can tell, null when it can't. */
  rebootRequired: boolean | null;
  /** Unix seconds the package index was last refreshed, when known. */
  indexUpdatedAt: number | null;
  /** Single packages can be updated (pacman only does full upgrades). */
  singleUpdates: boolean;
  /** Packages can be held at their version. */
  holds: boolean;
  /** Flatpak, Snap or Homebrew found next to the system manager. */
  extras: ExtraManager[];
  canEdit: boolean;
  readOnly: boolean;
}

export interface UpdateItem {
  name: string;
  current: string;
  available: string;
  repo: string;
  security: boolean;
}

export interface InstalledItem {
  name: string;
  version: string;
  /** Bytes, when the package manager reports it. */
  size: number | null;
  summary: string;
  held: boolean;
}

export interface SearchItem {
  name: string;
  version: string;
  summary: string;
  installed: boolean;
}

export interface HistoryItem {
  date: string;
  action: string;
  packages: string;
  command: string;
}

export interface RepoItem {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
}

export interface ActionResult {
  ok: boolean;
  output: string;
}

export type PackageAction =
  | "refresh"
  | "update"
  | "upgrade-all"
  | "install"
  | "remove"
  | "hold"
  | "unhold";

export interface HostUpdateSummary {
  hostId: number;
  updates: number;
  security: number;
  reboot: boolean;
  error?: string;
  checkedAt: string;
}
