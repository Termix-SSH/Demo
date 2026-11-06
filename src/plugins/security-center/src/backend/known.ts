import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { publicKeyFromPrivate } from "@termix-ssh/plugin-sdk/ssh-keys";
import type { Reading } from "../shared/types.js";
import { parsePublicKey } from "./parsers.js";

const TTL_MS = 5 * 60_000;

export interface Known {
  /** False when the credential list could not be read. */
  checked: boolean;
  byFingerprint: Map<string, string>;
}

/**
 * The keys Termix itself knows for a host: the acting user's saved key
 * credentials and the key the host logs in with. Both calls are audited, so
 * the answer is kept for a few minutes.
 */
export class KnownKeys {
  private readonly cache = new Map<string, { at: number; known: Known }>();

  constructor(private readonly ctx: PluginContext) {}

  forget(hostId: number): void {
    for (const key of this.cache.keys()) {
      if (key.endsWith(`:${hostId}`)) this.cache.delete(key);
    }
  }

  async get(hostId: number): Promise<Known> {
    const actor = String(this.ctx.currentActor() ?? "");
    const key = `${actor}:${hostId}`;
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.known;
    const known: Known = { checked: false, byFingerprint: new Map() };
    try {
      const creds = await this.ctx.credentials.listSshKeys();
      known.checked = true;
      for (const c of creds) {
        const parsed = c.publicKey ? parsePublicKey(c.publicKey) : null;
        if (parsed) known.byFingerprint.set(parsed.fingerprint, c.name);
      }
    } catch (error) {
      this.ctx.log.debug(
        `Could not list saved keys: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const login = await this.loginFingerprint(hostId);
    if (login) known.byFingerprint.set(login, "Termix login key");
    this.cache.set(key, { at: Date.now(), known });
    return known;
  }

  /** Fingerprint of the key Termix uses to log in to the host, if any. */
  async loginFingerprint(hostId: number): Promise<string | null> {
    try {
      const host = await this.ctx.ssh.resolveHost(hostId);
      const priv = typeof host?.key === "string" ? host.key : "";
      if (!priv.trim()) return null;
      const pass =
        typeof host?.keyPassword === "string" && host.keyPassword
          ? host.keyPassword
          : undefined;
      const line = publicKeyFromPrivate(priv, pass);
      return line ? (parsePublicKey(line)?.fingerprint ?? null) : null;
    } catch {
      return null;
    }
  }
}

/** Marks which keys in a reading Termix knows about. */
export function applyKnown(reading: Reading, known: Known): void {
  for (const key of reading.keys) {
    const name = known.byFingerprint.get(key.fingerprint);
    // Without a credential list every key counts as known, so nothing is flagged by mistake.
    key.known = !known.checked || Boolean(name);
    key.knownAs = name ?? "";
  }
}
