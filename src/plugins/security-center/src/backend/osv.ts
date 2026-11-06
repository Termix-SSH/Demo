import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { Vuln, VulnSeverity } from "../shared/types.js";
import type { PackageInfo } from "./parsers.js";

export const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

const DETAIL_TTL = 3 * 86_400_000;
const KEV_TTL = 24 * 3_600_000;
const BATCH = 500;
const MAX_PAGES = 5;
const DETAIL_CAP = 600;
const CACHE_CAP = 5000;
const CONCURRENCY = 12;

/** The OSV ecosystem name for an OS, or null when OSV has no feed for it. */
export function ecosystemOf(os: {
  id: string;
  version: string;
}): string | null {
  const id = os.id.toLowerCase();
  const version = os.version.trim();
  if (!version) return null;
  const major = version.split(".")[0];
  if (id === "debian") return /^\d+$/.test(major) ? `Debian:${major}` : null;
  if (id === "ubuntu") {
    const [year, minor] = version.split(".");
    const lts = Number(year) % 2 === 0 && minor === "04";
    return `Ubuntu:${version}${lts ? ":LTS" : ""}`;
  }
  if (id === "alpine") {
    const [a, b] = version.split(".");
    return a && b ? `Alpine:v${a}.${b}` : null;
  }
  if (id === "rocky") return `Rocky Linux:${major}`;
  if (id === "almalinux") return `AlmaLinux:${major}`;
  return null;
}

const CVSS_AV: Record<string, number> = { N: 0.85, A: 0.62, L: 0.55, P: 0.2 };
const CVSS_AC: Record<string, number> = { L: 0.77, H: 0.44 };
const CVSS_UI: Record<string, number> = { N: 0.85, R: 0.62 };
const CVSS_CIA: Record<string, number> = { H: 0.56, L: 0.22, N: 0 };

function roundUp(value: number): number {
  const n = Math.round(value * 100_000);
  return n % 10_000 === 0 ? n / 100_000 : (Math.floor(n / 10_000) + 1) / 10;
}

/** The base score of a CVSS 3.x vector, or null for anything else. */
export function cvssScore(vector: string): number | null {
  if (!/^CVSS:3\.[01]\//.test(vector)) return null;
  const m: Record<string, string> = {};
  for (const part of vector.split("/").slice(1)) {
    const [k, v] = part.split(":");
    if (k && v) m[k] = v;
  }
  const changed = m.S === "C";
  const av = CVSS_AV[m.AV];
  const ac = CVSS_AC[m.AC];
  const ui = CVSS_UI[m.UI];
  const pr =
    m.PR === "N"
      ? 0.85
      : m.PR === "L"
        ? changed
          ? 0.68
          : 0.62
        : m.PR === "H"
          ? changed
            ? 0.5
            : 0.27
          : undefined;
  const c = CVSS_CIA[m.C];
  const i = CVSS_CIA[m.I];
  const a = CVSS_CIA[m.A];
  if ([av, ac, ui, pr, c, i, a].some((x) => x === undefined)) return null;
  if (m.S !== "U" && m.S !== "C") return null;
  const iss = 1 - (1 - c) * (1 - i) * (1 - a);
  const impact = changed
    ? 7.52 * (iss - 0.029) - 3.25 * Math.pow(iss - 0.02, 15)
    : 6.42 * iss;
  const exploit = 8.22 * av * ac * pr! * ui;
  if (impact <= 0) return 0;
  return changed
    ? roundUp(Math.min(1.08 * (impact + exploit), 10))
    : roundUp(Math.min(impact + exploit, 10));
}

export function severityOfScore(score: number | null): VulnSeverity {
  if (score === null || score <= 0) return "unknown";
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function severityOfText(text: unknown): VulnSeverity {
  const s = String(text ?? "").toLowerCase();
  if (s === "critical") return "critical";
  if (s === "high" || s === "important") return "high";
  if (s === "medium" || s === "moderate") return "medium";
  if (s === "low" || s === "negligible" || s === "minor") return "low";
  return "unknown";
}

interface OsvRange {
  events?: Array<{ introduced?: string; fixed?: string }>;
}

interface OsvVuln {
  id: string;
  aliases?: string[];
  summary?: string;
  details?: string;
  withdrawn?: string;
  severity?: Array<{ type?: string; score?: string }>;
  affected?: Array<{
    package?: { name?: string };
    ranges?: OsvRange[];
  }>;
  database_specific?: { severity?: unknown };
}

export interface Detail {
  id: string;
  cves: string[];
  summary: string;
  severity: VulnSeverity;
  score: number | null;
  /** Fixed versions by package name. */
  fixed: Record<string, string>;
  withdrawn: boolean;
}

/** Reads what the scan needs from an OSV record. */
export function detailOf(raw: OsvVuln): Detail {
  const cves = [raw.id, ...(raw.aliases ?? [])].filter((x) =>
    /^CVE-\d{4}-\d+$/.test(x),
  );
  let score: number | null = null;
  let severity: VulnSeverity = "unknown";
  for (const s of raw.severity ?? []) {
    const type = (s.type ?? "").toUpperCase();
    if (type.startsWith("CVSS_V3")) {
      const value = cvssScore(s.score ?? "");
      if (value !== null && (score === null || value > score)) score = value;
    } else if (type === "UBUNTU" || type === "SEVERITY") {
      const text = severityOfText(s.score);
      if (text !== "unknown") severity = text;
    }
  }
  if (score !== null) severity = severityOfScore(score);
  if (severity === "unknown") {
    severity = severityOfText(raw.database_specific?.severity);
  }
  const fixed: Record<string, string> = {};
  for (const a of raw.affected ?? []) {
    const name = a.package?.name;
    if (!name) continue;
    for (const range of a.ranges ?? []) {
      for (const event of range.events ?? []) {
        if (event.fixed && !fixed[name]) fixed[name] = event.fixed;
      }
    }
  }
  const text = (raw.summary || raw.details || "").split("\n")[0].trim();
  return {
    id: raw.id,
    cves,
    summary: text.slice(0, 200),
    severity,
    score,
    fixed,
    withdrawn: Boolean(raw.withdrawn),
  };
}

interface CacheFile {
  details: Record<string, { at: number; detail: Detail }>;
  kev: { at: number; ids: string[] };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function pool<T>(
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

export interface ScanResult {
  vulns: Vuln[];
  pending: number;
  kevChecked: boolean;
}

/**
 * Looks packages up in OSV. Advisory details and the CISA known exploited
 * list are cached on disk so a repeat scan makes few requests.
 */
export class Osv {
  private details = new Map<string, { at: number; detail: Detail }>();
  private kev = new Set<string>();
  private kevAt = 0;
  private dirty = false;
  private file: string;

  constructor(
    private readonly ctx: PluginContext,
    dir: string,
  ) {
    this.file = path.join(dir, "osv-cache.json");
  }

  async load(): Promise<void> {
    try {
      const data = JSON.parse(await readFile(this.file, "utf8")) as CacheFile;
      for (const [id, entry] of Object.entries(data.details ?? {})) {
        this.details.set(id, entry);
      }
      this.kev = new Set(data.kev?.ids ?? []);
      this.kevAt = data.kev?.at ?? 0;
    } catch {
      // No cache yet.
    }
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    this.dirty = false;
    const entries = [...this.details.entries()]
      .sort((a, b) => b[1].at - a[1].at)
      .slice(0, CACHE_CAP);
    const data: CacheFile = {
      details: Object.fromEntries(entries),
      kev: { at: this.kevAt, ids: [...this.kev] },
    };
    try {
      await mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await writeFile(tmp, JSON.stringify(data));
      await rename(tmp, this.file);
    } catch (error) {
      this.ctx.log.warn(`Could not save the OSV cache: ${message(error)}`);
    }
  }

  private async request(
    base: string,
    pathname: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<unknown> {
    const url = `${base}${pathname}`;
    const host = new URL(url).hostname;
    const response = await this.ctx.fetch(url, {
      method: init.method ?? "GET",
      headers:
        init.body === undefined ? {} : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      timeoutMs: 45_000,
      allowPrivateHosts: [host],
    });
    if (!response.ok) throw new Error(`OSV answered ${response.status}`);
    return response.json();
  }

  /** CVE ids on the CISA known exploited list. Empty when it cannot be loaded. */
  async loadKev(enabled: boolean): Promise<boolean> {
    if (!enabled) return false;
    if (Date.now() - this.kevAt < KEV_TTL && this.kev.size) return true;
    try {
      const response = await this.ctx.fetch(KEV_URL, { timeoutMs: 30_000 });
      if (!response.ok) throw new Error(`answered ${response.status}`);
      const data = (await response.json()) as {
        vulnerabilities?: Array<{ cveID?: string }>;
      };
      const ids = (data.vulnerabilities ?? [])
        .map((v) => v.cveID ?? "")
        .filter(Boolean);
      if (ids.length) {
        this.kev = new Set(ids);
        this.kevAt = Date.now();
        this.dirty = true;
      }
    } catch (error) {
      this.ctx.log.debug(`Could not load the CISA list: ${message(error)}`);
    }
    return this.kev.size > 0;
  }

  async scan(
    base: string,
    ecosystem: string,
    packages: PackageInfo[],
    options: { checkKev: boolean; ignored: Map<string, string> },
  ): Promise<ScanResult> {
    // Which packages each advisory hits.
    const hits = new Map<string, Array<{ name: string; version: string }>>();
    for (let from = 0; from < packages.length; from += BATCH) {
      const chunk = packages.slice(from, from + BATCH);
      let queries = chunk.map((p, i) => ({
        i,
        query: { package: { name: p.name, ecosystem }, version: p.version },
      }));
      for (let page = 0; page < MAX_PAGES && queries.length; page += 1) {
        const data = (await this.request(base, "/v1/querybatch", {
          method: "POST",
          body: { queries: queries.map((q) => q.query) },
        })) as {
          results?: Array<{
            vulns?: Array<{ id: string }>;
            next_page_token?: string;
          }>;
        };
        const next: typeof queries = [];
        (data.results ?? []).forEach((result, n) => {
          const q = queries[n];
          if (!q) return;
          const pkg = chunk[q.i];
          for (const v of result.vulns ?? []) {
            const list = hits.get(v.id) ?? [];
            list.push({ name: pkg.name, version: pkg.version });
            hits.set(v.id, list);
          }
          if (result.next_page_token) {
            next.push({
              i: q.i,
              query: {
                ...q.query,
                page_token: result.next_page_token,
              } as never,
            });
          }
        });
        queries = next;
      }
    }

    const now = Date.now();
    const missing = [...hits.keys()].filter((id) => {
      const known = this.details.get(id);
      return !known || now - known.at > DETAIL_TTL;
    });
    const fetchNow = missing.slice(0, DETAIL_CAP);
    await pool(fetchNow, CONCURRENCY, async (id) => {
      try {
        const raw = (await this.request(
          base,
          `/v1/vulns/${encodeURIComponent(id)}`,
        )) as OsvVuln;
        this.details.set(id, { at: Date.now(), detail: detailOf(raw) });
        this.dirty = true;
      } catch (error) {
        this.ctx.log.debug(`OSV detail for ${id} failed: ${message(error)}`);
      }
    });
    const pending = [...hits.keys()].filter(
      (id) => !this.details.has(id),
    ).length;

    const kevChecked = await this.loadKev(options.checkKev);
    const vulns: Vuln[] = [];
    for (const [id, pkgs] of hits) {
      const detail = this.details.get(id)?.detail;
      if (detail?.withdrawn) continue;
      for (const pkg of pkgs) {
        const cves = detail?.cves.length
          ? detail.cves
          : /^CVE-/.test(id)
            ? [id]
            : [];
        vulns.push({
          id,
          cves,
          package: pkg.name,
          version: pkg.version,
          fixed: detail?.fixed[pkg.name] ?? "",
          severity: detail?.severity ?? "unknown",
          score: detail?.score ?? null,
          kev: cves.some((c) => this.kev.has(c)),
          summary: detail?.summary ?? "",
          ignored: options.ignored.has(id),
          ignoreNote: options.ignored.get(id) ?? "",
        });
      }
    }
    const rank = { critical: 0, high: 1, medium: 2, low: 3, unknown: 4 };
    vulns.sort(
      (a, b) =>
        Number(b.kev) - Number(a.kev) ||
        rank[a.severity] - rank[b.severity] ||
        a.package.localeCompare(b.package) ||
        a.id.localeCompare(b.id),
    );
    await this.flush();
    return { vulns: vulns.slice(0, 3000), pending, kevChecked };
  }
}
