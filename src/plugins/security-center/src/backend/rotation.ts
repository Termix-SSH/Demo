import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  generateSshKeyPair,
  publicKeyFromPrivate,
} from "@termix-ssh/plugin-sdk/ssh-keys";
import { SecurityError } from "./errors.js";
import type { KnownKeys } from "./known.js";
import { keyBlob } from "./parsers.js";
import {
  PROBE_COMMAND,
  ROTATE_HOST_KEYS_SCRIPT,
  addKeyScript,
  removeKeyScript,
  revokeScript,
} from "./scripts.js";
import type { Remote } from "./remote.js";

export interface RotationResult {
  message: string;
  credentialId: number;
  /** False when the new key works but the old one is still on the host. */
  oldKeyRemoved: boolean;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface Rotation {
  /** Replaces the key Termix logs in with. */
  rotateLoginKey: (hostId: number) => Promise<RotationResult>;
  /** Removes one key from one authorized_keys file by fingerprint. */
  revoke: (
    hostId: number,
    useSudo: boolean,
    path: string,
    fingerprint: string,
    user: string,
  ) => Promise<string>;
  rotateHostKeys: (hostId: number, useSudo: boolean) => Promise<string>;
}

export function createRotation(
  ctx: PluginContext,
  remote: Remote,
  known: KnownKeys,
): Rotation {
  async function probe(
    target: number | Record<string, unknown>,
  ): Promise<boolean> {
    try {
      const result = await ctx.ssh.exec(target as never, PROBE_COMMAND, {
        purpose: "security-center",
        timeoutMs: 20_000,
      } as never);
      return result.code === 0 && result.stdout.includes("termix-key-ok");
    } catch {
      return false;
    }
  }

  async function undo(hostId: number, blob: string | null): Promise<void> {
    if (!blob) return;
    try {
      await remote.user(hostId, removeKeyScript(blob));
    } catch (error) {
      ctx.log.warn(`Could not take the new key back out: ${message(error)}`);
    }
  }

  return {
    async rotateLoginKey(hostId) {
      const access = await ctx.hosts.checkAccess(hostId, "manage");
      if (!access.hasAccess || !access.isOwner) {
        throw new SecurityError(
          "Only the owner of the host can rotate its login key",
          403,
        );
      }
      const host = await ctx.ssh.resolveHost(hostId);
      if (!host) throw new SecurityError("Host not found", 404);
      const oldKey = typeof host.key === "string" ? host.key : "";
      if (!oldKey.trim()) {
        throw new SecurityError("This host does not log in with a key", 400, {
          code: "no-key",
        });
      }
      const passphrase =
        typeof host.keyPassword === "string" && host.keyPassword
          ? host.keyPassword
          : undefined;
      const oldLine = publicKeyFromPrivate(oldKey, passphrase);
      const oldBlob = oldLine ? keyBlob(oldLine) : null;
      if (!oldBlob) {
        throw new SecurityError("The current login key cannot be read", 400);
      }
      const label = String(host.name || host.ip || `host ${hostId}`);
      const pair = generateSshKeyPair("ssh-ed25519", {
        comment: `termix-rotated-${stamp()}`,
      });
      const newBlob = keyBlob(pair.publicKey);
      if (!newBlob) throw new SecurityError("Could not make a new key", 500);

      // 1. Let the new key in, next to the old one.
      try {
        await remote.user(hostId, addKeyScript(pair.publicKey));
      } catch (error) {
        throw new SecurityError(
          `Could not add the new key: ${message(error)}`,
          502,
        );
      }

      // 2. It must work before anything else changes.
      const works = await probe({
        ...host,
        authType: "key",
        key: pair.privateKey,
        keyPassword: "",
        password: "",
        credentialId: null,
      });
      if (!works) {
        await undo(hostId, newBlob);
        throw new SecurityError(
          "The new key could not log in, so nothing was changed",
          502,
          { code: "verify" },
        );
      }

      // 3. Save it as a credential and point the host at it.
      let credentialId: number;
      try {
        const saved = await ctx.credentials.createSshKey({
          name: `${label} (rotated ${stamp()})`,
          description: "Made by Security Center",
          username: String(host.username || ""),
          privateKey: pair.privateKey,
          publicKey: pair.publicKey,
          keyType: pair.keyType,
        });
        credentialId = saved.id;
      } catch (error) {
        await undo(hostId, newBlob);
        throw new SecurityError(
          `Could not save the new key: ${message(error)}`,
          502,
        );
      }
      const previous = {
        authType: String(host.authType ?? "key"),
        credentialId:
          typeof host.credentialId === "number" ? host.credentialId : null,
      };
      try {
        await ctx.hosts.update(hostId, {
          authType: "credential",
          credentialId,
          ...(previous.authType === "key"
            ? { key: null, keyPassword: null, keyType: null }
            : {}),
        });
      } catch (error) {
        await undo(hostId, newBlob);
        throw new SecurityError(
          `Could not switch the host to the new key: ${message(error)}`,
          502,
        );
      }
      known.forget(hostId);

      // 4. The normal login path must work too.
      if (!(await probe(hostId))) {
        await ctx.hosts
          .update(hostId, {
            authType: previous.authType,
            credentialId: previous.credentialId,
            ...(previous.authType === "key"
              ? {
                  key: oldKey,
                  keyPassword: passphrase ?? null,
                  keyType:
                    typeof host.keyType === "string" ? host.keyType : null,
                }
              : {}),
          })
          .catch(() => undefined);
        await undo(hostId, newBlob);
        throw new SecurityError(
          "Termix could not log in with the new key, so the old one is back",
          502,
          { code: "verify" },
        );
      }

      // 5. Take the old key out.
      let oldKeyRemoved = true;
      try {
        await remote.user(hostId, removeKeyScript(oldBlob));
      } catch (error) {
        oldKeyRemoved = false;
        ctx.log.warn(`Could not remove the old key: ${message(error)}`);
      }
      return {
        message: oldKeyRemoved
          ? `Rotated the login key for ${label}`
          : `The new key works for ${label}, but the old key is still on the host`,
        credentialId,
        oldKeyRemoved,
      };
    },

    async revoke(hostId, useSudo, path, fingerprint, user) {
      const login = await known.loginFingerprint(hostId);
      const host = await ctx.ssh.resolveHost(hostId);
      if (login && login === fingerprint && host?.username === user) {
        throw new SecurityError(
          "That is the key Termix logs in with. Rotate it instead.",
          409,
          { code: "login-key" },
        );
      }
      const out = await remote.root(
        hostId,
        useSudo,
        revokeScript(path, fingerprint),
        { timeoutMs: 60_000 },
      );
      const removed = Number(/removed (\d+)/.exec(out)?.[1] ?? 0);
      if (!removed)
        throw new SecurityError("The key was not in that file", 404);
      return `Removed ${removed === 1 ? "the key" : `${removed} lines`} from ${path}`;
    },

    async rotateHostKeys(hostId, useSudo) {
      const out = await remote.root(hostId, useSudo, ROTATE_HOST_KEYS_SCRIPT, {
        timeoutMs: 120_000,
      });
      const dir = /done (\S+)/.exec(out)?.[1] ?? "";
      return dir
        ? `Made new host keys. The old ones are in ${dir}`
        : "Made new host keys";
    },
  };
}
