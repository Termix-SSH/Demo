import { get, HttpError, post } from "../../router";
import { isRecording } from "../../recording";
import { value } from "../../store";

const P = "/plugin-api/certificates";
const DAY = 86_400_000;

const cert = (
  client: "certbot" | "acme.sh",
  name: string,
  days: number,
  domains: string[],
  keyType: string,
) => ({
  key: `${client}:${name}`,
  client,
  name,
  domains,
  expiry: new Date(Date.now() + days * DAY).toISOString(),
  daysLeft: days,
  path:
    client === "certbot"
      ? `/etc/letsencrypt/live/${name}/fullchain.pem`
      : `/root/.acme.sh/${name}_ecc/${name}.cer`,
  keyType,
  staging: false,
});

const state = value("certificates-state", () => ({
  watching: false,
  certs: [
    cert("certbot", "grafana.home.arpa", 9, ["grafana.home.arpa"], "ECDSA"),
    cert(
      "certbot",
      "example.home.arpa",
      64,
      ["example.home.arpa", "www.example.home.arpa"],
      "ECDSA",
    ),
    cert("acme.sh", "vault.home.arpa", 41, ["vault.home.arpa"], "ECDSA 256"),
  ],
}));

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const done = (text: string) => ({
  ok: true,
  output: isRecording()
    ? ""
    : `${text}\nThis is a demo, so nothing changed on a real host.`,
});

const chain = (name: string, days: number) => ({
  source: name,
  verify: "0 (ok)",
  chain: [
    {
      subject: `CN=${name}`,
      issuer: "C=US, O=Let's Encrypt, CN=E6",
      notBefore: new Date(Date.now() - (90 - days) * DAY).toISOString(),
      notAfter: new Date(Date.now() + days * DAY).toISOString(),
      daysLeft: days,
      sans: [name],
      serial: "04A7C3E19B2D5F60",
      fingerprint:
        "7D:C4:D8:5C:F1:E3:10:97:12:25:BC:9A:92:57:67:90:43:A2:43:D7",
      keyType: "ECDSA 256",
      selfSigned: false,
    },
    {
      subject: "C=US, O=Let's Encrypt, CN=E6",
      issuer: "C=US, O=Internet Security Research Group, CN=ISRG Root X1",
      notBefore: "2024-03-13T00:00:00.000Z",
      notAfter: "2027-03-12T23:59:59.000Z",
      daysLeft: Math.floor(
        (Date.parse("2027-03-12T23:59:59Z") - Date.now()) / DAY,
      ),
      sans: [],
      serial: "B0573E9173972770DBB487CB3A452B38",
      fingerprint:
        "76:E9:E2:88:AF:CF:E7:2F:91:CD:4C:B3:2B:62:83:20:3F:7A:C3:F4",
      keyType: "ECDSA 384",
      selfSigned: false,
    },
  ],
});

get(`${P}/:host/status`, () => ({
  os: "Ubuntu 24.04.1 LTS",
  root: true,
  certbot: "2.9.0",
  acmesh: "3.0.9",
  openssl: true,
  manager: "apt-get",
  timer: "active",
  timerNext: "Fri 2026-11-06 03:41:00 UTC",
  certbotCron: false,
  acmeCron: true,
  watching: state.get().watching,
  warnDays: 14,
  canEdit: true,
  readOnly: false,
}));
get(`${P}/:host/certificates`, () => state.get().certs);
get(`${P}/:host/inspect`, (req) => {
  if (req.query.path) {
    const found = state.get().certs.find((c) => c.path === req.query.path);
    return chain(found?.name ?? "server.home.arpa", found?.daysLeft ?? 120);
  }
  const address = String(req.query.address ?? "");
  if (!address) throw new HttpError(400, { error: "The address is not valid" });
  return {
    ...chain(address, 71),
    source: `${address}:${req.query.port ?? 443}`,
  };
});
post(`${P}/:host/issue`, async (req) => {
  const b = req.body as { client: "certbot" | "acme.sh"; domains: string[] };
  await wait(2500);
  state.update((s) => ({
    ...s,
    certs: [...s.certs, cert(b.client, b.domains[0], 89, b.domains, "ECDSA")],
  }));
  return done("Successfully received certificate.");
});
post(`${P}/:host/renew`, async (req) => {
  const key = (req.body as { key?: string }).key;
  await wait(1500);
  state.update((s) => ({
    ...s,
    certs: s.certs.map((c) =>
      !key || c.key === key
        ? cert(c.client, c.name, 89, c.domains, c.keyType)
        : c,
    ),
  }));
  return done("Congratulations, all renewals succeeded.");
});
for (const action of ["revoke", "delete"]) {
  post(`${P}/:host/${action}`, async (req) => {
    const key = (req.body as { key?: string }).key;
    await wait(1000);
    state.update((s) => ({
      ...s,
      certs: s.certs.filter((c) => c.key !== key),
    }));
    return done(
      action === "revoke"
        ? "Congratulations! You have successfully revoked the certificate."
        : "Deleted.",
    );
  });
}
post(`${P}/:host/install`, () => done("certbot is already installed."));
post(`${P}/:host/watch`, (req) => {
  const on = (req.body as { on?: boolean }).on === true;
  state.update((s) => ({ ...s, watching: on }));
  return { watching: on };
});
get(`${P}/summary`, () => [
  {
    hostId: 1,
    checkedAt: new Date().toISOString(),
    certs: state.get().certs.map((c) => ({
      name: c.name,
      client: c.client,
      daysLeft: c.daysLeft,
    })),
  },
]);
