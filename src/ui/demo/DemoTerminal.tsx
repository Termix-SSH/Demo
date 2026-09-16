import { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  LayoutGrid,
  Maximize2,
  Minimize2,
  Search,
  X,
} from "lucide-react";
import type { Host } from "@/types/ui-types";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { resolveTermixThemeColors } from "@/demo/terminal-theme";
import { DEMO_FS } from "@/demo/demo-data";

// A real xterm against a scripted shell. Commands are answered from the same
// filesystem the file manager walks. The connect sequence and its log live in
// DemoConnectionGate, which every tab type shares.

function motd(host: Host): string[] {
  return [
    "",
    `Welcome to Ubuntu 24.04.1 LTS (GNU/Linux 6.8.0-41-generic x86_64)`,
    "",
    " * Documentation:  https://help.ubuntu.com",
    " * Management:     https://landscape.canonical.com",
    "",
    `  System load:  0.0${(Math.abs(hash(host.name)) % 9) + 1}               Processes:             ${120 + (Math.abs(hash(host.name)) % 80)}`,
    `  Usage of /:   ${host.ram ?? 38}.2% of 38.60GB   Users logged in:       1`,
    `  Memory usage: ${host.ram ?? 44}%                IPv4 address for eth0: ${host.ip}`,
    `  Swap usage:   0%`,
    "",
    "Type `help` to see the available commands.",
    "",
  ];
}

function hash(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i++) h = (h * 31 + value.charCodeAt(i)) | 0;
  return h;
}

function listing(path: string): string[] {
  const entries = DEMO_FS[path] ?? [];
  if (entries.length === 0) return [""];
  const names = entries.map((e) =>
    e.type === "directory" ? `\x1b[1;34m${e.name}\x1b[0m` : e.name,
  );
  return [names.join("  "), ""];
}

function longListing(path: string): string[] {
  const entries = DEMO_FS[path] ?? [];
  const rows = entries.map((e) => {
    const size = String(e.size ?? 0).padStart(9);
    const name = e.type === "directory" ? `\x1b[1;34m${e.name}\x1b[0m` : e.name;
    return `${e.permissions ?? "-rw-r--r--"} 1 ${(e.owner ?? "root").padEnd(7)} ${(e.group ?? "root").padEnd(7)}${size} Sep  9 10:15 ${name}`;
  });
  return [`total ${entries.length * 4}`, ...rows, ""];
}

function resolvePath(cwd: string, arg: string): string {
  if (!arg || arg === ".") return cwd;
  let next = arg.startsWith("/")
    ? arg
    : cwd === "/"
      ? `/${arg}`
      : `${cwd}/${arg}`;
  const parts: string[] = [];
  for (const part of next.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  next = `/${parts.join("/")}`;
  return next === "//" ? "/" : next;
}

export function DemoTerminal({ host }: { host: Host }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<SearchAddon | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const colors = resolveTermixThemeColors("termix", "dark");
    const term = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono Variable", "JetBrains Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 2000,
      theme: colors,
      allowProposedApi: true,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    const search = new SearchAddon();
    term.loadAddon(search);
    searchRef.current = search;
    // Ctrl+F opens the overlay instead of reaching the scripted shell.
    term.attachCustomKeyEventHandler((event) => {
      if (event.type === "keydown" && event.ctrlKey && event.key === "f") {
        setSearchOpen(true);
        return false;
      }
      return true;
    });
    term.open(containerRef.current);
    try {
      fit.fit();
    } catch {
      // The container can be zero-sized on the first frame.
    }

    let cwd = host.defaultPath || "/home/deploy";
    let buffer = "";
    const history: string[] = [];
    let historyIndex = -1;

    const prompt = () =>
      `\x1b[1;32m${host.username}@${host.name}\x1b[0m:\x1b[1;34m${cwd}\x1b[0m$ `;

    const write = (lines: string[]) => {
      for (const line of lines) term.writeln(line);
    };

    write(motd(host));
    term.write(prompt());

    const run = (raw: string) => {
      const input = raw.trim();
      if (input) {
        history.push(input);
        historyIndex = history.length;
      }
      const [cmd, ...args] = input.split(/\s+/);
      const arg = args.join(" ");

      switch (cmd) {
        case "":
          break;
        case "help":
          write([
            "Available commands:",
            "  ls [-l] [path]   list a directory",
            "  cd <path>        change directory",
            "  pwd              print working directory",
            "  cat <file>       print a file",
            "  whoami           print the current user",
            "  hostname         print the host name",
            "  uname -a         print system information",
            "  uptime           show load averages",
            "  df -h            show disk usage",
            "  free -h          show memory usage",
            "  ps               list processes",
            "  top / htop       a static process snapshot",
            "  echo <text>      print text",
            "  clear            clear the screen",
            "",
          ]);
          break;
        case "ls": {
          const flags = args.filter((a) => a.startsWith("-"));
          const rest = args.filter((a) => !a.startsWith("-"));
          const target = resolvePath(cwd, rest[0] ?? "");
          if (!DEMO_FS[target]) {
            write([
              `ls: cannot access '${rest[0]}': No such file or directory`,
            ]);
            break;
          }
          write(
            flags.some((f) => f.includes("l"))
              ? longListing(target)
              : listing(target),
          );
          break;
        }
        case "cd": {
          const target = resolvePath(cwd, arg || "/home/deploy");
          if (!DEMO_FS[target]) {
            write([`bash: cd: ${arg}: No such file or directory`]);
            break;
          }
          cwd = target;
          break;
        }
        case "pwd":
          write([cwd, ""]);
          break;
        case "cat": {
          if (!arg) {
            write(["usage: cat <file>"]);
            break;
          }
          const target = resolvePath(cwd, arg);
          const parent = target.slice(0, target.lastIndexOf("/")) || "/";
          const name = target.slice(target.lastIndexOf("/") + 1);
          const entry = (DEMO_FS[parent] ?? []).find((e) => e.name === name);
          if (!entry) {
            write([`cat: ${arg}: No such file or directory`]);
            break;
          }
          if (entry.type === "directory") {
            write([`cat: ${arg}: Is a directory`]);
            break;
          }
          write([
            `# ${target}`,
            "",
            "This file has no demo content attached.",
            "",
          ]);
          break;
        }
        case "whoami":
          write([host.username, ""]);
          break;
        case "hostname":
          write([host.name, ""]);
          break;
        case "uname":
          write([
            args.includes("-a")
              ? `Linux ${host.name} 6.8.0-41-generic #41-Ubuntu SMP PREEMPT_DYNAMIC x86_64 GNU/Linux`
              : "Linux",
            "",
          ]);
          break;
        case "uptime":
          write([
            ` 10:15:02 up 9 days,  3:14,  1 user,  load average: 0.0${(Math.abs(hash(host.name)) % 9) + 1}, 0.12, 0.09`,
            "",
          ]);
          break;
        case "df":
          write([
            "Filesystem      Size  Used Avail Use% Mounted on",
            `/dev/sda1        39G   15G   22G  ${host.ram ?? 40}% /`,
            "tmpfs           2.0G     0  2.0G   0% /dev/shm",
            "/dev/sda15      105M  6.1M   99M   6% /boot/efi",
            "",
          ]);
          break;
        case "free":
          write([
            "               total        used        free      shared  buff/cache   available",
            `Mem:           3.8Gi       1.6Gi       1.1Gi        12Mi       1.2Gi       2.1Gi`,
            "Swap:             0B          0B          0B",
            "",
          ]);
          break;
        case "ps":
          write([
            "    PID TTY          TIME CMD",
            "   1842 pts/0    00:00:00 bash",
            "   1903 pts/0    00:00:00 ps",
            "",
          ]);
          break;
        case "top":
        case "htop":
          write([
            `top - 10:15:02 up 9 days,  1 user,  load average: 0.0${(Math.abs(hash(host.name)) % 9) + 1}, 0.12, 0.09`,
            "Tasks: 142 total,   1 running, 141 sleeping,   0 stopped",
            `%Cpu(s):  ${host.cpu ?? 12}.3 us,  1.1 sy,  0.0 ni, 86.2 id`,
            "MiB Mem :   3901.4 total,   1124.8 free,   1620.2 used",
            "",
            "    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM COMMAND",
            "   1120 root      20   0  712345  98234  21344 S   4.3   2.5 dockerd",
            "    842 www-data  20   0  214532  42112  12844 S   2.0   1.1 nginx",
            "    611 postgres  20   0  398211  88210  31022 S   1.7   2.2 postgres",
            "",
            "(press enter to exit)",
            "",
          ]);
          break;
        case "echo":
          write([arg, ""]);
          break;
        case "clear":
          term.clear();
          break;
        case "exit":
        case "logout":
          write(["This is a demo session, so there is nothing to disconnect."]);
          break;
        default:
          write([`bash: ${cmd}: command not found`]);
      }
      term.write(prompt());
    };

    const disposable = term.onData((data) => {
      switch (data) {
        case "\r":
          term.write("\r\n");
          run(buffer);
          buffer = "";
          return;
        case "\u007f": // backspace
          if (buffer.length > 0) {
            buffer = buffer.slice(0, -1);
            term.write("\b \b");
          }
          return;
        case "\u0003": // ctrl-c
          term.write("^C\r\n");
          buffer = "";
          term.write(prompt());
          return;
        case "\u001b[A": // up
          if (historyIndex > 0) {
            historyIndex -= 1;
            term.write("\r\x1b[K" + prompt() + history[historyIndex]);
            buffer = history[historyIndex];
          }
          return;
        case "\u001b[B": // down
          if (historyIndex < history.length - 1) {
            historyIndex += 1;
            term.write("\r\x1b[K" + prompt() + history[historyIndex]);
            buffer = history[historyIndex];
          } else {
            historyIndex = history.length;
            term.write("\r\x1b[K" + prompt());
            buffer = "";
          }
          return;
        default:
          if (data >= " " || data === "\t") {
            buffer += data;
            term.write(data);
          }
      }
    });

    const onResize = () => {
      try {
        fit.fit();
      } catch {
        // Ignore transient zero-size layouts.
      }
    };
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(containerRef.current);

    return () => {
      window.removeEventListener("resize", onResize);
      observer.disconnect();
      disposable.dispose();
      term.dispose();
    };
  }, [host]);

  return (
    <div className="h-full w-full relative bg-background">
      <div ref={containerRef} className="h-full w-full relative p-1" />

      {searchOpen && (
        <TerminalSearchBar
          searchAddon={searchRef.current}
          onClose={() => setSearchOpen(false)}
        />
      )}

      <TerminalToolbar
        host={host}
        onOpenSearch={() => setSearchOpen(true)}
      />
    </div>
  );
}

/**
 * The real toolbar is a draggable pill anchored bottom-centre that sits at 30%
 * opacity until you hover it. The demo keeps the look and the collapse and
 * density behaviour, minus the dragging.
 */
function TerminalToolbar({
  host,
  onOpenSearch,
}: {
  host: Host;
  onOpenSearch: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [density, setDensity] = useState<"icon" | "labeled" | "expanded">(
    "labeled",
  );
  const [hidden, setHidden] = useState(false);

  if (hidden) return null;

  const control =
    "inline-flex min-h-8 min-w-8 items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:translate-y-px disabled:pointer-events-none disabled:opacity-40";

  return (
    <div className="pointer-events-none absolute inset-0 z-[110] flex items-end justify-center pb-2">
      <div
        className={`pointer-events-auto transition-opacity duration-300 hover:duration-0 focus-within:duration-0 hover:opacity-100 focus-within:opacity-100 ${collapsed ? "opacity-100" : "opacity-30"}`}
      >
        {collapsed ? (
          <div className="terminal-toolbar-collapsed-shell flex rounded-sm border border-border bg-background/90 p-0.5 shadow-lg backdrop-blur-sm">
            <button
              className={control}
              onClick={() => setCollapsed(false)}
              title="Show toolbar"
            >
              <Maximize2 className="size-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col overflow-hidden rounded-sm border border-border bg-background/90 shadow-lg backdrop-blur-sm">
            {density === "expanded" && (
              <div className="flex flex-wrap items-center justify-center gap-x-1 border-b border-border px-1.5 py-0.5">
                <StatBar label="CPU" value={host.cpu ?? 12} />
                <StatBar label="MEM" value={host.ram ?? 44} />
                <StatBar label="DISK" value={61} />
              </div>
            )}
            <div className="flex items-center p-0.5">
              <span
                className={`${control} cursor-grab`}
                title="Drag (not wired in the demo)"
              >
                <GripVertical className="size-3.5" />
              </span>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
              <button className={control} onClick={onOpenSearch} title="Search">
                <Search className="size-3.5" />
                {density !== "icon" && "Search"}
              </button>
              <button
                className={control}
                onClick={() =>
                  setDensity((d) =>
                    d === "icon"
                      ? "labeled"
                      : d === "labeled"
                        ? "expanded"
                        : "icon",
                  )
                }
                title={`Density: ${density}`}
              >
                <LayoutGrid className="size-3.5" />
                {density !== "icon" && "Density"}
              </button>
              <span className="mx-0.5 h-5 w-px shrink-0 bg-border" />
              <button
                className={control}
                onClick={() => setCollapsed(true)}
                title="Collapse"
              >
                <Minimize2 className="size-3.5" />
              </button>
              <button
                className={control}
                onClick={() => setHidden(true)}
                title="Hide toolbar"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90
      ? "bg-red-500"
      : value >= 75
        ? "bg-warning"
        : "bg-accent-brand";
  return (
    <span className="inline-flex items-center gap-1 px-1 text-[10px] font-semibold text-muted-foreground">
      {label}
      <span className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
        <span
          className={`block h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </span>
    </span>
  );
}

function TerminalSearchBar({
  searchAddon,
  onClose,
}: {
  searchAddon: SearchAddon | null;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const options = { caseSensitive, wholeWord, regex };

  const find = useCallback(
    (direction: "next" | "previous") => {
      if (!searchAddon || !query) return;
      const found =
        direction === "next"
          ? searchAddon.findNext(query, options)
          : searchAddon.findPrevious(query, options);
      setNoResults(!found);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [searchAddon, query, caseSensitive, wholeWord, regex],
  );

  const toggle = "font-mono text-[11px] leading-none text-muted-foreground";
  const toggleOn =
    "border-border bg-muted text-foreground hover:bg-muted dark:bg-muted/60";

  return (
    <div className="absolute top-2 right-2 z-[130] flex items-center gap-1 border border-border bg-background/95 p-1 shadow-lg backdrop-blur-sm">
      <Input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setNoResults(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") find(e.shiftKey ? "previous" : "next");
          if (e.key === "Escape") onClose();
        }}
        placeholder="Find"
        className={`h-7 w-48 font-mono ${noResults ? "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20" : ""}`}
      />
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${toggle} ${caseSensitive ? toggleOn : ""}`}
        onClick={() => setCaseSensitive((v) => !v)}
        title="Match case"
      >
        Aa
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${toggle} ${wholeWord ? toggleOn : ""}`}
        onClick={() => setWholeWord((v) => !v)}
        title="Whole word"
      >
        ab
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className={`${toggle} ${regex ? toggleOn : ""}`}
        onClick={() => setRegex((v) => !v)}
        title="Regular expression"
      >
        .*
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => find("previous")}
        title="Previous match"
      >
        <ChevronUp className="size-3.5" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => find("next")}
        title="Next match"
      >
        <ChevronDown className="size-3.5" />
      </Button>
      <Button variant="ghost" size="icon-sm" onClick={onClose} title="Close">
        <X className="size-3.5" />
      </Button>
    </div>
  );
}

export default DemoTerminal;
