// Address checks without node:net, which a plugin process may not load.

const V4_PART = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const V4 = new RegExp(`^${V4_PART}(\\.${V4_PART}){3}$`);

export function isIPv4(value: string): boolean {
  return typeof value === "string" && V4.test(value);
}

export function isIPv6(value: string): boolean {
  if (typeof value !== "string" || !value.includes(":")) return false;
  if (!/^[0-9a-fA-F:.]+$/.test(value)) return false;
  try {
    return new URL(`http://[${value}]/`).hostname.length > 2;
  } catch {
    return false;
  }
}

/** 4, 6 or 0, like node:net isIP. */
export function isIP(value: string): 0 | 4 | 6 {
  if (isIPv4(value)) return 4;
  if (isIPv6(value)) return 6;
  return 0;
}
