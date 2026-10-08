import * as fs from "./fs";
import { homeFor, normalize } from "../fixtures/filesystem";

/**
 * A small bash look-alike for terminal sockets. It answers a handful of
 * everyday commands from the fake filesystem; everything else says it is a
 * demo.
 */

export interface ShellHost {
  name: string;
  ip: string;
  username: string;
}

const RESET = "\x1b[0m";
const BLUE = "\x1b[1;34m";
const GREEN = "\x1b[1;32m";
const CYAN = "\x1b[1;36m";
const DIM = "\x1b[2m";

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function lsTime(iso: string): string {
  const date = new Date(iso);
  const month = date.toLocaleString("en-US", { month: "short" });
  const dayNum = String(date.getDate()).padStart(2, " ");
  const hm = date.toTimeString().slice(0, 5);
  return `${month} ${dayNum} ${hm}`;
}

export class FakeShell {
  private cwd: string;
  private line = "";
  private cursor = 0;
  private history: string[] = [];
  private historyIndex = 0;
  private readonly home: string;

  constructor(
    private readonly host: ShellHost,
    private readonly out: (data: string) => void,
    private readonly options: { banner?: boolean } = {},
  ) {
    this.home = homeFor(host.username);
    this.cwd = this.home;
  }

  get workingDirectory(): string {
    return this.cwd;
  }

  start(): void {
    if (this.options.banner === false) {
      this.prompt();
      return;
    }
    const now = new Date();
    this.print([
      `Welcome to Ubuntu 24.04.3 LTS (GNU/Linux 6.8.0-79-generic x86_64)`,
      "",
      " * Documentation:  https://help.ubuntu.com",
      " * Management:     https://landscape.canonical.com",
      "",
      ` System information as of ${now.toUTCString()}`,
      "",
      `  System load:  0.${(this.host.name.length % 7) + 1}2               Processes:             ${180 + this.host.name.length * 3}`,
      `  Usage of /:   48.1% of 117.6GB   Users logged in:       1`,
      `  Memory usage: 41%                IPv4 address for eth0: ${this.host.ip}`,
      "  Swap usage:   0%",
      "",
      `${DIM}This is the Termix demo. Type ${RESET}help${DIM} to see what works.${RESET}`,
      "",
      `Last login: ${new Date(Date.now() - 3.6e6).toUTCString()} from 10.0.0.24`,
    ]);
    this.prompt();
  }

  private prompt(): void {
    const path =
      this.cwd === this.home
        ? "~"
        : this.cwd.startsWith(`${this.home}/`)
          ? `~${this.cwd.slice(this.home.length)}`
          : this.cwd;
    const sigil = this.host.username === "root" ? "#" : "$";
    this.out(
      `${GREEN}${this.host.username}@${this.host.name}${RESET}:${BLUE}${path}${RESET}${sigil} `,
    );
  }

  private print(lines: string[]): void {
    this.out(lines.join("\r\n") + "\r\n");
  }

  private redrawLine(): void {
    this.out("\r\x1b[K");
    this.prompt();
    this.out(this.line);
    const back = this.line.length - this.cursor;
    if (back > 0) this.out(`\x1b[${back}D`);
  }

  input(data: string): void {
    if (data.startsWith("\x1b[200~")) {
      data = data.replace("\x1b[200~", "").replace("\x1b[201~", "");
    }
    switch (data) {
      case "\r":
      case "\n":
        this.out("\r\n");
        this.run(this.line);
        this.line = "";
        this.cursor = 0;
        return;
      case "\x7f":
      case "\b":
        if (this.cursor > 0) {
          this.line =
            this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor);
          this.cursor -= 1;
          this.redrawLine();
        }
        return;
      case "\x03":
        this.out("^C\r\n");
        this.line = "";
        this.cursor = 0;
        this.prompt();
        return;
      case "\x0c":
        this.out("\x1b[2J\x1b[H");
        this.redrawLine();
        return;
      case "\x1b[A":
        if (this.historyIndex > 0) {
          this.historyIndex -= 1;
          this.line = this.history[this.historyIndex];
          this.cursor = this.line.length;
          this.redrawLine();
        }
        return;
      case "\x1b[B":
        if (this.historyIndex < this.history.length - 1) {
          this.historyIndex += 1;
          this.line = this.history[this.historyIndex];
        } else {
          this.historyIndex = this.history.length;
          this.line = "";
        }
        this.cursor = this.line.length;
        this.redrawLine();
        return;
      case "\x1b[D":
        if (this.cursor > 0) {
          this.cursor -= 1;
          this.out("\x1b[D");
        }
        return;
      case "\x1b[C":
        if (this.cursor < this.line.length) {
          this.cursor += 1;
          this.out("\x1b[C");
        }
        return;
      case "\t":
        this.complete();
        return;
    }
    if (data.includes("\r") || data.includes("\n")) {
      for (const part of data.split(/(\r\n|\r|\n)/)) {
        if (/^(\r\n|\r|\n)$/.test(part)) this.input("\r");
        else if (part) this.input(part);
      }
      return;
    }
    if (data.startsWith("\x1b")) return;
    const printable = data.replace(/[\x00-\x1f]/g, "");
    if (!printable) return;
    this.line =
      this.line.slice(0, this.cursor) +
      printable +
      this.line.slice(this.cursor);
    this.cursor += printable.length;
    if (this.cursor === this.line.length) this.out(printable);
    else this.redrawLine();
  }

  private complete(): void {
    const parts = this.line.split(" ");
    const word = parts[parts.length - 1];
    const dirPart = word.includes("/")
      ? word.slice(0, word.lastIndexOf("/") + 1)
      : "";
    const prefix = word.slice(dirPart.length);
    const dir = normalize(this.cwd, dirPart || ".");
    const matches = (fs.list(dir) ?? []).filter((e) =>
      e.name.startsWith(prefix),
    );
    if (matches.length !== 1) return;
    const match = matches[0];
    const rest =
      match.name.slice(prefix.length) +
      (match.type === "directory" ? "/" : " ");
    this.line += rest;
    this.cursor = this.line.length;
    this.out(rest);
  }

  private run(raw: string): void {
    const input = raw.trim();
    if (input) {
      this.history.push(input);
      this.historyIndex = this.history.length;
    }
    const [cmdRaw, ...args] = input.split(/\s+/);
    const cmd = cmdRaw === "sudo" ? (args.shift() ?? "") : cmdRaw;
    const arg = args.filter((a) => !a.startsWith("-")).join(" ");
    const out: string[] = [];
    const h = this.host;

    switch (cmd) {
      case "":
        break;
      case "help":
        out.push(
          "Commands that work in this demo:",
          "  ls [-la] [path]   cd <path>   pwd   cat <file>   tail <file>",
          "  mkdir <dir>   touch <file>   rm <path>   echo <text>",
          "  whoami   hostname   uname -a   uptime   df -h   free -h",
          "  ps aux   top   systemctl status <unit>   docker ps   history   clear",
          "",
          "Files you change here also change in the File Manager.",
        );
        break;
      case "ls": {
        const target = normalize(this.cwd, arg);
        const entries = fs.list(target);
        if (!entries) {
          const entry = fs.stat(target);
          if (entry) {
            out.push(entry.name);
            break;
          }
          out.push(`ls: cannot access '${arg}': No such file or directory`);
          break;
        }
        const showAll = args.some((a) => a.startsWith("-") && a.includes("a"));
        const long = args.some((a) => a.startsWith("-") && a.includes("l"));
        const visible = entries.filter(
          (e) => showAll || !e.name.startsWith("."),
        );
        const color = (e: (typeof entries)[number]) =>
          e.type === "directory"
            ? `${BLUE}${e.name}${RESET}`
            : e.type === "link"
              ? `${CYAN}${e.name}${RESET}${long ? ` -> ${e.target}` : ""}`
              : e.mode.includes("x")
                ? `${GREEN}${e.name}${RESET}`
                : e.name;
        if (long) {
          out.push(`total ${visible.length * 4}`);
          for (const e of visible) {
            out.push(
              `${e.mode} 1 ${pad(e.owner, 8)} ${pad(e.group, 8)} ${String(e.size).padStart(10)} ${lsTime(e.modified)} ${color(e)}`,
            );
          }
        } else if (visible.length) {
          out.push(visible.map(color).join("  "));
        }
        break;
      }
      case "ll":
        this.run(`ls -la ${arg}`);
        return;
      case "cd": {
        const target = arg
          ? normalize(this.cwd, arg.replace(/^~/, this.home))
          : this.home;
        if (!fs.isDir(target)) {
          out.push(`-bash: cd: ${arg}: No such file or directory`);
          break;
        }
        this.cwd = target;
        break;
      }
      case "pwd":
        out.push(this.cwd);
        break;
      case "cat":
      case "less":
      case "more":
      case "head":
      case "tail": {
        if (!arg) {
          out.push(`${cmd}: missing file operand`);
          break;
        }
        const target = normalize(this.cwd, arg.replace(/^~/, this.home));
        if (fs.isDir(target)) {
          out.push(`${cmd}: ${arg}: Is a directory`);
          break;
        }
        const body = fs.read(target);
        if (body === undefined) {
          out.push(`${cmd}: ${arg}: No such file or directory`);
          break;
        }
        let lines = body.replace(/\n$/, "").split("\n");
        if (cmd === "head") lines = lines.slice(0, 10);
        if (cmd === "tail") lines = lines.slice(-10);
        out.push(...(body ? lines : [`${DIM}(binary or empty file)${RESET}`]));
        break;
      }
      case "mkdir":
        if (arg) fs.mkdir(normalize(this.cwd, arg), h.username);
        break;
      case "touch":
        if (arg && !fs.stat(normalize(this.cwd, arg))) {
          fs.write(normalize(this.cwd, arg), "", h.username);
        }
        break;
      case "rm":
        if (arg) {
          const target = normalize(this.cwd, arg);
          if (!fs.stat(target))
            out.push(`rm: cannot remove '${arg}': No such file or directory`);
          else if (fs.isDir(target) && !args.some((a) => a.includes("r"))) {
            out.push(`rm: cannot remove '${arg}': Is a directory`);
          } else fs.remove(target);
        }
        break;
      case "echo":
        out.push(args.join(" ").replace(/^["']|["']$/g, ""));
        break;
      case "whoami":
        out.push(cmdRaw === "sudo" ? "root" : h.username);
        break;
      case "id":
        out.push(
          `uid=1000(${h.username}) gid=1000(${h.username}) groups=1000(${h.username}),27(sudo),998(docker)`,
        );
        break;
      case "hostname":
        out.push(h.name);
        break;
      case "uname":
        out.push(
          args.includes("-a")
            ? `Linux ${h.name} 6.8.0-79-generic #79-Ubuntu SMP PREEMPT_DYNAMIC x86_64 x86_64 x86_64 GNU/Linux`
            : "Linux",
        );
        break;
      case "uptime":
        out.push(
          ` ${new Date().toTimeString().slice(0, 8)} up 23 days,  4:12,  1 user,  load average: 0.42, 0.37, 0.31`,
        );
        break;
      case "df":
        out.push(
          "Filesystem      Size  Used Avail Use% Mounted on",
          "/dev/sda1       118G   57G   61G  48% /",
          "tmpfs           3.9G     0  3.9G   0% /dev/shm",
          "/dev/sda15      105M  6.1M   99M   6% /boot/efi",
        );
        break;
      case "free":
        out.push(
          "               total        used        free      shared  buff/cache   available",
          "Mem:           7.7Gi       3.2Gi       1.4Gi        24Mi       3.1Gi       4.2Gi",
          "Swap:          2.0Gi          0B       2.0Gi",
        );
        break;
      case "ps":
        out.push(
          "USER         PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND",
          "root           1  0.0  0.1 167632 12844 ?        Ss   Sep15   0:41 /sbin/init",
          "root         611  0.0  0.1  12188  7900 ?        Ss   Sep15   0:00 sshd: /usr/sbin/sshd -D",
          "root         882  0.6  1.4 2201544 112340 ?      Ssl  Sep15  98:12 /usr/bin/dockerd",
          "www-data    1423  1.2  0.6  56132 47100 ?        S    Sep15  22:41 nginx: worker process",
          `${pad(h.username, 12)}2210  0.0  0.0   8812  5404 pts/0    Ss   ${new Date().toTimeString().slice(0, 5)}   0:00 -bash`,
        );
        break;
      case "top":
      case "htop":
        out.push(
          `top - ${new Date().toTimeString().slice(0, 8)} up 23 days,  4:12,  1 user,  load average: 0.42, 0.37, 0.31`,
          "Tasks: 187 total,   1 running, 186 sleeping,   0 stopped,   0 zombie",
          "%Cpu(s):  6.1 us,  1.4 sy,  0.0 ni, 92.2 id,  0.2 wa,  0.0 hi,  0.1 si",
          "MiB Mem :   7884.2 total,   1421.6 free,   3277.9 used,   3184.7 buff/cache",
          "",
          "    PID USER      PR  NI    VIRT    RES    SHR S  %CPU  %MEM     TIME+ COMMAND",
          "    882 root      20   0 2201544 112340  48112 S   4.3   1.4  98:12.40 dockerd",
          "   1423 www-data  20   0   56132  47100   9220 S   2.0   0.6  22:41.07 nginx",
          "   2210 deploy    20   0  821340 140220  41004 S   1.7   1.7  14:02.88 node",
          `${DIM}(a snapshot; the Host Metrics tab has the live view)${RESET}`,
        );
        break;
      case "systemctl":
        out.push(
          `${GREEN}●${RESET} ${arg || "nginx"}.service - A high performance web server and a reverse proxy server`,
          `     Loaded: loaded (/usr/lib/systemd/system/${arg || "nginx"}.service; enabled; preset: enabled)`,
          `     Active: ${GREEN}active (running)${RESET} since Mon 2026-09-15 06:02:11 UTC; 3 weeks 2 days ago`,
          "   Main PID: 1420 (nginx)",
          "      Tasks: 5 (limit: 9374)",
          "     Memory: 9.8M (peak: 14.2M)",
        );
        break;
      case "docker":
        if (args[0] === "ps") {
          out.push(
            "CONTAINER ID   IMAGE                       STATUS         PORTS                    NAMES",
            "3f2c9a1b7e04   ghcr.io/example/app:2.4.1   Up 3 days      0.0.0.0:3000->3000/tcp   app",
            "a91d0c55e2f1   redis:7-alpine              Up 3 days      6379/tcp                 redis",
            "77be12f0c3aa   grafana/grafana:11.2.0      Up 9 days      0.0.0.0:3001->3000/tcp   grafana",
          );
        } else
          out.push(
            "Usage:  docker [OPTIONS] COMMAND   (try `docker ps`, or open the Docker tab)",
          );
        break;
      case "history":
        out.push(
          ...this.history.map((c, i) => `${String(i + 1).padStart(5)}  ${c}`),
        );
        break;
      case "clear":
        this.out("\x1b[2J\x1b[H");
        break;
      case "exit":
      case "logout":
        out.push(
          `${DIM}This is a demo session. Close the tab to end it.${RESET}`,
        );
        break;
      case "vim":
      case "vi":
      case "nano":
        out.push(
          `${DIM}Editors need a real terminal. Right-click the file in the File Manager and pick Edit instead.${RESET}`,
        );
        break;
      default:
        out.push(
          `${cmd}: command not found ${DIM}(this is a demo; type help)${RESET}`,
        );
    }
    if (out.length) this.print(out);
    this.prompt();
  }
}
