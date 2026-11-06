import { get, post, put } from "../../router";
import { value } from "../../store";

const P = "/plugin-api/storage-health";

const sec = (minAgo: number) => Math.floor(Date.now() / 1000) - minAgo * 60;
const TB = 1_000_000_000_000;

const drive = (
  id: string,
  model: string,
  kind: string,
  size: number,
  extra: Record<string, unknown> = {},
) => ({
  id,
  model,
  serial: `S${id.toUpperCase()}7K2011`,
  kind,
  sizeBytes: size,
  health: "ok",
  passed: true,
  tempC: 36,
  powerOnHours: 21_400,
  wearPct: null,
  reallocated: 0,
  pending: 0,
  uncorrectable: 0,
  mediaErrors: null,
  spareLowPct: null,
  criticalWarning: null,
  selfTest: "Completed without error",
  selfTestRunning: false,
  note: "",
  attributes: [
    { id: 5, name: "Reallocated_Sector_Ct", value: 100, raw: 0 },
    { id: 9, name: "Power_On_Hours", value: 76, raw: 21_400 },
    { id: 194, name: "Temperature_Celsius", value: 64, raw: 36 },
  ],
  ...extra,
});

interface Config {
  hostId: number;
  alerts: boolean;
  intervalMin: number;
  tempWarnC: number;
  tempCritC: number;
  wearWarnPct: number;
  thinWarnPct: number;
}

const reading = () => ({
  devices: [
    drive("nvme0n1", "Samsung SSD 980 PRO 1TB", "nvme", 1 * TB, {
      tempC: 41,
      wearPct: 6,
      powerOnHours: 9_800,
      mediaErrors: 0,
      spareLowPct: 10,
      criticalWarning: 0,
      attributes: [],
    }),
    drive("sda", "WDC WD40EFRX-68N32N0", "hdd", 4 * TB, { tempC: 38 }),
    drive("sdb", "WDC WD40EFRX-68N32N0", "hdd", 4 * TB, {
      tempC: 44,
      health: "warn",
      reallocated: 8,
      pending: 2,
      powerOnHours: 41_900,
    }),
  ],
  pools: [],
  arrays: [
    {
      id: "md0",
      name: "md0",
      level: "raid1",
      state: "clean",
      health: "ok",
      total: 2,
      active: 2,
      failed: [],
      syncAction: "idle",
      syncPct: null,
      syncEta: "",
    },
  ],
  btrfs: [],
  groups: [],
  tools: ["smartctl", "nvme", "mdadm"],
  root: true,
  warnings: [],
});

const configs = value<Record<string, Config>>(
  "storage-health-config",
  () => ({}),
);
const config = (host: number): Config =>
  configs.get()[host] ?? {
    hostId: host,
    alerts: true,
    intervalMin: 15,
    tempWarnC: 55,
    tempCritC: 65,
    wearWarnPct: 80,
    thinWarnPct: 85,
  };

const HOSTS = [
  { hostId: 3, label: "db-primary" },
  { hostId: 8, label: "nas" },
];

get(`${P}/summary`, () => [
  {
    hostId: 3,
    status: "ok",
    label: "3 drives healthy",
    drives: 3,
    problems: 0,
    hottestC: 41,
    error: "",
  },
  {
    hostId: 8,
    status: "warn",
    label: "1 drive needs attention",
    drives: 4,
    problems: 1,
    hottestC: 44,
    error: "",
  },
]);

get(`${P}/:host/events`, () => [
  {
    id: 2,
    hostId: 8,
    at: sec(60 * 5),
    type: "smart-attention",
    text: "sdb has 8 reallocated sectors",
  },
  {
    id: 1,
    hostId: 8,
    at: sec(60 * 30),
    type: "recovered",
    text: "md0 finished a check",
  },
]);
get(`${P}/:host/history`, () => ({
  points: Array.from({ length: 48 }, (_, i) => ({
    t: sec((48 - i) * 30),
    p: 36 + Math.round(Math.sin(i / 5) * 4),
    w: 6,
    h: 9_800 + i,
    r: 8,
  })),
}));
post(`${P}/:host/refresh`, (req) => view(Number(req.params.host)));
put(`${P}/:host/config`, (req) => {
  const host = Number(req.params.host);
  configs.update((c) => ({
    ...c,
    [host]: { ...config(host), ...(req.body as object), hostId: host },
  }));
  return { ok: true };
});
post(`${P}/:host/selftest`, () => ({ message: "Short self test started" }));
post(`${P}/:host/scrub`, () => ({ message: "Check started" }));

function view(host: number) {
  return {
    hostId: host,
    config: config(host),
    status: host === 8 ? "warn" : "ok",
    reading: reading(),
    error: "",
    readAt: sec(2),
    active: host === 8 ? ["smart-attention|sdb"] : [],
  };
}
get(`${P}/:host`, (req) => view(Number(req.params.host)));

void HOSTS;
