import type { Device, Health, HostConfig, Reading } from "../shared/types.js";

export const CONDITIONS = [
  "smart-failing",
  "smart-attention",
  "nvme-critical",
  "wear-high",
  "wear-critical",
  "temp-high",
  "temp-critical",
  "pool-degraded",
  "pool-errors",
  "raid-degraded",
  "raid-rebuilding",
  "btrfs-errors",
  "thin-full",
  "thin-critical",
  "unreachable",
] as const;

export type Condition = (typeof CONDITIONS)[number];
export type Severity = "info" | "warning" | "critical";

export const SEVERITY: Record<Condition, Severity> = {
  "smart-failing": "critical",
  "smart-attention": "warning",
  "nvme-critical": "critical",
  "wear-high": "warning",
  "wear-critical": "critical",
  "temp-high": "warning",
  "temp-critical": "critical",
  "pool-degraded": "critical",
  "pool-errors": "warning",
  "raid-degraded": "critical",
  "raid-rebuilding": "info",
  "btrfs-errors": "warning",
  "thin-full": "warning",
  "thin-critical": "critical",
  unreachable: "warning",
};

/** Three failed reads in a row. */
export const UNREACHABLE_AFTER = 3;
export const WEAR_CRITICAL_PCT = 95;
export const THIN_CRITICAL_PCT = 95;

export type Limits = Pick<
  HostConfig,
  "tempWarnC" | "tempCritC" | "wearWarnPct" | "thinWarnPct"
>;

export const DEFAULT_LIMITS: Limits = {
  tempWarnC: 0,
  tempCritC: 0,
  wearWarnPct: 80,
  thinWarnPct: 90,
};

export interface Active {
  key: string;
  kind: Condition;
  subject: string;
}

export function keyOf(kind: Condition, subject: string): string {
  return `${kind}|${subject}`;
}

export function parseKey(key: string): Active | null {
  const at = key.indexOf("|");
  if (at < 0) return null;
  const kind = key.slice(0, at);
  if (!(CONDITIONS as readonly string[]).includes(kind)) return null;
  return { key, kind: kind as Condition, subject: key.slice(at + 1) };
}

function tempLimits(device: Device, limits: Limits): [number, number] {
  const base: [number, number] =
    device.kind === "hdd"
      ? [50, 60]
      : device.kind === "unknown"
        ? [60, 70]
        : [70, 80];
  return [
    limits.tempWarnC > 0 ? limits.tempWarnC : base[0],
    limits.tempCritC > 0 ? limits.tempCritC : base[1],
  ];
}

/** Every problem in a reading, keyed by condition and what it is about. */
export function conditionsOf(
  reading: Reading,
  limits: Limits = DEFAULT_LIMITS,
): Map<string, Active> {
  const out = new Map<string, Active>();
  const add = (kind: Condition, subject: string) =>
    out.set(keyOf(kind, subject), { key: keyOf(kind, subject), kind, subject });

  for (const d of reading.devices) {
    if (d.passed === false) add("smart-failing", d.id);
    if (
      (d.reallocated ?? 0) > 0 ||
      (d.pending ?? 0) > 0 ||
      (d.uncorrectable ?? 0) > 0 ||
      (d.mediaErrors ?? 0) > 0 ||
      d.spareLowPct !== null
    ) {
      add("smart-attention", d.id);
    }
    if ((d.criticalWarning ?? 0) > 0) add("nvme-critical", d.id);
    if (d.wearPct !== null) {
      if (d.wearPct >= WEAR_CRITICAL_PCT) add("wear-critical", d.id);
      else if (d.wearPct >= limits.wearWarnPct) add("wear-high", d.id);
    }
    if (d.tempC !== null) {
      const [warn, crit] = tempLimits(d, limits);
      if (d.tempC >= crit) add("temp-critical", d.id);
      else if (d.tempC >= warn) add("temp-high", d.id);
    }
  }
  for (const p of reading.pools) {
    if (p.state && p.state.toUpperCase() !== "ONLINE") {
      add("pool-degraded", p.name);
    } else if (p.errors > 0) {
      add("pool-errors", p.name);
    }
  }
  for (const a of reading.arrays) {
    if (a.health === "fail") add("raid-degraded", a.name);
    if (a.syncAction === "recovery" || a.syncAction === "reshape") {
      add("raid-rebuilding", a.name);
    }
  }
  for (const b of reading.btrfs) {
    if (b.errors > 0) add("btrfs-errors", b.mount);
  }
  for (const g of reading.groups) {
    for (const t of g.thin) {
      const worst = Math.max(t.dataPct ?? 0, t.metaPct ?? 0);
      const subject = `${g.name}/${t.name}`;
      if (worst >= THIN_CRITICAL_PCT) add("thin-critical", subject);
      else if (worst >= limits.thinWarnPct) add("thin-full", subject);
    }
  }
  return out;
}

const RANK: Record<Health, number> = { ok: 0, unknown: 1, warn: 2, fail: 3 };

export function worse(a: Health, b: Health): Health {
  return RANK[b] > RANK[a] ? b : a;
}

function healthOf(kind: Condition): Health {
  const s = SEVERITY[kind];
  return s === "critical" ? "fail" : s === "warning" ? "warn" : "ok";
}

/** Sets the health of every device, pool, array and group from its problems. */
export function applyHealth(reading: Reading, limits: Limits): void {
  const active = conditionsOf(reading, limits);
  const levelFor = (subjects: string[], base: Health): Health => {
    let level = base;
    for (const a of active.values()) {
      if (subjects.includes(a.subject)) level = worse(level, healthOf(a.kind));
    }
    return level;
  };
  for (const d of reading.devices) {
    d.health = levelFor([d.id], d.passed === null ? "unknown" : "ok");
  }
  for (const p of reading.pools) p.health = levelFor([p.name], p.health);
  for (const a of reading.arrays) a.health = levelFor([a.name], a.health);
  for (const b of reading.btrfs) b.health = levelFor([b.mount], b.health);
  for (const g of reading.groups) {
    g.health = levelFor(
      g.thin.map((t) => `${g.name}/${t.name}`),
      "ok",
    );
  }
}

/** The worst health across the whole reading. */
export function overall(reading: Reading | null): Health {
  if (!reading) return "unknown";
  let level: Health = "ok";
  let any = false;
  const all: Health[] = [
    ...reading.devices.map((d) => d.health),
    ...reading.pools.map((p) => p.health),
    ...reading.arrays.map((a) => a.health),
    ...reading.btrfs.map((b) => b.health),
    ...reading.groups.map((g) => g.health),
  ];
  for (const h of all) {
    if (h !== "unknown") any = true;
    level = worse(level, h);
  }
  return any ? level : "unknown";
}

export interface Change {
  key: string;
  kind: Condition;
  subject: string;
  on: boolean;
}

export function diff(before: Set<string>, after: Set<string>): Change[] {
  const out: Change[] = [];
  for (const key of after) {
    if (before.has(key)) continue;
    const a = parseKey(key);
    if (a) out.push({ ...a, on: true });
  }
  for (const key of before) {
    if (after.has(key)) continue;
    const a = parseKey(key);
    if (a) out.push({ ...a, on: false });
  }
  return out;
}

function subjectName(reading: Reading | null, subject: string): string {
  const d = reading?.devices.find((x) => x.id === subject);
  if (d) return d.model ? `${subject} (${d.model})` : subject;
  return subject;
}

const TEXT: Record<Condition, [string, string]> = {
  "smart-failing": ["{s} is failing its SMART check", "Back up and replace it"],
  "smart-attention": [
    "{s} has SMART warnings",
    "It reports bad or pending sectors, media errors or low spare blocks",
  ],
  "nvme-critical": [
    "{s} has a critical warning",
    "The drive reports a critical state",
  ],
  "wear-high": ["{s} is wearing out", "Plan to replace it"],
  "wear-critical": ["{s} is nearly worn out", "Replace it soon"],
  "temp-high": ["{s} is running hot", "Check the airflow"],
  "temp-critical": ["{s} is too hot", "Check the airflow and fans now"],
  "pool-degraded": [
    "Pool {s} is not online",
    "Redundancy is lost or the pool is down",
  ],
  "pool-errors": [
    "Pool {s} has errors",
    "Read, write or checksum errors were found",
  ],
  "raid-degraded": ["Array {s} is degraded", "A member is missing or failed"],
  "raid-rebuilding": [
    "Array {s} is rebuilding",
    "Redundancy returns when it finishes",
  ],
  "btrfs-errors": [
    "Filesystem {s} has errors",
    "btrfs counted device or scrub errors",
  ],
  "thin-full": ["Thin pool {s} is filling up", "Extend it before it is full"],
  "thin-critical": [
    "Thin pool {s} is almost full",
    "Writes fail when it is full",
  ],
  unreachable: [
    "Storage on {s} cannot be read",
    "Termix could not read the host",
  ],
};

export function messageFor(
  change: Change,
  reading: Reading | null,
  hostLabel: string,
): { title: string; body: string; severity: Severity } {
  const [title, body] = TEXT[change.kind];
  const name =
    change.kind === "unreachable"
      ? hostLabel
      : subjectName(reading, change.subject);
  const text = title.replace("{s}", name);
  if (!change.on) {
    return {
      title: `${name} is back to normal on ${hostLabel}`,
      body: "",
      severity: "info",
    };
  }
  return {
    title: `${text} on ${hostLabel}`,
    body,
    severity: SEVERITY[change.kind],
  };
}
