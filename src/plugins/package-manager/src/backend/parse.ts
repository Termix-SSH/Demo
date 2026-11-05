import type {
  HistoryItem,
  InstalledItem,
  Manager,
  RepoItem,
  SearchItem,
  UpdateItem,
} from "../shared/types.js";
import { MARK } from "./scripts.js";

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim());

/** Splits output at a marker line. */
function sections(text: string): Record<string, string> {
  const out: Record<string, string> = { "": "" };
  let current = "";
  for (const line of text.split("\n")) {
    if (line.startsWith(MARK)) {
      current = line.slice(MARK.length).trim();
      out[current] = "";
    } else {
      out[current] += `${line}\n`;
    }
  }
  return out;
}

const stripArch = (name: string) => name.replace(/\.[^.]+$/, "");

/** "curl-7.76.1-26.el9.x86_64" to "curl". */
function nameFromNevra(nevra: string): string {
  const match = nevra.match(/^(.+)-[^-]+-[^-]+\.[^.]+$/);
  return match ? match[1] : nevra;
}

/** "1.5 MiB" to bytes. */
export function parseSize(text: string): number | null {
  const match = text.trim().match(/^([\d.]+)\s*(B|KiB|MiB|GiB|KB|MB|GB)?$/i);
  if (!match) return null;
  const unit = (match[2] ?? "B").toLowerCase();
  const scale: Record<string, number> = {
    b: 1,
    kib: 1024,
    kb: 1000,
    mib: 1024 ** 2,
    mb: 1000 ** 2,
    gib: 1024 ** 3,
    gb: 1000 ** 3,
  };
  return Math.round(Number(match[1]) * (scale[unit] ?? 1));
}

export function parseUpdates(pm: Manager, output: string): UpdateItem[] {
  switch (pm) {
    case "apt":
      return lines(output).flatMap((line) => {
        const match = line.match(
          /^([^/\s]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from: ([^\]]+)\]/,
        );
        if (!match) return [];
        return [
          {
            name: match[1],
            repo: match[2],
            available: match[3],
            current: match[4],
            security: /security/i.test(match[2]),
          },
        ];
      });
    case "dnf":
    case "yum": {
      const parts = sections(output);
      const installed = new Map<string, string>();
      for (const line of lines(parts.INST ?? "")) {
        const [name, version] = line.split(" ");
        if (name && version) installed.set(name, version);
      }
      const security = new Set(
        lines(parts.SEC ?? "")
          .map((line) => line.trim().split(/\s+/))
          .filter((cols) => cols.length >= 3)
          .map((cols) => nameFromNevra(cols[cols.length - 1])),
      );
      const out: UpdateItem[] = [];
      for (const line of lines(parts[""])) {
        if (/^(Obsoleting|Last metadata|Security:)/i.test(line)) break;
        const cols = line.trim().split(/\s+/);
        if (cols.length !== 3 || !cols[0].includes(".")) continue;
        const base = stripArch(cols[0]);
        out.push({
          name: base,
          current: installed.get(cols[0]) ?? "",
          available: cols[1],
          repo: cols[2],
          security: security.has(base),
        });
      }
      return out;
    }
    case "zypper":
      return lines(output).flatMap((line) => {
        const cols = line.split("|").map((col) => col.trim());
        if (cols.length < 6 || cols[0] !== "v") return [];
        return [
          {
            name: cols[2],
            repo: cols[1],
            current: cols[3],
            available: cols[4],
            security: false,
          },
        ];
      });
    case "pacman":
      return lines(output).flatMap((line) => {
        const match = line.match(/^(\S+)\s+(\S+)\s+->\s+(\S+)/);
        if (!match) return [];
        return [
          {
            name: match[1],
            current: match[2],
            available: match[3],
            repo: "",
            security: false,
          },
        ];
      });
    case "apk":
      return lines(output).flatMap((line) => {
        const match = line.match(
          /^(\S+)\s+\S+\s+\{[^}]*\}\s+\([^)]*\)\s+\[upgradable from: (\S+)\]/,
        );
        if (!match) return [];
        const next = splitApk(match[1]);
        const prev = splitApk(match[2]);
        return [
          {
            name: next.name,
            current: prev.version,
            available: next.version,
            repo: "",
            security: false,
          },
        ];
      });
  }
}

/** "musl-1.2.5-r1" to name and version. */
export function splitApk(text: string): { name: string; version: string } {
  const match = text.match(/^(.+)-(\d[^-]*-r\d+)$/);
  return match
    ? { name: match[1], version: match[2] }
    : { name: text, version: "" };
}

export function parseInstalled(pm: Manager, output: string): InstalledItem[] {
  const parts = sections(output);
  const held = new Set<string>();
  for (const line of lines(parts.HELD ?? "")) {
    if (pm === "zypper") {
      const cols = line.split("|").map((col) => col.trim());
      if (cols.length >= 3 && /^\d+$/.test(cols[0])) held.add(cols[1]);
    } else if (pm === "dnf" || pm === "yum") {
      const match = line.trim().match(/^(.+?)-\d+:/);
      if (match) held.add(match[1]);
    } else {
      held.add(line.trim());
    }
  }
  if (pm === "apk") {
    return lines(parts[""]).flatMap((line) => {
      const first = line.split(/\s+/)[0];
      if (!first) return [];
      const { name, version } = splitApk(first);
      return [{ name, version, size: null, summary: "", held: false }];
    });
  }
  return lines(parts[""]).flatMap((line) => {
    const cols = line.split("\t");
    if (cols.length < 5 || !/^[ih]i/.test(cols[0])) return [];
    const raw = cols[3].trim();
    const size =
      pm === "apt"
        ? /^\d+$/.test(raw)
          ? Number(raw) * 1024
          : null
        : pm === "pacman"
          ? parseSize(raw)
          : /^\d+$/.test(raw)
            ? Number(raw)
            : null;
    return [
      {
        name: cols[1],
        version: cols[2],
        size,
        summary: cols.slice(4).join("\t").trim(),
        held: held.has(cols[1]),
      },
    ];
  });
}

export function parseSearch(pm: Manager, output: string): SearchItem[] {
  const parts = sections(output);
  const installed = new Set<string>();
  for (const line of lines(parts.INST ?? "")) {
    const [name, status] = line.trim().split(/\s+/);
    if (pm === "apt" ? /^[ih]i/.test(status ?? "") : name) installed.add(name);
  }
  switch (pm) {
    case "apt":
      return lines(parts[""]).flatMap((line) => {
        const match = line.match(/^(\S+) - (.*)$/);
        return match
          ? [
              {
                name: match[1],
                version: "",
                summary: match[2],
                installed: installed.has(match[1]),
              },
            ]
          : [];
      });
    case "dnf":
    case "yum": {
      const seen = new Set<string>();
      return lines(parts[""]).flatMap((line) => {
        if (/^[=\s]*(Name|Summary|Matched)/i.test(line)) return [];
        const match =
          line.match(/^\s*(\S+)\s+:\s+(.*)$/) ??
          line.match(/^\s*(\S+)\t+(.*)$/);
        if (!match || !match[1].includes(".")) return [];
        const name = stripArch(match[1]);
        if (seen.has(name)) return [];
        seen.add(name);
        return [
          {
            name,
            version: "",
            summary: match[2].trim(),
            installed: installed.has(name),
          },
        ];
      });
    }
    case "zypper":
      return lines(parts[""]).flatMap((line) => {
        const cols = line.split("|").map((col) => col.trim());
        if (cols.length < 4 || cols[1] === "Name" || /^-+$/.test(cols[1])) {
          return [];
        }
        // S | Name | Summary | Type
        if (cols[3] !== "package") return [];
        return [
          {
            name: cols[1],
            version: "",
            summary: cols[2],
            installed: cols[0].startsWith("i"),
          },
        ];
      });
    case "pacman": {
      const out: SearchItem[] = [];
      const all = lines(parts[""]);
      for (let i = 0; i < all.length; i++) {
        const match = all[i].match(/^(\S+)\/(\S+)\s+(\S+)(.*)$/);
        if (!match) continue;
        const summary = all[i + 1]?.startsWith(" ") ? all[++i].trim() : "";
        out.push({
          name: match[2],
          version: match[3],
          summary,
          installed: /\[installed/.test(match[4]),
        });
      }
      return out;
    }
    case "apk":
      return lines(parts[""]).flatMap((line) => {
        const match = line.match(/^(\S+) - (.*)$/);
        if (!match) return [];
        const { name, version } = splitApk(match[1]);
        return [
          { name, version, summary: match[2], installed: installed.has(name) },
        ];
      });
  }
}

export function parseHistory(pm: Manager, output: string): HistoryItem[] {
  switch (pm) {
    case "apt": {
      const out: HistoryItem[] = [];
      let current: HistoryItem | null = null;
      const names: string[] = [];
      for (const line of output.split("\n")) {
        const [key, ...rest] = line.split(": ");
        const value = rest.join(": ").trim();
        if (key === "Start-Date") {
          current = { date: value, action: "", packages: "", command: "" };
          names.length = 0;
        } else if (!current) {
          continue;
        } else if (key === "Commandline") {
          current.command = value;
        } else if (
          [
            "Install",
            "Upgrade",
            "Remove",
            "Purge",
            "Downgrade",
            "Reinstall",
          ].includes(key)
        ) {
          current.action = current.action
            ? `${current.action}, ${key.toLowerCase()}`
            : key.toLowerCase();
          for (const match of value.matchAll(/([^\s,()]+) \(/g)) {
            names.push(match[1].replace(/:\w+$/, ""));
          }
        } else if (key === "End-Date") {
          current.packages = names.join(", ");
          if (current.action) out.push(current);
          current = null;
        }
      }
      return out.reverse().slice(0, 200);
    }
    case "dnf":
    case "yum":
      return lines(output).flatMap((line) => {
        const cols = line.includes("|")
          ? line.split("|").map((col) => col.trim())
          : line.trim().split(/\s{2,}/);
        if (cols.length < 4 || !/^\d+$/.test(cols[0])) return [];
        return [
          {
            date: cols[2],
            action: cols[3],
            packages: cols[4] ? `${cols[4]}` : "",
            command: cols[1],
          },
        ];
      });
    case "zypper":
      return lines(output)
        .flatMap((line) => {
          const cols = line.split("|");
          if (cols.length < 4 || !["install", "remove"].includes(cols[1])) {
            return [];
          }
          return [
            {
              date: cols[0],
              action: cols[1],
              packages: `${cols[2]} ${cols[3]}`,
              command: "",
            },
          ];
        })
        .reverse()
        .slice(0, 200);
    case "pacman":
      return lines(output)
        .flatMap((line) => {
          const match = line.match(/^\[([^\]]+)\] \[ALPM\] (\w+) (.+)$/);
          if (!match) return [];
          return [
            {
              date: match[1],
              action: match[2],
              packages: match[3],
              command: "",
            },
          ];
        })
        .reverse()
        .slice(0, 200);
    case "apk":
      return [];
  }
}

export function parseRepos(pm: Manager, output: string): RepoItem[] {
  switch (pm) {
    case "apt": {
      const out: RepoItem[] = [];
      let file = "";
      let block: Record<string, string> = {};
      const flushBlock = () => {
        if (block.uris) {
          out.push({
            id: file,
            name: [block.suites, block.components].filter(Boolean).join(" "),
            url: block.uris,
            enabled: block.enabled?.toLowerCase() !== "no",
          });
        }
        block = {};
      };
      for (const line of output.split("\n")) {
        if (line.startsWith(`${MARK}FILE `)) {
          flushBlock();
          file = line.slice(MARK.length + 5).trim();
          continue;
        }
        if (file) {
          if (!line.trim()) {
            flushBlock();
            continue;
          }
          const match = line.match(/^([A-Za-z-]+):\s*(.*)$/);
          if (match) block[match[1].toLowerCase()] = match[2].trim();
          continue;
        }
        const tab = line.indexOf("\t");
        if (tab < 0) continue;
        const entry = line.slice(tab + 1).trim();
        const enabled = !entry.startsWith("#");
        const body = entry.replace(/^#\s*/, "");
        const match = body.match(
          /^deb(-src)?\s+(?:\[[^\]]*\]\s+)?(\S+)\s+(.*)$/,
        );
        if (!match) continue;
        out.push({
          id: line.slice(0, tab),
          name: `${match[1] ? "deb-src " : ""}${match[3]}`.trim(),
          url: match[2],
          enabled,
        });
      }
      flushBlock();
      return out;
    }
    case "dnf":
    case "yum":
      return lines(output).flatMap((line) => {
        const match = line.match(/^(\S+)\s+(.*?)\s+(enabled|disabled)\b/i);
        if (!match || match[1] === "repo") return [];
        return [
          {
            id: match[1],
            name: match[2],
            url: "",
            enabled: match[3].toLowerCase() === "enabled",
          },
        ];
      });
    case "zypper":
      return lines(output).flatMap((line) => {
        const cols = line.split("|").map((col) => col.trim());
        if (cols.length < 7 || !/^\d+$/.test(cols[0])) return [];
        return [
          {
            id: cols[1],
            name: cols[2],
            url: cols[cols.length - 1],
            enabled: /yes/i.test(cols[3]),
          },
        ];
      });
    case "pacman":
      return lines(output).map((line) => ({
        id: line.trim(),
        name: line.trim(),
        url: "",
        enabled: true,
      }));
    case "apk":
      return lines(output).map((line) => {
        const enabled = !line.trim().startsWith("#");
        const url = line.replace(/^\s*#\s*/, "").trim();
        return { id: url, name: "", url, enabled };
      });
  }
}
