import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "sha256:";

/** A new bearer token. Only its hash is kept. */
export function newToken(): string {
  return `scim_${randomBytes(32).toString("base64url")}`;
}

export function hashToken(token: string): string {
  return PREFIX + createHash("sha256").update(token, "utf8").digest("hex");
}

export function tokenMatches(token: string, stored: string): boolean {
  const given = Buffer.from(hashToken(token));
  const want = Buffer.from(stored);
  return given.length === want.length && timingSafeEqual(given, want);
}

/** The token from "Authorization: Bearer <token>", or null. */
export function bearerToken(header: unknown): string | null {
  if (typeof header !== "string") return null;
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

const FAILURE_WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 20;
const MAX_TRACKED = 5000;

/** Counts bad tokens per address and connection, so guessing is slow. */
export function createFailureLimiter(now: () => number = Date.now) {
  const failures = new Map<string, { count: number; resetAt: number }>();
  return {
    locked(key: string): boolean {
      const entry = failures.get(key);
      if (!entry) return false;
      if (entry.resetAt <= now()) {
        failures.delete(key);
        return false;
      }
      return entry.count >= MAX_FAILURES;
    },
    fail(key: string): void {
      if (failures.size > MAX_TRACKED) {
        for (const [old, entry] of failures) {
          if (entry.resetAt <= now()) failures.delete(old);
        }
      }
      const entry = failures.get(key);
      if (!entry || entry.resetAt <= now()) {
        failures.set(key, { count: 1, resetAt: now() + FAILURE_WINDOW_MS });
      } else {
        entry.count++;
      }
    },
    clear(key: string): void {
      failures.delete(key);
    },
  };
}
