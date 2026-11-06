import { del, get, post, put } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/ups-manager";

const sec = (minAgo: number) => Math.floor(Date.now() / 1000) - minAgo * 60;

const reading = () => ({
  state: "online",
  flags: ["charging"],
  chargePct: 96,
  runtimeSec: 2_460,
  loadPct: 28,
  inputV: 231,
  outputV: 230,
  batteryV: 27.1,
  tempC: 29,
  nominalW: 900,
  manufacturer: "APC",
  model: "Back-UPS Pro 1500",
  serial: "3B2142X09876",
  lastTest: "Passed 3 days ago",
  rawStatus: "OL CHRG",
});

interface Source extends Record<string, unknown> {
  id: number;
  hostId: number;
}

const sources = collection<Source>("ups-manager-sources", () => [
  {
    id: 1,
    hostId: 8,
    backend: "nut",
    label: "Rack UPS",
    target: "rack-ups",
    snmpVersion: "2c",
    lowCharge: 30,
    lowRuntimeMin: 5,
    alerts: true,
    enabled: true,
    hasSecrets: true,
    reading: reading(),
    error: "",
    readAt: sec(1),
  },
]);

const hostSources = (host: string) =>
  sources.all().filter((s) => s.hostId === Number(host));

get(`${P}/summary`, () =>
  sources.all().map((s) => {
    const r = s.reading as ReturnType<typeof reading> | null;
    return {
      hostId: s.hostId,
      sourceId: s.id,
      label: s.label,
      backend: s.backend,
      state: r?.state ?? "unknown",
      flags: r?.flags ?? [],
      chargePct: r?.chargePct ?? null,
      runtimeSec: r?.runtimeSec ?? null,
      loadPct: r?.loadPct ?? null,
      error: "",
    };
  }),
);
get(`${P}/:host/detect`, () => ({
  upsc: true,
  upscmd: true,
  apcaccess: false,
  snmpwalk: true,
  nutUps: ["rack-ups"],
  services: ["nut-server", "nut-monitor"],
}));
get(`${P}/:host/sources`, (req) => ({
  canEdit: true,
  sources: hostSources(req.params.host),
}));
post(`${P}/:host/sources`, (req) =>
  sources.insert({
    snmpVersion: "2c",
    lowCharge: 30,
    lowRuntimeMin: 5,
    alerts: true,
    enabled: true,
    hasSecrets: false,
    ...(req.body as object),
    id: sources.nextId(),
    hostId: Number(req.params.host),
    reading: reading(),
    error: "",
    readAt: sec(0),
  } as Source),
);
get(`${P}/:host/sources/:id/status`, (req) => sources.find(req.params.id));
put(`${P}/:host/sources/:id`, (req) =>
  sources.patch(req.params.id, req.body as Partial<Source>),
);
del(`${P}/:host/sources/:id`, (req) => {
  sources.remove(req.params.id);
  return { ok: true };
});
post(`${P}/:host/test-source`, () => ({ reading: reading() }));
get(`${P}/:host/sources/:id/history`, () => ({
  points: Array.from({ length: 48 }, (_, i) => ({
    t: sec((48 - i) * 30),
    c: 95 + (i % 3),
    r: 2400 + (i % 5) * 20,
    l: 26 + Math.round(Math.sin(i / 4) * 6),
    i: 230 + (i % 4),
    o: 230,
  })),
}));
get(`${P}/:host/sources/:id/events`, () => [
  {
    id: 2,
    sourceId: 1,
    at: sec(60 * 72),
    type: "power-restored",
    text: "Power is back, charging",
  },
  {
    id: 1,
    sourceId: 1,
    at: sec(60 * 72 + 2),
    type: "on-battery",
    text: "Running on battery",
  },
]);
get(`${P}/:host/sources/:id/commands`, () => [
  {
    name: "test.battery.start.quick",
    description: "Start a quick battery test",
    risk: "change",
  },
  {
    name: "beeper.toggle",
    description: "Toggle the alarm beeper",
    risk: "change",
  },
  {
    name: "load.off",
    description: "Turn off the load immediately",
    risk: "destructive",
  },
]);
post(`${P}/:host/sources/:id/commands`, () => ({ output: "OK" }));
