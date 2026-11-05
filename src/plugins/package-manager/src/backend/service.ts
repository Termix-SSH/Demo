import {
  HostScriptError,
  parseKeys,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ActionResult,
  HistoryItem,
  InstalledItem,
  Manager,
  PackageAction,
  PackagesStatus,
  RepoItem,
  SearchItem,
  UpdateItem,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import {
  parseHistory,
  parseInstalled,
  parseRepos,
  parseSearch,
  parseUpdates,
} from "./parse.js";
import type { Remote } from "./remote.js";
import {
  STATUS_SCRIPT,
  actionScript,
  historyScript,
  installedScript,
  reposScript,
  searchScript,
  supportsHolds,
  updatesScript,
} from "./scripts.js";

const MANAGERS = ["apt", "dnf", "yum", "zypper", "pacman", "apk"];
const OUTPUT_LIMIT = 8000;
const DETECT_MS = 10 * 60_000;

export type HostStatus = Omit<PackagesStatus, "canEdit" | "readOnly">;

export function parseStatus(stdout: string): HostStatus {
  const keys = parseKeys(stdout);
  const manager = MANAGERS.includes(keys.manager)
    ? (keys.manager as Manager)
    : "none";
  const index = Number(keys.index);
  return {
    os: keys.os ?? "",
    manager,
    root: keys.root === "1",
    rebootRequired:
      keys.reboot === "1" ? true : keys.reboot === "0" ? false : null,
    indexUpdatedAt: Number.isFinite(index) && index > 0 ? index : null,
    singleUpdates: manager !== "pacman",
    holds: manager !== "none" && supportsHolds(manager),
  };
}

export interface PackageService {
  status: (hostId: number, s: HostSettings) => Promise<HostStatus>;
  updates: (hostId: number, s: HostSettings) => Promise<UpdateItem[]>;
  installed: (hostId: number, s: HostSettings) => Promise<InstalledItem[]>;
  search: (
    hostId: number,
    s: HostSettings,
    query: string,
  ) => Promise<SearchItem[]>;
  history: (hostId: number, s: HostSettings) => Promise<HistoryItem[]>;
  repos: (hostId: number, s: HostSettings) => Promise<RepoItem[]>;
  act: (
    hostId: number,
    s: HostSettings,
    action: PackageAction,
    names?: string[],
  ) => Promise<ActionResult>;
}

export function createService(remote: Remote): PackageService {
  // The package manager rarely changes, so it is read once every few minutes.
  const known = new Map<number, { manager: Manager | "none"; at: number }>();

  const status = async (hostId: number, s: HostSettings) => {
    const result = parseStatus(
      (await remote.read(hostId, s.sudo, STATUS_SCRIPT)).stdout,
    );
    known.set(hostId, { manager: result.manager, at: Date.now() });
    return result;
  };

  const manager = async (hostId: number, s: HostSettings): Promise<Manager> => {
    const cached = known.get(hostId);
    const pm =
      cached && Date.now() - cached.at < DETECT_MS
        ? cached.manager
        : (await status(hostId, s)).manager;
    if (pm === "none") {
      throw new HostScriptError("No supported package manager was found", 400, {
        code: "noManager",
      });
    }
    return pm;
  };

  const read = async (
    hostId: number,
    s: HostSettings,
    script: (pm: Manager) => string,
    timeoutMs = 120_000,
  ) => {
    const pm = await manager(hostId, s);
    const { stdout } = await remote.read(hostId, s.sudo, script(pm), {
      timeoutMs,
      maxOutputBytes: 4_000_000,
    });
    return { pm, stdout };
  };

  return {
    status,
    updates: async (hostId, s) => {
      const { pm, stdout } = await read(hostId, s, updatesScript, 180_000);
      return parseUpdates(pm, stdout);
    },
    installed: async (hostId, s) => {
      const { pm, stdout } = await read(hostId, s, installedScript);
      return parseInstalled(pm, stdout).sort((a, b) =>
        a.name.localeCompare(b.name),
      );
    },
    search: async (hostId, s, query) => {
      const { pm, stdout } = await read(hostId, s, (m) =>
        searchScript(m, query),
      );
      return parseSearch(pm, stdout);
    },
    history: async (hostId, s) => {
      const { pm, stdout } = await read(hostId, s, historyScript);
      return parseHistory(pm, stdout);
    },
    repos: async (hostId, s) => {
      const { pm, stdout } = await read(hostId, s, reposScript);
      return parseRepos(pm, stdout);
    },
    act: async (hostId, s, action, names = []) => {
      const pm = await manager(hostId, s);
      const result = await remote.root(
        hostId,
        s.sudo,
        actionScript(pm, action, names),
        { timeoutMs: 900_000, maxOutputBytes: 4_000_000, allowFail: true },
      );
      const output = result.stdout.trim();
      const tail =
        output.length > OUTPUT_LIMIT ? output.slice(-OUTPUT_LIMIT) : output;
      if (result.code !== 0) {
        if (
          /password is required|a terminal is required/i.test(result.stderr)
        ) {
          throw new HostScriptError(
            "This host needs a root login, passwordless sudo or a saved Sudo Password",
            400,
            { code: "sudo" },
          );
        }
        throw new HostScriptError(
          (tail || result.stderr || "The package manager failed").slice(-1500),
          400,
          { output: tail },
        );
      }
      return { ok: true, output: tail };
    },
  };
}
