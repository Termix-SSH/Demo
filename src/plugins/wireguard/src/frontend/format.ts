/** 1536 -> 1.5 KB */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[i]}`;
}

/** Seconds since a unix time, as 5s, 3m, 2h or 4d. */
export function formatAgo(unix: number, now = Date.now()): string {
  const s = Math.max(0, Math.floor(now / 1000 - unix));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** A handshake in the last 3 minutes means the client is connected. */
export function isConnected(unix: number, now = Date.now()): boolean {
  return unix > 0 && now / 1000 - unix < 180;
}
