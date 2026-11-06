import {
  MAX_JOURNAL_LINES,
  journalScript,
  shellQuote as q,
  type JournalQuery,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { SearchRequest } from "../shared/types.js";

/** Most files read per host, and most lines kept per file or container. */
export const MAX_FILES = 200;
export const PER_FILE_LINES = 1000;
export const MAX_CONTAINERS = 60;

/** Plain text the host side filter can handle. Regex runs on our side. */
const simpleGrep = (req: SearchRequest): string =>
  req.query && !req.regex ? req.query : "";

const SAFE_GREP = /^[A-Za-z0-9 _:@/-]+$/;

export function minutesBack(req: SearchRequest, now = Date.now()): number {
  return Math.max(1, Math.ceil((now - req.from) / 60_000));
}

export function journalQueryFor(
  req: SearchRequest,
  now = Date.now(),
): JournalQuery {
  const query: JournalQuery = {
    units: [],
    lines: MAX_JOURNAL_LINES,
    kernel: false,
    since: `-${Math.min(99999, minutesBack(req, now))}min`,
  };
  const untilMin = Math.floor((now - req.to) / 60_000);
  if (untilMin >= 1) query.until = `-${Math.min(99999, untilMin)}min`;
  // journalctl -g is a regex, so only text that means the same either way.
  if (req.query && !req.regex && SAFE_GREP.test(req.query)) {
    query.grep = req.query;
  }
  if (req.level === "error") query.priority = 3;
  if (req.level === "warn") query.priority = 4;
  return query;
}

export function journalSearchScript(
  req: SearchRequest,
  now = Date.now(),
): string {
  return journalScript(journalQueryFor(req, now));
}

function grepStage(req: SearchRequest): string {
  const term = simpleGrep(req);
  if (!term) return "";
  const flag = req.caseSensitive ? "-a -F" : "-a -i -F";
  return ` | grep ${flag} -e ${q(term)}`;
}

/** Reads recent lines from log files under the allowed folders. */
export function filesScript(
  req: SearchRequest,
  roots: string[],
  now = Date.now(),
): string {
  const origin = req.origin
    ? `printf '%s' "$R" | grep -q -i -F -e ${q(req.origin)} || continue`
    : "";
  return `
echo "@@TZ $(date +%z)"
RR=()
for D in ${roots.map(q).join(" ")}; do
  RD=$(readlink -f -- "$D" 2>/dev/null) || continue
  [ -d "$RD" ] && RR+=("$RD")
done
[ \${#RR[@]} -gt 0 ] || exit 0
for D in "\${RR[@]}"; do
  find "$D" -maxdepth 4 -type f -mmin -${minutesBack(req, now)} ! -size 0 2>/dev/null
done | head -n ${MAX_FILES} | while IFS= read -r F; do
  R=$(readlink -f -- "$F" 2>/dev/null) || continue
  OK=0
  for D in "\${RR[@]}"; do case "$R" in "$D"/*) OK=1 ;; esac; done
  [ "$OK" = 1 ] && [ -r "$R" ] || continue
  ${origin}
  case "$R" in
    *.gz) C="gzip -dc" ;;
    *.xz) C="xz -dc" ;;
    *.zst) C="zstd -dc" ;;
    *.bz2) C="bzip2 -dc" ;;
    *) C="cat" ;;
  esac
  if [ "$C" = cat ] && [ "$(head -c 4096 -- "$R" </dev/null | tr -d -c '\\000' | wc -c)" -gt 0 ]; then continue; fi
  echo "@@FILE $(stat -c %Y -- "$R" 2>/dev/null || echo 0) $R"
  $C -- "$R" </dev/null 2>/dev/null${grepStage(req)} | tail -n ${PER_FILE_LINES}
done
exit 0
`;
}

/** Reads recent logs from running Docker or Podman containers. */
export function dockerScript(req: SearchRequest, now = Date.now()): string {
  const origin = req.origin
    ? `printf '%s' "$NAME" | grep -q -i -F -e ${q(req.origin)} || continue`
    : "";
  return `
RT=""
for C in docker podman; do
  command -v $C >/dev/null 2>&1 && { RT=$C; break; }
done
[ -n "$RT" ] || { echo "@@NODOCKER"; exit 0; }
LIST=$($RT ps --format '{{.ID}} {{.Names}}' 2>&1 </dev/null) || { echo "@@ERR $(printf '%s' "$LIST" | head -n 1)"; exit 0; }
printf '%s\\n' "$LIST" | head -n ${MAX_CONTAINERS} | while read -r ID NAME; do
  [ -n "$ID" ] || continue
  ${origin}
  echo "@@C $NAME"
  $RT logs --timestamps --since ${minutesBack(req, now)}m --tail 5000 "$ID" 2>&1 </dev/null${grepStage(req)} | tail -n ${PER_FILE_LINES}
done
exit 0
`;
}
