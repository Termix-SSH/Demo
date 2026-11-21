/**
 * Flatpak, Snap and Homebrew, which live next to the system package manager.
 * Homebrew refuses to run as root, so it runs as the owner of its prefix.
 */

import { shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ExtraManager,
  HistoryItem,
  InstalledItem,
  PackageAction,
  RepoItem,
  SearchItem,
  UpdateItem,
} from "../shared/types.js";
import { parseSize } from "./parse.js";
import { MARK } from "./scripts.js";

const BREW_PRELUDE = `BREW=""
for b in "$(command -v brew 2>/dev/null)" /home/linuxbrew/.linuxbrew/bin/brew /opt/homebrew/bin/brew /usr/local/bin/brew; do
  [ -n "$b" ] && [ -x "$b" ] && { BREW=$b; break; }
done
[ -n "$BREW" ] || { echo "Homebrew is not installed"; exit 1; }
BU=$(stat -c %U "$(dirname "$(dirname "$(readlink -f "$BREW")")")" 2>/dev/null)
brew() {
  if [ "$(id -un)" = "$BU" ]; then env HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_COLOR=1 "$BREW" "$@"
  elif [ "$(id -u)" = 0 ]; then runuser -u "$BU" -- env HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_COLOR=1 "$BREW" "$@"
  else sudo -n -u "$BU" env HOMEBREW_NO_AUTO_UPDATE=1 HOMEBREW_NO_ENV_HINTS=1 HOMEBREW_NO_COLOR=1 "$BREW" "$@"; fi
}
cd /tmp
`;

const words = (names: string[]) => names.map(shellQuote).join(" ");

export function extraUpdatesScript(pm: ExtraManager): string {
  switch (pm) {
    case "flatpak":
      return `echo "${MARK}CUR"
flatpak list --columns=application,branch,version 2>/dev/null
echo "${MARK}UP"
flatpak remote-ls --updates --columns=application,branch,version,origin 2>/dev/null
exit 0
`;
    case "snap":
      return `echo "${MARK}CUR"
snap list 2>/dev/null
echo "${MARK}UP"
snap refresh --list 2>/dev/null
exit 0
`;
    case "brew":
      return `${BREW_PRELUDE}brew outdated --json=v2 2>/dev/null; exit 0
`;
  }
}

export function extraInstalledScript(pm: ExtraManager): string {
  switch (pm) {
    case "flatpak":
      return `flatpak list --columns=application,version,size,name 2>/dev/null
echo "${MARK}MASK"
flatpak mask 2>/dev/null
exit 0
`;
    case "snap":
      return `snap list 2>/dev/null; exit 0
`;
    case "brew":
      return `${BREW_PRELUDE}brew info --installed --json=v2 2>/dev/null; exit 0
`;
  }
}

export function extraSearchScript(pm: ExtraManager, query: string): string {
  const q = shellQuote(query);
  switch (pm) {
    case "flatpak":
      return `flatpak search --columns=application,version,name,description -- ${q} 2>/dev/null | head -n 100
echo "${MARK}HAVE"
flatpak list --columns=application 2>/dev/null
exit 0
`;
    case "snap":
      return `snap find -- ${q} 2>/dev/null | head -n 101
echo "${MARK}HAVE"
snap list 2>/dev/null | awk 'NR > 1 { print $1 }'
exit 0
`;
    case "brew":
      return `${BREW_PRELUDE}brew search --formula -- ${q} 2>/dev/null | head -n 100
echo "${MARK}HAVE"
brew list --formula -1 2>/dev/null
exit 0
`;
  }
}

export function extraHistoryScript(pm: ExtraManager): string {
  switch (pm) {
    case "flatpak":
      return `flatpak history --columns=time,change,application,branch 2>/dev/null | tail -n 300; exit 0
`;
    case "snap":
      return `snap changes 2>/dev/null | tail -n 300; exit 0
`;
    case "brew":
      return `exit 0
`;
  }
}

export function extraReposScript(pm: ExtraManager): string {
  switch (pm) {
    case "flatpak":
      return `flatpak remotes --columns=name,url,options 2>/dev/null; exit 0
`;
    case "snap":
      return `exit 0
`;
    case "brew":
      return `${BREW_PRELUDE}brew tap 2>/dev/null; exit 0
`;
  }
}

export function extraActionScript(
  pm: ExtraManager,
  action: PackageAction,
  names: string[] = [],
): string {
  const list = words(names);
  const commands: Record<ExtraManager, Record<PackageAction, string>> = {
    flatpak: {
      refresh: `flatpak update --appstream -y --noninteractive`,
      update: `flatpak update -y --noninteractive ${list}`,
      "upgrade-all": `flatpak update -y --noninteractive`,
      install: `flatpak install -y --noninteractive ${list}`,
      remove: `flatpak uninstall -y --noninteractive ${list}`,
      hold: `flatpak mask ${list}`,
      unhold: `flatpak mask --remove ${list}`,
    },
    snap: {
      refresh: `true`,
      update: `snap refresh ${list}`,
      "upgrade-all": `snap refresh`,
      install: `snap install ${list}`,
      remove: `snap remove ${list}`,
      hold: `snap refresh --hold ${list}`,
      unhold: `snap refresh --unhold ${list}`,
    },
    brew: {
      refresh: `brew update`,
      update: `brew upgrade ${list}`,
      "upgrade-all": `brew update && brew upgrade`,
      install: `brew install ${list}`,
      remove: `brew uninstall ${list}`,
      hold: `brew pin ${list}`,
      unhold: `brew unpin ${list}`,
    },
  };
  return `${pm === "brew" ? BREW_PRELUDE : ""}{ ${commands[pm][action]}; } 2>&1
`;
}

// ---- parsing ----

const textLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/\r$/, ""))
    .filter((line) => line.trim());

function sections(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = { "": [] };
  let current = "";
  for (const line of textLines(text)) {
    if (line.startsWith(MARK)) {
      current = line.slice(MARK.length).trim();
      out[current] = [];
    } else {
      out[current].push(line);
    }
  }
  return out;
}

const tabs = (line: string) => line.split("\t").map((cell) => cell.trim());

/**
 * Rows of a table snap prints. Snap lines its columns up, so each row is
 * cut where the header's columns start; cells may hold spaces.
 */
export function parseTable(rows: string[]): Array<Record<string, string>> {
  const [header, ...body] = rows;
  if (!header || !/^Name\s|^ID\s/.test(header)) return [];
  const starts: Array<{ key: string; at: number }> = [];
  const re = /\S+/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(header))) {
    starts.push({ key: match[0].toLowerCase(), at: match.index });
  }
  return body.map((line) => {
    const row: Record<string, string> = {};
    starts.forEach((col, i) => {
      const end = i + 1 < starts.length ? starts[i + 1].at : line.length;
      row[col.key] = line.slice(col.at, end).trim();
    });
    return row;
  });
}

function jsonOf(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

type BrewFormula = {
  name?: string;
  token?: string;
  desc?: string;
  installed?: Array<{ version?: string }> | string;
  installed_versions?: string[];
  current_version?: string;
  pinned?: boolean;
};

export function parseExtraUpdates(
  pm: ExtraManager,
  output: string,
): UpdateItem[] {
  if (pm === "brew") {
    const data = jsonOf(output);
    const items = [
      ...((data?.formulae as BrewFormula[]) ?? []),
      ...((data?.casks as BrewFormula[]) ?? []),
    ];
    return items.map((item) => ({
      name: item.name ?? item.token ?? "",
      current: (item.installed_versions ?? []).join(", "),
      available: item.current_version ?? "",
      repo:
        data?.casks && (data.casks as BrewFormula[]).includes(item)
          ? "cask"
          : "",
      security: false,
    }));
  }
  const parts = sections(output);
  if (pm === "flatpak") {
    const current = new Map(
      (parts.CUR ?? []).map((line) => {
        const [app, branch, version] = tabs(line);
        return [`${app}/${branch}`, version || branch];
      }),
    );
    return (parts.UP ?? []).flatMap((line) => {
      const [app, branch, version, origin] = tabs(line);
      if (!app) return [];
      return [
        {
          name: app,
          current: current.get(`${app}/${branch}`) ?? "",
          available: version || branch || "",
          repo: origin ?? "",
          security: false,
        },
      ];
    });
  }
  const current = new Map(
    parseTable(parts.CUR ?? []).map((row) => [row.name, row.version]),
  );
  return parseTable(parts.UP ?? []).map((row) => ({
    name: row.name,
    current: current.get(row.name) ?? "",
    available: row.version ?? "",
    repo: row.publisher ?? "",
    security: false,
  }));
}

export function parseExtraInstalled(
  pm: ExtraManager,
  output: string,
): InstalledItem[] {
  if (pm === "brew") {
    const data = jsonOf(output);
    const formulae = ((data?.formulae as BrewFormula[]) ?? []).map((f) => ({
      name: f.name ?? "",
      version: Array.isArray(f.installed)
        ? (f.installed[0]?.version ?? "")
        : "",
      size: null,
      summary: f.desc ?? "",
      held: f.pinned === true,
    }));
    const casks = ((data?.casks as BrewFormula[]) ?? []).map((c) => ({
      name: c.token ?? c.name ?? "",
      version: typeof c.installed === "string" ? c.installed : "",
      size: null,
      summary: c.desc ?? "",
      held: false,
    }));
    return [...formulae, ...casks].filter((item) => item.name);
  }
  if (pm === "flatpak") {
    const parts = sections(output);
    const masked = new Set((parts.MASK ?? []).map((line) => line.trim()));
    return parts[""].flatMap((line) => {
      const [app, version, size, name] = tabs(line);
      if (!app) return [];
      return [
        {
          name: app,
          version: version ?? "",
          size: parseSize((size ?? "").replace(/ /g, " ")),
          summary: name ?? "",
          held: masked.has(app),
        },
      ];
    });
  }
  return parseTable(textLines(output)).map((row) => ({
    name: row.name,
    version: row.version ?? "",
    size: null,
    summary: row.tracking ? `Tracking ${row.tracking}` : "",
    held: /held/.test(row.notes ?? ""),
  }));
}

export function parseExtraSearch(
  pm: ExtraManager,
  output: string,
): SearchItem[] {
  const parts = sections(output);
  const have = new Set((parts.HAVE ?? []).map((line) => line.trim()));
  if (pm === "flatpak") {
    return parts[""].flatMap((line) => {
      const [app, version, name, description] = tabs(line);
      if (!app || app === "Application ID") return [];
      return [
        {
          name: app,
          version: version ?? "",
          summary: [name, description].filter(Boolean).join(": "),
          installed: have.has(app),
        },
      ];
    });
  }
  if (pm === "snap") {
    return parseTable(parts[""]).map((row) => ({
      name: row.name,
      version: row.version ?? "",
      summary: row.summary ?? "",
      installed: have.has(row.name),
    }));
  }
  return parts[""]
    .filter((line) => !line.startsWith("==>"))
    .flatMap((line) => line.trim().split(/\s+/))
    .filter(Boolean)
    .map((name) => ({
      name,
      version: "",
      summary: "",
      installed: have.has(name),
    }));
}

export function parseExtraHistory(
  pm: ExtraManager,
  output: string,
): HistoryItem[] {
  if (pm === "flatpak") {
    return textLines(output)
      .flatMap((line) => {
        const [time, change, app, branch] = tabs(line);
        if (!time || time === "Time") return [];
        return [
          {
            date: time,
            action: change ?? "",
            packages: [app, branch].filter(Boolean).join(" "),
            command: "",
          },
        ];
      })
      .reverse();
  }
  if (pm === "snap") {
    return parseTable(textLines(output))
      .map((row) => ({
        date: row.spawn ?? "",
        action: row.status ?? "",
        packages: row.summary ?? "",
        command: "",
      }))
      .reverse();
  }
  return [];
}

export function parseExtraRepos(pm: ExtraManager, output: string): RepoItem[] {
  if (pm === "flatpak") {
    return textLines(output).flatMap((line) => {
      const [name, url, options] = tabs(line);
      if (!name || name === "Name") return [];
      return [
        {
          id: name,
          name,
          url: url ?? "",
          enabled: !/disabled/.test(options ?? ""),
        },
      ];
    });
  }
  if (pm === "brew") {
    return textLines(output).map((name) => ({
      id: name.trim(),
      name: name.trim(),
      url: `https://github.com/${name.trim().replace(/\/(?!.*\/)/, "/homebrew-")}`,
      enabled: true,
    }));
  }
  return [];
}
