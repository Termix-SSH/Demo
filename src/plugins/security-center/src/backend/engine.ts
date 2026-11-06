import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Finding, Reading, VulnScan } from "../shared/types.js";
import {
  KINDS,
  UNREACHABLE_AFTER,
  alertSeverity,
  conditionsOf,
  diff,
  findingsOf,
  loud,
  openVulns,
  type Change,
} from "./conditions.js";
import { readAdminSettings, readHostSettings } from "./host-settings.js";
import { applyKnown, type KnownKeys } from "./known.js";
import { Osv, ecosystemOf } from "./osv.js";
import { parsePackages, parseReading } from "./parsers.js";
import type { Remote } from "./remote.js";
import { KEYS_SCRIPT, PACKAGES_SCRIPT } from "./scripts.js";
import type { HostRow, Store } from "./store.js";
import type { VulnStore } from "./vuln-store.js";

export const TICK_MS = 60_000;
export const FLUSH_MS = 5 * 60_000;
const CONCURRENCY = 3;

export interface HostState {
  reading: Reading | null;
  findings: Finding[];
  error: string;
  readAt: number | null;
  attemptAt: number;
  misses: number;
  active: Set<string>;
  scan: VulnScan | null;
  scanAttemptAt: number;
  /** When to continue a scan that still has advisories to look up. */
  rescanAt: number;
  scanning: boolean;
  /** Advisory|package keys already alerted on. */
  alerted: Set<string>;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function mapLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
}

/** Advisories that raise an alert: known exploited, or critical with a fix. */
export function alertable(scan: VulnScan | null): Set<string> {
  const out = new Set<string>();
  if (!scan) return out;
  for (const v of openVulns(scan.vulns)) {
    if (v.kev || (v.severity === "critical" && v.fixed)) {
      out.add(`${v.id}|${v.package}`);
    }
  }
  return out;
}

/**
 * Reads keys and scans packages on a timer as the user who set a host up,
 * keeps the results, and raises events and alerts when something starts.
 */
export class Engine {
  private readonly states = new Map<number, HostState>();
  private readonly running = new Set<number>();
  private stops: Array<() => void> = [];
  private disposed = false;

  constructor(
    private readonly ctx: PluginContext,
    private readonly store: Store,
    private readonly remote: Remote,
    private readonly osv: Osv,
    private readonly vulnStore: VulnStore,
    private readonly known: KnownKeys,
  ) {}

  start(): void {
    this.stops.push(
      this.ctx.schedule.every(TICK_MS, () => this.tick(), { jitterMs: 5_000 }),
      this.ctx.schedule.every(FLUSH_MS, () => this.osv.flush()),
    );
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    for (const stop of this.stops) stop();
    this.stops = [];
    await this.osv.flush();
  }

  state(hostId: number): HostState | undefined {
    return this.states.get(hostId);
  }

  forget(hostId: number): void {
    this.states.delete(hostId);
    this.known.forget(hostId);
    void this.vulnStore.drop(hostId).catch(() => undefined);
    void this.ctx.kv.delete(`active:${hostId}`).catch(() => undefined);
    void this.ctx.kv.delete(`alerted:${hostId}`).catch(() => undefined);
  }

  async tick(): Promise<void> {
    if (this.disposed) return;
    let rows: HostRow[];
    try {
      rows = await this.store.all();
    } catch (error) {
      this.ctx.log.warn(`Could not load watched hosts: ${message(error)}`);
      return;
    }
    const ids = new Set(rows.map((row) => row.hostId));
    for (const id of [...this.states.keys()]) {
      if (!ids.has(id)) this.states.delete(id);
    }
    await mapLimit(rows, CONCURRENCY, (row) => this.check(row));
  }

  private async check(row: HostRow): Promise<void> {
    if (this.running.has(row.hostId)) return;
    const state = this.states.get(row.hostId);
    const now = Date.now();
    const keysDue =
      !state || now - state.attemptAt >= row.intervalMin * 60_000 - 5_000;
    const scanDue =
      !state ||
      (state.rescanAt > 0 && now >= state.rescanAt) ||
      (state.scanAttemptAt === 0
        ? !state.scan
        : now - state.scanAttemptAt >= row.vulnIntervalH * 3_600_000 - 5_000);
    if (!keysDue && !scanDue) return;
    this.running.add(row.hostId);
    try {
      await this.ctx.asUser(row.userId, async () => {
        const access = await this.ctx.hosts.checkAccess(row.hostId, "connect");
        if (!access.hasAccess) return;
        const settings = await readHostSettings(this.ctx, row.hostId);
        if (!settings.enabled) return;
        if (keysDue) await this.refresh(row, settings.useSudo);
        if (scanDue) await this.scan(row, settings.useSudo);
      });
    } catch (error) {
      this.ctx.log.debug(
        `Security check failed for ${row.hostId}: ${message(error)}`,
      );
    } finally {
      this.running.delete(row.hostId);
    }
  }

  private async load(row: HostRow): Promise<HostState> {
    const known = this.states.get(row.hostId);
    if (known) return known;
    const saved = await this.ctx.kv
      .get(`active:${row.hostId}`)
      .catch(() => null);
    const alerted = await this.ctx.kv
      .get(`alerted:${row.hostId}`)
      .catch(() => null);
    const state: HostState = {
      reading: null,
      findings: [],
      error: "",
      readAt: null,
      attemptAt: 0,
      misses: 0,
      active: new Set(
        Array.isArray(saved)
          ? (saved as string[]).filter((key) =>
              (KINDS as readonly string[]).includes(key.split("|")[0]),
            )
          : [],
      ),
      scan: await this.vulnStore.load(row.hostId),
      scanAttemptAt: 0,
      rescanAt: 0,
      scanning: false,
      alerted: new Set(Array.isArray(alerted) ? (alerted as string[]) : []),
    };
    this.states.set(row.hostId, state);
    return state;
  }

  /** Reads the keys of one host now, as whoever is acting, and records the result. */
  async refresh(row: HostRow, useSudo: boolean): Promise<HostState> {
    let reading: Reading | null = null;
    let error = "";
    try {
      reading = parseReading(
        await this.remote.read(row.hostId, useSudo, KEYS_SCRIPT),
      );
      applyKnown(reading, await this.known.get(row.hostId));
    } catch (e) {
      error = message(e);
    }
    return this.apply(row, reading, error);
  }

  private async apply(
    row: HostRow,
    reading: Reading | null,
    error: string,
  ): Promise<HostState> {
    const state = await this.load(row);
    const before = new Set(state.active);
    state.attemptAt = Date.now();
    let after: Set<string>;
    let findings = state.findings;
    if (reading) {
      state.reading = reading;
      state.error = "";
      state.misses = 0;
      state.readAt = state.attemptAt;
      findings = findingsOf(reading, row);
      state.findings = findings;
      after = new Set(conditionsOf(findings).keys());
    } else {
      state.error = error;
      state.misses += 1;
      after = new Set(before);
      if (state.misses >= UNREACHABLE_AFTER) after.add("unreachable|host");
    }
    if (reading) after.delete("unreachable|host");
    state.active = after;
    const changes = diff(before, after);
    if (changes.length) {
      await this.ctx.kv
        .set(`active:${row.hostId}`, [...after])
        .catch(() => undefined);
    }
    const label = await this.hostLabel(row.hostId);
    const byKey = conditionsOf(findings);
    for (const change of changes) {
      const key = `${change.kind}|${change.subject}`;
      const found = byKey.get(key);
      const severity =
        found?.severity ?? (change.kind === "unreachable" ? "medium" : "low");
      const title =
        found?.title ??
        (change.kind === "unreachable"
          ? `${label} cannot be read`
          : `${change.kind} cleared`);
      await this.store.addEvent(
        row.hostId,
        change.on ? change.kind : `${change.kind}-cleared`,
        title,
      );
      const noisy = change.on ? loud(severity) : severity === "critical";
      if (row.alerts && noisy) {
        await this.alert(row, change, title, found?.detail ?? "", severity);
      }
      await this.emitKey(row, change, severity, label);
    }
    return state;
  }

  /** Scans the packages of one host now and records the result. */
  async scan(row: HostRow, useSudo: boolean): Promise<HostState> {
    const state = await this.load(row);
    if (state.scanning) return state;
    state.scanning = true;
    state.scanAttemptAt = Date.now();
    try {
      const admin = await readAdminSettings(this.ctx);
      let scan: VulnScan;
      if (!admin.scanVulns) {
        scan = this.emptyScan("", "disabled");
      } else {
        const list = parsePackages(
          await this.remote.read(row.hostId, useSudo, PACKAGES_SCRIPT, {
            timeoutMs: 120_000,
            maxOutputBytes: 4 * 1024 * 1024,
          }),
        );
        const ecosystem = ecosystemOf(list.os);
        if (!ecosystem) {
          scan = this.emptyScan(
            list.os.name || list.os.id || "unknown",
            "",
            list.packages.length,
          );
          scan.unsupported = list.os.name || list.os.id || "unknown";
        } else if (!list.packages.length) {
          scan = this.emptyScan(ecosystem, "No packages were found");
        } else {
          const ignored = new Map(
            (await this.store.ignores(row.hostId)).map((i) => [
              i.advisory,
              i.note,
            ]),
          );
          const result = await this.osv.scan(
            admin.osvUrl,
            ecosystem,
            list.packages,
            { checkKev: admin.checkKev, ignored },
          );
          scan = {
            at: Date.now(),
            ecosystem,
            packages: list.packages.length,
            vulns: result.vulns,
            pending: result.pending,
            unsupported: "",
            error: "",
            kevChecked: result.kevChecked,
          };
        }
      }
      await this.applyScan(row, state, scan);
    } catch (e) {
      state.rescanAt = 0;
      const failed = this.emptyScan(
        state.scan?.ecosystem ?? "",
        message(e),
        state.scan?.packages ?? 0,
      );
      // A failed scan keeps the last results.
      state.scan = state.scan ? { ...state.scan, error: failed.error } : failed;
    } finally {
      state.scanning = false;
    }
    return state;
  }

  private emptyScan(ecosystem: string, error: string, packages = 0): VulnScan {
    return {
      at: Date.now(),
      ecosystem,
      packages,
      vulns: [],
      pending: 0,
      unsupported: "",
      error,
      kevChecked: false,
    };
  }

  private async applyScan(
    row: HostRow,
    state: HostState,
    scan: VulnScan,
  ): Promise<void> {
    state.scan = scan;
    state.rescanAt = scan.pending > 0 ? Date.now() + 60_000 : 0;
    await this.vulnStore.save(row.hostId, scan).catch(() => undefined);
    const now = alertable(scan);
    const fresh = [...now].filter((k) => !state.alerted.has(k));
    const gone = [...state.alerted].filter((k) => !now.has(k));
    state.alerted = now;
    if (fresh.length || gone.length) {
      await this.ctx.kv
        .set(`alerted:${row.hostId}`, [...now])
        .catch(() => undefined);
    }
    // One alert covers every new advisory from this scan.
    if (fresh.length) {
      const names = [...new Set(fresh.map((k) => k.split("|")[0]))];
      const text = `${names.length} new critical or exploited ${names.length === 1 ? "vulnerability" : "vulnerabilities"}: ${names.slice(0, 4).join(", ")}${names.length > 4 ? "..." : ""}`;
      await this.store.addEvent(row.hostId, "vuln-new", text);
      const label = await this.hostLabel(row.hostId);
      if (row.alerts) {
        await this.notify(row, {
          title: `${label}: ${text}`,
          severity: "critical",
          dedupe: `security-center:${row.hostId}:vuln:${names.sort().join(",")}`,
          category: "security-center.vuln_found",
        });
      }
      await this.emit(row, "security-center.vuln-found", {
        count: names.length,
        ids: names.slice(0, 20),
        hostName: label,
      });
    }
    if (gone.length) {
      await this.store.addEvent(
        row.hostId,
        "vuln-cleared",
        `${gone.length} vulnerabilities fixed or ignored`,
      );
    }
  }

  private async hostLabel(hostId: number): Promise<string> {
    try {
      const host = await this.ctx.hosts.get(hostId);
      const named = host as { name?: string; ip?: string } | null;
      return named?.name || named?.ip || `host ${hostId}`;
    } catch {
      return `host ${hostId}`;
    }
  }

  async emit(
    row: HostRow,
    event: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (typeof this.ctx.operations?.emit !== "function") return;
    await this.ctx.operations
      .emit(event, payload, { hostId: row.hostId })
      .catch(() => undefined);
  }

  private async emitKey(
    row: HostRow,
    change: Change,
    severity: string,
    label: string,
  ): Promise<void> {
    if (!change.on) return;
    if (!change.kind.startsWith("key-") && !change.kind.startsWith("authkeys"))
      return;
    if (severity !== "critical" && severity !== "high") return;
    await this.emit(row, "security-center.key-weak", {
      condition: change.kind,
      subject: change.subject,
      hostName: label,
    });
  }

  private async alert(
    row: HostRow,
    change: Change,
    title: string,
    body: string,
    severity: Parameters<typeof alertSeverity>[0],
  ): Promise<void> {
    await this.notify(row, {
      title: change.on ? title : `Cleared: ${title}`,
      body,
      severity: alertSeverity(severity),
      category: `security-center.${change.kind.replace(/-/g, "_")}`,
      dedupe: `security-center:${row.hostId}:${change.kind}:${change.subject}:${change.on ? "on" : "off"}`,
    });
  }

  private async notify(
    row: HostRow,
    n: {
      title: string;
      body?: string;
      severity: "info" | "warning" | "critical";
      category: string;
      dedupe: string;
    },
  ): Promise<void> {
    try {
      await this.ctx.notify.send({
        title: n.title,
        body: n.body || undefined,
        severity: n.severity,
        category: n.category,
        audience: { userId: row.userId },
        link: { tab: "security-center" },
        dedupeKey: n.dedupe,
        context: { hostId: row.hostId },
      });
    } catch (error) {
      this.ctx.log.warn(`Could not send a security alert: ${message(error)}`);
    }
  }

  /** Records a change Termix made, such as a rotation. */
  async note(hostId: number, type: string, text: string): Promise<void> {
    await this.store.addEvent(hostId, type, text);
  }
}
