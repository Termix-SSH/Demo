import type {
  BtrfsFs,
  Device,
  DeviceKind,
  Health,
  Pool,
  PoolMember,
  Raid,
  Reading,
  ThinPool,
  VolumeGroup,
} from "../shared/types.js";

interface Section {
  name: string;
  arg: string;
  body: string;
}

/** Splits the reader output at lines that start with "@@". */
export function splitSections(text: string): Section[] {
  const out: Section[] = [];
  let current: Section | null = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith("@@")) {
      const rest = line.slice(2);
      const space = rest.indexOf(" ");
      current = {
        name: space < 0 ? rest : rest.slice(0, space),
        arg: space < 0 ? "" : rest.slice(space + 1).trim(),
        body: "",
      };
      out.push(current);
    } else if (current) {
      current.body += `${line}\n`;
    }
  }
  return out;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function json(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  try {
    const value = JSON.parse(text.slice(start)) as unknown;
    return value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function obj(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function arr(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value as Array<Record<string, unknown>>) : [];
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// ---- drives ----

interface LsblkInfo {
  model: string;
  serial: string;
  sizeBytes: number | null;
  rota: boolean | null;
  tran: string;
}

export function parseLsblk(body: string): Map<string, LsblkInfo> {
  const out = new Map<string, LsblkInfo>();
  const data = json(body);
  for (const d of arr(data?.blockdevices)) {
    const name = str(d.name);
    if (!name) continue;
    const rota = d.rota;
    out.set(name, {
      model: str(d.model),
      serial: str(d.serial),
      sizeBytes: num(d.size),
      rota:
        rota === true || rota === "1" || rota === 1
          ? true
          : rota === false || rota === "0" || rota === 0
            ? false
            : null,
      tran: str(d.tran),
    });
  }
  return out;
}

function emptyDevice(id: string): Device {
  return {
    id,
    model: "",
    serial: "",
    kind: id.startsWith("nvme") ? "nvme" : "unknown",
    sizeBytes: null,
    health: "unknown",
    passed: null,
    tempC: null,
    powerOnHours: null,
    wearPct: null,
    reallocated: null,
    pending: null,
    uncorrectable: null,
    mediaErrors: null,
    spareLowPct: null,
    criticalWarning: null,
    selfTest: "",
    selfTestRunning: false,
    note: "",
    attributes: [],
  };
}

const WEAR_LEFT_IDS = new Set([177, 231, 233]);

/** Reads `smartctl -a --json` for one drive. */
export function parseSmart(id: string, body: string): Device {
  const d = emptyDevice(id);
  const j = json(body);
  if (!j) {
    d.note = "No answer from smartctl";
    return d;
  }
  d.model = str(j.model_name) || str(j.scsi_model_name);
  d.serial = str(j.serial_number);
  d.sizeBytes = num(obj(j.user_capacity).bytes);
  const type = str(obj(j.device).type);
  const rotation = num(j.rotation_rate);
  if (type === "nvme" || id.startsWith("nvme")) d.kind = "nvme";
  else if (rotation !== null && rotation > 0) d.kind = "hdd";
  else if (rotation === 0) d.kind = "ssd";

  const status = obj(j.smart_status);
  if (typeof status.passed === "boolean") d.passed = status.passed;
  d.tempC = realTemp(num(obj(j.temperature).current));
  d.powerOnHours = num(obj(j.power_on_time).hours);

  const attrs = arr(obj(j.ata_smart_attributes).table);
  for (const a of attrs) {
    const aid = num(a.id);
    if (aid === null) continue;
    const value = num(a.value) ?? 0;
    const raw = num(obj(a.raw).value) ?? 0;
    d.attributes.push({ id: aid, name: str(a.name), value, raw });
    if (aid === 5) d.reallocated = raw;
    else if (aid === 197) d.pending = raw;
    else if (aid === 198) d.uncorrectable = raw;
    else if (WEAR_LEFT_IDS.has(aid) && d.wearPct === null && value > 0) {
      d.wearPct = Math.max(0, Math.min(100, 100 - value));
      if (d.kind === "unknown") d.kind = "ssd";
    }
  }
  if (d.kind === "unknown" && attrs.length) d.kind = "hdd";

  const nv = obj(j.nvme_smart_health_information_log);
  if (Object.keys(nv).length) {
    d.kind = "nvme";
    d.criticalWarning = num(nv.critical_warning);
    d.tempC = realTemp(num(nv.temperature)) ?? d.tempC;
    d.wearPct = num(nv.percentage_used);
    d.mediaErrors = num(nv.media_errors);
    d.powerOnHours = num(nv.power_on_hours) ?? d.powerOnHours;
    const spare = num(nv.available_spare);
    const threshold = num(nv.available_spare_threshold);
    if (spare !== null && threshold !== null && spare < threshold) {
      d.spareLowPct = spare;
    }
  }

  const ataData = obj(obj(j.ata_smart_data).self_test);
  const ataStatus = obj(ataData.status);
  const ataValue = num(ataStatus.value);
  if (ataValue !== null && (ataValue & 0xf0) === 0xf0) {
    d.selfTestRunning = true;
    d.selfTest = str(ataStatus.string) || "In progress";
  } else {
    const last = arr(obj(obj(j.ata_smart_self_test_log).standard).table)[0];
    if (last) {
      const s = str(obj(last.status).string);
      const kind = str(obj(last.type).string);
      d.selfTest = [kind, s].filter(Boolean).join(": ");
    }
  }
  const nvTest = obj(j.nvme_self_test_log);
  if (Object.keys(nvTest).length) {
    const op = num(obj(nvTest.current_self_test_operation).value);
    if (op !== null && op > 0) {
      d.selfTestRunning = true;
      d.selfTest = str(obj(nvTest.current_self_test_operation).string);
    } else {
      const last = arr(nvTest.table)[0];
      if (last) d.selfTest = str(obj(last.self_test_result).string);
    }
  }

  if (d.passed === null && d.tempC === null && !attrs.length) {
    const messages = arr(obj(j.smartctl).messages);
    const text = messages.map((m) => str(m.string)).join(" ");
    d.note = /standby/i.test(text)
      ? "Asleep, not woken"
      : text.slice(0, 160) || "No SMART data from this drive";
  }
  if (d.passed !== null) d.health = d.passed ? "ok" : "fail";
  return d;
}

/** Fallback for NVMe drives when smartctl is missing. */
export function parseNvmeCli(id: string, body: string): Device {
  const d = emptyDevice(id);
  d.kind = "nvme";
  const j = json(body);
  if (!j) {
    d.note = "No answer from nvme";
    return d;
  }
  d.criticalWarning = num(j.critical_warning);
  const temp = num(j.temperature);
  d.tempC = temp === null ? null : temp > 200 ? temp - 273 : temp;
  d.wearPct = num(j.percent_used ?? j.percentage_used);
  d.mediaErrors = num(j.media_errors);
  d.powerOnHours = num(j.power_on_hours);
  const spare = num(j.avail_spare ?? j.available_spare);
  const threshold = num(j.spare_thresh ?? j.available_spare_threshold);
  if (spare !== null && threshold !== null && spare < threshold) {
    d.spareLowPct = spare;
  }
  d.passed = d.criticalWarning === null ? null : d.criticalWarning === 0;
  if (d.passed !== null) d.health = d.passed ? "ok" : "fail";
  return d;
}

// ---- ZFS ----

function poolHealth(state: string, errors: number): Health {
  const s = state.toUpperCase();
  if (s === "ONLINE") return errors > 0 ? "warn" : "ok";
  if (s === "") return "unknown";
  return "fail";
}

export function parseZfs(list: string, status: string): Pool[] {
  const pools = new Map<string, Pool>();
  for (const line of list.split("\n")) {
    const f = line.split("\t");
    if (f.length < 5 || !f[0].trim()) continue;
    const size = num(f[1]);
    const alloc = num(f[2]);
    pools.set(f[0].trim(), {
      id: `zfs:${f[0].trim()}`,
      name: f[0].trim(),
      state: f[4].trim(),
      health: "unknown",
      sizeBytes: size,
      usedPct:
        size && alloc !== null ? Math.round((alloc / size) * 1000) / 10 : null,
      errors: 0,
      scan: "",
      scrubbing: false,
      members: [],
    });
  }

  let pool: Pool | null = null;
  let inConfig = false;
  let inScan = false;
  let dataErrors = 0;
  const finish = () => {
    if (!pool) return;
    pool.errors =
      pool.members.reduce((n, m) => n + m.read + m.write + m.cksum, 0) +
      dataErrors;
    pool.health = poolHealth(pool.state, pool.errors);
    pool.scrubbing = /scrub in progress|resilver in progress/i.test(pool.scan);
  };
  for (const raw of status.split("\n")) {
    const line = raw.replace(/\s+$/, "");
    const head = /^\s*pool:\s*(\S+)/.exec(line);
    if (head) {
      finish();
      dataErrors = 0;
      inConfig = false;
      inScan = false;
      const name = head[1];
      pool = pools.get(name) ?? {
        id: `zfs:${name}`,
        name,
        state: "",
        health: "unknown",
        sizeBytes: null,
        usedPct: null,
        errors: 0,
        scan: "",
        scrubbing: false,
        members: [],
      };
      pools.set(name, pool);
      continue;
    }
    if (!pool) continue;
    const state = /^\s*state:\s*(\S+)/.exec(line);
    if (state) {
      pool.state = state[1];
      inScan = false;
      continue;
    }
    const scan = /^\s*scan:\s*(.*)$/.exec(line);
    if (scan) {
      pool.scan = scan[1].trim();
      inScan = true;
      continue;
    }
    if (/^\s*config:/.test(line)) {
      inConfig = true;
      inScan = false;
      continue;
    }
    const errors = /^\s*errors:\s*(.*)$/.exec(line);
    if (errors) {
      inConfig = false;
      inScan = false;
      if (!/no known data errors/i.test(errors[1])) dataErrors = 1;
      continue;
    }
    if (inScan && /^\s+\S/.test(line)) {
      pool.scan = `${pool.scan} ${line.trim()}`.slice(0, 400);
      continue;
    }
    if (inConfig) {
      if (!line.trim() || /^\s*NAME\s+STATE/.test(line)) continue;
      const m =
        /^(\s*)(\S+)\s+(\S+)(?:\s+(\d+[KMGT]?)\s+(\d+[KMGT]?)\s+(\d+[KMGT]?))?/.exec(
          line,
        );
      if (!m) continue;
      const member: PoolMember = {
        name: m[2],
        state: m[3],
        read: num(m[4]) ?? 0,
        write: num(m[5]) ?? 0,
        cksum: num(m[6]) ?? 0,
        depth: Math.floor(m[1].replaceAll("\t", "").length / 2),
      };
      pool.members.push(member);
    }
  }
  finish();
  return [...pools.values()].map((p) => {
    if (p.health === "unknown") p.health = poolHealth(p.state, p.errors);
    return p;
  });
}

// ---- mdadm ----

export function parseMdstat(body: string): Raid[] {
  const out: Raid[] = [];
  let current: Raid | null = null;
  for (const line of body.split("\n")) {
    const head = /^(md\w*)\s*:\s*(\S+)\s*(.*)$/.exec(line);
    if (head) {
      const tokens = head[3].split(/\s+/).filter(Boolean);
      const level =
        tokens.find((t) => /^(raid\d+|linear|multipath)$/.test(t)) ?? "";
      const failed = tokens
        .filter((t) => /\(F\)$/.test(t))
        .map((t) => t.replace(/\[.*$/, ""));
      current = {
        id: `md:${head[1]}`,
        name: head[1],
        level,
        state: head[2],
        health: head[2] === "inactive" ? "fail" : "ok",
        total: 0,
        active: 0,
        failed,
        syncAction: "",
        syncPct: null,
        syncEta: "",
      };
      out.push(current);
      continue;
    }
    if (!current) continue;
    const counts = /\[(\d+)\/(\d+)\]\s*\[([U_]+)\]/.exec(line);
    if (counts) {
      current.total = Number(counts[1]);
      current.active = Number(counts[2]);
      if (current.active < current.total) current.health = "fail";
      continue;
    }
    const sync = /(resync|recovery|reshape|check|repair)\s*=\s*([\d.]+)%/.exec(
      line,
    );
    if (sync) {
      current.syncAction = sync[1];
      current.syncPct = num(sync[2]);
      current.syncEta = /finish=(\S+)/.exec(line)?.[1] ?? "";
    } else if (
      /(resync|recovery|reshape|check)\s*=\s*(PENDING|DELAYED)/.test(line)
    ) {
      current.syncAction = /(\w+)\s*=/.exec(line)?.[1] ?? "";
    }
  }
  return out;
}

// ---- btrfs ----

export function parseBtrfs(sections: Section[]): BtrfsFs[] {
  const out: BtrfsFs[] = [];
  let fs: BtrfsFs | null = null;
  for (const s of sections) {
    if (s.name === "btrfs") {
      const [mount, label] = s.arg.split("|");
      fs = {
        id: `btrfs:${mount}`,
        mount,
        label: (label ?? "").trim(),
        errors: 0,
        scrub: "",
        scrubbing: false,
        health: "ok",
        counters: [],
      };
      for (const line of s.body.split("\n")) {
        const m = /^\[(.+?)\]\.(\w+)\s+(\d+)/.exec(line.trim());
        if (!m) continue;
        const value = Number(m[3]);
        fs.counters.push({ device: m[1], counter: m[2], value });
        fs.errors += value;
      }
      out.push(fs);
    } else if (s.name === "scrub" && fs) {
      const status = /Status:\s*(.+)/.exec(s.body)?.[1]?.trim() ?? "";
      const summary = /Error summary:\s*(.+)/.exec(s.body)?.[1]?.trim() ?? "";
      fs.scrubbing = /running/i.test(status);
      fs.scrub = /no stats available/i.test(s.body)
        ? "Never scrubbed"
        : [status, summary].filter(Boolean).join(", ");
      if (summary && !/no errors found/i.test(summary)) {
        for (const n of summary.matchAll(/=(\d+)/g)) fs.errors += Number(n[1]);
      }
    }
  }
  for (const f of out) f.health = f.errors > 0 ? "warn" : "ok";
  return out;
}

// ---- LVM ----

export function parseLvm(lvs: string, vgs: string): VolumeGroup[] {
  const groups = new Map<string, VolumeGroup>();
  const group = (name: string): VolumeGroup => {
    let g = groups.get(name);
    if (!g) {
      g = {
        id: `vg:${name}`,
        name,
        sizeBytes: null,
        freeBytes: null,
        thin: [],
        health: "ok",
      };
      groups.set(name, g);
    }
    return g;
  };
  const vgReport = arr(arr(json(vgs)?.report)[0]?.vg);
  for (const v of vgReport) {
    const g = group(str(v.vg_name));
    g.sizeBytes = num(v.vg_size);
    g.freeBytes = num(v.vg_free);
  }
  const lvReport = arr(arr(json(lvs)?.report)[0]?.lv);
  for (const l of lvReport) {
    const attr = str(l.lv_attr);
    if (attr[0] !== "t") continue;
    const pool: ThinPool = {
      name: str(l.lv_name),
      dataPct: num(l.data_percent),
      metaPct: num(l.metadata_percent),
    };
    group(str(l.vg_name)).thin.push(pool);
  }
  return [...groups.values()].filter((g) => g.name);
}

// ---- everything ----

export function parseReading(text: string): Reading {
  const sections = splitSections(text);
  const tools: string[] = [];
  let root = false;
  let lsblk = new Map<string, LsblkInfo>();
  const devices: Device[] = [];
  let zlist = "";
  let zstatus = "";
  let mdstat = "";
  let lvs = "";
  let vgs = "";
  const btrfsSections: Section[] = [];

  for (const s of sections) {
    switch (s.name) {
      case "root":
        root = s.arg === "0";
        break;
      case "tool":
        tools.push(s.arg);
        break;
      case "lsblk":
        lsblk = parseLsblk(s.body);
        break;
      case "smart":
        devices.push(parseSmart(s.arg, s.body));
        break;
      case "nvme":
        devices.push(parseNvmeCli(s.arg, s.body));
        break;
      case "zlist":
        zlist = s.body;
        break;
      case "zstatus":
        zstatus = s.body;
        break;
      case "mdstat":
        mdstat = s.body;
        break;
      case "btrfs":
      case "scrub":
        btrfsSections.push(s);
        break;
      case "lvs":
        lvs = s.body;
        break;
      case "vgs":
        vgs = s.body;
        break;
    }
  }

  const seen = new Set(devices.map((d) => d.id));
  for (const [name, info] of lsblk) {
    if (seen.has(name) || /^(zram|ram|loop|nbd|fd|sr)/.test(name)) continue;
    if (info) {
      const d = emptyDevice(name);
      d.note = "No SMART tool on this host";
      devices.push(d);
    }
  }
  for (const d of devices) {
    const info = lsblk.get(d.id);
    if (!info) continue;
    d.model = d.model || info.model;
    d.serial = d.serial || info.serial;
    d.sizeBytes = d.sizeBytes ?? info.sizeBytes;
    if (d.kind === "unknown") {
      const kind: DeviceKind =
        info.tran === "nvme"
          ? "nvme"
          : info.rota === true
            ? "hdd"
            : info.rota === false
              ? "ssd"
              : "unknown";
      d.kind = kind;
    }
  }
  devices.sort((a, b) =>
    a.id.localeCompare(b.id, undefined, { numeric: true }),
  );

  const warnings: string[] = [];
  if (!root) warnings.push("not-root");
  if (
    devices.length &&
    !tools.includes("smartctl") &&
    !tools.includes("nvme")
  ) {
    warnings.push("no-smart-tool");
  }

  return {
    devices,
    pools: parseZfs(zlist, zstatus),
    arrays: parseMdstat(mdstat),
    btrfs: parseBtrfs(btrfsSections),
    groups: parseLvm(lvs, vgs),
    tools,
    root,
    warnings,
  };
}

/** Virtual drives report 0 C, which is not a reading. */
function realTemp(value: number | null): number | null {
  return value !== null && value > 0 ? value : null;
}
