/**
 * Short relative time, e.g. "4m", "3h", "2d".
 *
 * Lifted out of the dashboard's recent-activity card so the command palette
 * shows the same thing rather than a raw ISO string.
 */
export function timeAgo(
  timestamp: string,
  justNow: string,
  now: number = Date.now(),
): string {
  const ms = now - new Date(timestamp).getTime();
  if (!Number.isFinite(ms) || ms < 60_000) return justNow;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86_400)}d`;
}
