/** Helpers for the record text formats providers share. */

/** Splits TXT text into the quoted 255 character pieces DNS stores. */
export function quoteTxt(text: string): string {
  const pieces: string[] = [];
  for (let i = 0; i < text.length || i === 0; i += 255) {
    pieces.push(text.slice(i, i + 255));
  }
  return pieces
    .map((piece) => `"${piece.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`)
    .join(" ");
}

/** Joins the quoted pieces of a TXT value back into plain text. */
export function unquoteTxt(wire: string): string {
  const trimmed = wire.trim();
  if (!trimmed.startsWith('"')) return trimmed;
  const parts: string[] = [];
  const pattern = /"((?:[^"\\]|\\.)*)"/g;
  for (const match of trimmed.matchAll(pattern)) {
    parts.push(match[1].replace(/\\(.)/g, "$1"));
  }
  return parts.length ? parts.join("") : trimmed;
}

export function stripDot(value: string): string {
  return value.endsWith(".") && value.length > 1 ? value.slice(0, -1) : value;
}

export function withDot(value: string): string {
  if (!value || value === "@" || value.endsWith(".")) return value;
  return `${value}.`;
}

const TARGET_TYPES = new Set(["CNAME", "NS", "PTR", "MX", "SRV"]);

/** Applies a change to the host name part of a target record. */
function mapTarget(
  type: string,
  content: string,
  change: (target: string) => string,
): string {
  if (!TARGET_TYPES.has(type)) return content;
  if (type === "SRV") {
    const parts = content.trim().split(/\s+/);
    if (parts.length < 3) return content;
    parts[parts.length - 1] = change(parts[parts.length - 1]);
    return parts.join(" ");
  }
  return change(content.trim());
}

export function dotTarget(type: string, content: string): string {
  return mapTarget(type, content, (target) =>
    target.includes(".") ? withDot(target) : target,
  );
}

export function undotTarget(type: string, content: string): string {
  return mapTarget(type, content, stripDot);
}

export interface WireValue {
  content: string;
  priority?: number | null;
}

/** The single text value DNS tools use: "10 mail.example.com." and so on. */
export function toWire(
  type: string,
  value: WireValue,
  options: { dot: boolean },
): string {
  if (type === "TXT") return quoteTxt(value.content);
  const content = options.dot ? dotTarget(type, value.content) : value.content;
  if ((type === "MX" || type === "SRV") && value.priority != null) {
    return `${value.priority} ${content}`;
  }
  return content;
}

export function fromWire(type: string, wire: string): WireValue {
  if (type === "TXT") return { content: unquoteTxt(wire) };
  if (type === "MX" || type === "SRV") {
    const match = wire.trim().match(/^(\d+)\s+(.*)$/);
    if (match) {
      return {
        priority: Number(match[1]),
        content: undotTarget(type, match[2]),
      };
    }
  }
  return { content: undotTarget(type, wire.trim()) };
}

/** Name relative to the zone: "www.example.com." in example.com is "www". */
export function relativeName(fqdn: string, zone: string): string {
  const name = stripDot(fqdn.toLowerCase());
  const root = stripDot(zone.toLowerCase());
  if (name === root) return "@";
  if (name.endsWith(`.${root}`)) return name.slice(0, -(root.length + 1));
  return name;
}

export function absoluteName(name: string, zone: string): string {
  const root = stripDot(zone);
  return !name || name === "@" ? root : `${name}.${root}`;
}
