/** Bits per second as a short string. */
export function formatRate(bps: number | undefined): string {
  if (bps === undefined) return "-";
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(1)} Gb/s`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(1)} Mb/s`;
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(0)} Kb/s`;
  return `${bps} b/s`;
}

export function formatSpeed(mbps: number | undefined): string {
  if (!mbps) return "-";
  return mbps >= 1000 ? `${mbps / 1000} Gb` : `${mbps} Mb`;
}

export function formatUptime(seconds: number | undefined): string {
  if (seconds === undefined) return "-";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
