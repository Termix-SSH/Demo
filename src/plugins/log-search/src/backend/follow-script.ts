import { shellQuote as q } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Level, LevelFilter, Source } from "../shared/types.js";
import { cleanLine, lineTime } from "./parse.js";
import { guessLevel, priorityLevel } from "./query.js";

/** Most log files and containers followed on one host. */
export const FOLLOW_FILES = 50;
export const FOLLOW_CONTAINERS = 30;

/**
 * Follows every picked source on one host until stdin closes. Each line
 * comes back as "<tag>\t<line>": J for the journal (JSON), F for files
 * (tail -F, with its "==> path <==" headers) and C<name> for a container.
 * Closing the channel ends cat, and the trap stops everything it started.
 */
export function followScript(
  sources: Source[],
  roots: string[],
  level: LevelFilter,
): string {
  const parts: string[] = [
    `trap 'trap - EXIT; kill 0 2>/dev/null' EXIT`,
    `emit() { while IFS= read -r L; do printf '%s\\t%s\\n' "$1" "$L"; done; }`,
  ];
  if (sources.includes("journal")) {
    const priority =
      level === "error" ? " -p 3" : level === "warn" ? " -p 4" : "";
    parts.push(
      `if command -v journalctl >/dev/null 2>&1; then
  journalctl -f -n 0 -q -o json --no-pager${priority} 2>/dev/null | emit J &
else echo "@@NOSOURCE journal"; fi`,
    );
  }
  if (sources.includes("files") && roots.length) {
    parts.push(
      `RR=()
for D in ${roots.map(q).join(" ")}; do
  RD=$(readlink -f -- "$D" 2>/dev/null) || continue
  [ -d "$RD" ] && RR+=("$RD")
done
if [ \${#RR[@]} -gt 0 ]; then
  mapfile -t FA < <(for D in "\${RR[@]}"; do find "$D" -maxdepth 4 -type f -mmin -1440 ! -size 0 ! -name '*.gz' ! -name '*.xz' ! -name '*.zst' ! -name '*.bz2' -readable 2>/dev/null; done | head -n ${FOLLOW_FILES})
  [ \${#FA[@]} -gt 0 ] && tail -n 0 -F -- "\${FA[@]}" 2>/dev/null | emit F &
fi`,
    );
  }
  if (sources.includes("docker")) {
    parts.push(
      `RT=""
for C in docker podman; do command -v $C >/dev/null 2>&1 && { RT=$C; break; }; done
if [ -n "$RT" ]; then
  while read -r ID NAME; do
    [ -n "$ID" ] || continue
    $RT logs -f --tail 0 --timestamps "$ID" 2>&1 </dev/null | emit "C$NAME" &
  done < <($RT ps --format '{{.ID}} {{.Names}}' 2>/dev/null | head -n ${FOLLOW_CONTAINERS})
else echo "@@NOSOURCE docker"; fi`,
    );
  }
  parts.push(`echo "@@READY"`, `cat >/dev/null`);
  return `${parts.join("\n")}\n`;
}

export interface FollowLine {
  time: number;
  source: Source;
  origin: string;
  level: Level;
  message: string;
}

/** Decodes the journal's MESSAGE, which can be a list of bytes. */
function journalMessage(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    return Buffer.from(value.filter((n) => typeof n === "number")).toString(
      "utf8",
    );
  }
  return "";
}

/**
 * Reads the tagged lines of one host's follow script. Keeps the file name
 * tail -F last announced, so each file line knows where it came from.
 */
export function createLineReader(now: () => number = Date.now) {
  let file = "";
  return (raw: string): FollowLine | null => {
    const tab = raw.indexOf("\t");
    if (tab < 1) return null;
    const tag = raw.slice(0, tab);
    const line = raw.slice(tab + 1);
    if (tag === "J") {
      let entry: Record<string, unknown>;
      try {
        entry = JSON.parse(line) as Record<string, unknown>;
      } catch {
        return null;
      }
      const message = cleanLine(journalMessage(entry.MESSAGE));
      if (!message) return null;
      const micros = Number(entry.__REALTIME_TIMESTAMP);
      return {
        time: Number.isFinite(micros) ? Math.floor(micros / 1000) : now(),
        source: "journal",
        origin: String(
          entry._SYSTEMD_UNIT ?? entry.SYSLOG_IDENTIFIER ?? entry._COMM ?? "",
        ),
        level: priorityLevel(Number(entry.PRIORITY ?? 6)),
        message,
      };
    }
    if (tag === "F") {
      const header = /^==> (.+) <==$/.exec(line);
      if (header) {
        file = header[1];
        return null;
      }
      if (!file || !line.trim() || line.includes("\0")) return null;
      const message = cleanLine(line);
      return {
        time: lineTime(message, 0, now()) || now(),
        source: "files",
        origin: file,
        level: guessLevel(message),
        message,
      };
    }
    if (tag.startsWith("C")) {
      const space = line.indexOf(" ");
      const stamp = space > 0 ? Date.parse(line.slice(0, space)) : NaN;
      const message = cleanLine(
        Number.isFinite(stamp) ? line.slice(space + 1) : line,
      );
      if (!message.trim()) return null;
      return {
        time: Number.isFinite(stamp) ? stamp : now(),
        source: "docker",
        origin: tag.slice(1),
        level: guessLevel(message),
        message,
      };
    }
    return null;
  };
}
