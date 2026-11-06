import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Health } from "../shared/types.js";
import { openVulns, overall, scoreOf } from "./conditions.js";
import type { Engine, HostState } from "./engine.js";
import { SecurityError } from "./errors.js";
import { readHostSettings } from "./host-settings.js";
import type { Rotation } from "./rotation.js";
import type { HostRow, Store } from "./store.js";

/** A reading younger than this is reused instead of reading the host again. */
const FRESH_MS = 60_000;

export interface Service {
  row: (hostId: number) => Promise<HostRow>;
  fresh: (
    hostId: number,
    force?: boolean,
  ) => Promise<{ row: HostRow; state: HostState }>;
  /** Scans packages now. */
  scanNow: (hostId: number) => Promise<HostState>;
  ignore: (hostId: number, advisory: string, note: string) => Promise<void>;
  unignore: (hostId: number, advisory: string) => Promise<void>;
  rotateLoginKey: (hostId: number) => Promise<string>;
  revoke: (
    hostId: number,
    path: string,
    fingerprint: string,
  ) => Promise<string>;
  rotateHostKeys: (hostId: number) => Promise<string>;
  /** Short answer for other plugins, from the latest data. */
  check: (hostId: number) => Promise<{
    status: Health;
    score: number | null;
    findings: number;
    criticalVulns: number;
    knownExploited: number;
    readAt: number | null;
  }>;
}

export function createService(
  ctx: PluginContext,
  store: Store,
  engine: Engine,
  rotation: Rotation,
): Service {
  const service: Service = {
    async row(hostId) {
      const known = await store.get(hostId);
      if (known) return known;
      return store.ensure(hostId, String(ctx.currentActor() ?? ""));
    },
    async fresh(hostId, force = false) {
      const row = await service.row(hostId);
      const known = engine.state(hostId);
      if (!force && known?.readAt && Date.now() - known.readAt < FRESH_MS) {
        return { row, state: known };
      }
      const settings = await readHostSettings(ctx, hostId);
      const state = await engine.refresh(row, settings.useSudo);
      return { row, state };
    },
    async scanNow(hostId) {
      const row = await service.row(hostId);
      const settings = await readHostSettings(ctx, hostId);
      return engine.scan(row, settings.useSudo);
    },
    async ignore(hostId, advisory, note) {
      await store.addIgnore(hostId, advisory, note);
      for (const v of engine.state(hostId)?.scan?.vulns ?? []) {
        if (v.id === advisory) {
          v.ignored = true;
          v.ignoreNote = note;
        }
      }
      await store.addEvent(hostId, "ignore", `Ignored ${advisory}`);
    },
    async unignore(hostId, advisory) {
      await store.removeIgnore(hostId, advisory);
      for (const v of engine.state(hostId)?.scan?.vulns ?? []) {
        if (v.id === advisory) {
          v.ignored = false;
          v.ignoreNote = "";
        }
      }
    },
    async rotateLoginKey(hostId) {
      try {
        const result = await rotation.rotateLoginKey(hostId);
        await engine.note(hostId, "rotated", result.message);
        const row = await service.row(hostId);
        await engine.emit(row, "security-center.rotated", {
          hostId,
          credentialId: result.credentialId,
        });
        await service.fresh(hostId, true).catch(() => undefined);
        return result.message;
      } catch (error) {
        await engine.note(
          hostId,
          "rotate-failed",
          error instanceof Error ? error.message : "Rotation failed",
        );
        throw error;
      }
    },
    async revoke(hostId, path, fingerprint) {
      const { state } = await service.fresh(hostId);
      const key = state.reading?.keys.find(
        (k) =>
          k.kind === "authorized" &&
          k.path === path &&
          k.fingerprint === fingerprint,
      );
      if (!key) throw new SecurityError("That key was not found", 404);
      const settings = await readHostSettings(ctx, hostId);
      const text = await rotation.revoke(
        hostId,
        settings.useSudo,
        path,
        fingerprint,
        key.user,
      );
      await engine.note(hostId, "revoked", text);
      await service.fresh(hostId, true).catch(() => undefined);
      return text;
    },
    async rotateHostKeys(hostId) {
      const settings = await readHostSettings(ctx, hostId);
      const text = await rotation.rotateHostKeys(hostId, settings.useSudo);
      await engine.note(hostId, "host-keys", text);
      await service.fresh(hostId, true).catch(() => undefined);
      return text;
    },
    async check(hostId) {
      const state = engine.state(hostId);
      const vulns = state?.scan?.vulns ?? [];
      const open = openVulns(vulns);
      const findings = state?.findings ?? [];
      return {
        status: overall(state?.reading ?? null, findings, vulns),
        score: state?.reading ? scoreOf(findings, vulns) : null,
        findings: findings.length,
        criticalVulns: open.filter((v) => v.severity === "critical").length,
        knownExploited: open.filter((v) => v.kev).length,
        readAt: state?.readAt ?? null,
      };
    },
  };
  return service;
}
