import type { ChannelType } from "../types.js";

/** Config fields that hold a secret. They never go back to the browser. */
const SECRET_FIELDS: Record<ChannelType, readonly string[]> = {
  webhook: ["url"],
  discord: ["url"],
  telegram: ["token"],
  ntfy: ["token"],
  email: [],
};

function present(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

function origin(value: unknown): string {
  try {
    return new URL(String(value)).origin;
  } catch {
    return "";
  }
}

export interface MaskedConfig {
  config: Record<string, unknown>;
  /** Secret fields that have a saved value. Sending them empty keeps it. */
  saved: string[];
  /** Safe hints for saved fields, like the origin of a saved URL. */
  hints: Record<string, string>;
}

/** The config the browser sees: secret fields and header values left out. */
export function maskConfig(
  type: ChannelType,
  config: Record<string, unknown>,
): MaskedConfig {
  const out: Record<string, unknown> = { ...config };
  const saved: string[] = [];
  const hints: Record<string, string> = {};
  for (const field of SECRET_FIELDS[type] ?? []) {
    if (present(config[field])) {
      saved.push(field);
      if (field === "url") hints.url = origin(config[field]);
    }
    delete out[field];
  }
  if (config.headers && typeof config.headers === "object") {
    out.headers = Object.fromEntries(
      Object.keys(config.headers as Record<string, unknown>).map((name) => [
        name,
        "",
      ]),
    );
  }
  return { config: out, saved, hints };
}

/**
 * Fills secret fields the browser sent empty, and header values sent empty,
 * from the saved config. Only when the type did not change.
 */
export function mergeConfig(
  type: ChannelType,
  incoming: Record<string, unknown>,
  savedType: ChannelType,
  saved: Record<string, unknown>,
): Record<string, unknown> {
  if (type !== savedType) return incoming;
  const out: Record<string, unknown> = { ...incoming };
  for (const field of SECRET_FIELDS[type] ?? []) {
    if (!present(out[field]) && present(saved[field]))
      out[field] = saved[field];
  }
  const savedHeaders =
    saved.headers && typeof saved.headers === "object"
      ? (saved.headers as Record<string, unknown>)
      : {};
  if (out.headers && typeof out.headers === "object") {
    const headers = { ...(out.headers as Record<string, unknown>) };
    for (const [name, value] of Object.entries(headers)) {
      if (!present(value) && present(savedHeaders[name])) {
        headers[name] = savedHeaders[name];
      }
    }
    out.headers = headers;
  }
  return out;
}
