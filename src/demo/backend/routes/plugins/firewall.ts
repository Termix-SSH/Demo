import { del, get, post, put } from "../../router";
import { collection, value } from "../../store";

const P = "/plugin-api/firewall";

interface Rule {
  id: string;
  action: string;
  direction: string;
  protocol: string;
  port: string;
  source: string;
  destination: string;
  iface: string;
  family: string;
  comment: string;
  managed: boolean;
  raw: string;
  position: number;
}

const rule = (
  n: number,
  action: string,
  protocol: string,
  port: string,
  source: string,
  comment: string,
): Rule => ({
  id: `ufw-${n}`,
  action,
  direction: "in",
  protocol,
  port,
  source,
  destination: "",
  iface: "",
  family: "any",
  comment,
  managed: true,
  raw: `${port}/${protocol} ${action.toUpperCase()} IN ${source || "Anywhere"}`,
  position: n,
});

const state = value<{
  active: boolean;
  rules: Rule[];
  incoming: string;
  outgoing: string;
  watch: boolean;
}>("firewall-state", () => ({
  active: true,
  incoming: "deny",
  outgoing: "allow",
  watch: true,
  rules: [
    rule(1, "allow", "tcp", "22", "192.168.1.0/24", "SSH from the LAN"),
    rule(2, "allow", "tcp", "80,443", "", "Web"),
    rule(3, "allow", "udp", "51820", "", "WireGuard"),
    rule(4, "deny", "tcp", "3306", "", "No public MySQL"),
  ],
}));

const status = () => {
  const s = state.get();
  return {
    backend: "ufw",
    installed: ["ufw", "nftables"],
    active: s.active,
    version: "ufw 0.36.2",
    defaults: { incoming: s.incoming, outgoing: s.outgoing, routed: "deny" },
    rules: s.rules,
    zones: [],
    defaultZone: "",
    otherRules: 0,
    persistent: true,
    warnings: [],
    ssh: { ports: [22], client: "192.168.1.50" },
    packageManager: "apt",
    os: "Debian GNU/Linux 12",
    root: true,
    fail2ban: { installed: true, running: true },
    canEdit: true,
    readOnly: false,
    sshGuard: true,
    pending: null,
  };
};
const changed = () => ({ ok: true, pending: null });

get(`${P}/summary`, () => [
  {
    hostId: 1,
    backend: "ufw",
    active: state.get().active,
    rules: state.get().rules.length,
    banned: 3,
    pending: false,
    watched: state.get().watch,
    checkedAt: new Date().toISOString(),
  },
  {
    hostId: 9,
    backend: "nftables",
    active: true,
    rules: 6,
    banned: 0,
    pending: false,
    watched: false,
    checkedAt: new Date().toISOString(),
  },
]);

const rulesets = collection<Record<string, unknown> & { id: number }>(
  "firewall-rulesets",
  () => [
    {
      id: 1,
      name: "Web servers",
      description: "Open web ports, keep SSH on the LAN.",
      rules: [
        {
          action: "allow",
          direction: "in",
          protocol: "tcp",
          port: "80,443",
          source: "",
          destination: "",
          iface: "",
          family: "any",
          comment: "Web",
        },
        {
          action: "allow",
          direction: "in",
          protocol: "tcp",
          port: "22",
          source: "192.168.1.0/24",
          destination: "",
          iface: "",
          family: "any",
          comment: "SSH",
        },
      ],
      hosts: [1, 2],
      updatedAt: new Date(Date.now() - 86_400_000 * 3).toISOString(),
    },
  ],
);

get(`${P}/rulesets`, () => rulesets.all());
post(`${P}/rulesets`, (req) =>
  rulesets.insert({
    description: "",
    rules: [],
    hosts: [],
    ...(req.body as object),
    id: rulesets.nextId(),
    updatedAt: new Date().toISOString(),
  }),
);
put(`${P}/rulesets/:id`, (req) =>
  rulesets.patch(req.params.id, req.body as Record<string, unknown>),
);
del(`${P}/rulesets/:id`, (req) => {
  rulesets.remove(req.params.id);
  return { ok: true };
});
get(`${P}/rulesets/:id/drift`, () => [
  { hostId: 1, backend: "ufw", active: true, missing: [] },
  {
    hostId: 2,
    backend: "ufw",
    active: true,
    missing: [
      {
        action: "allow",
        direction: "in",
        protocol: "tcp",
        port: "80,443",
        source: "",
        destination: "",
        iface: "",
        family: "any",
        comment: "Web",
      },
    ],
  },
]);
post(`${P}/rulesets/:id/apply`, () => [
  { hostId: 1, added: 0, kept: true },
  { hostId: 2, added: 1, kept: true },
]);
get(`${P}/fleets`, () => [{ id: 1, name: "Production" }]);

get(`${P}/:host/status`, () => status());
get(`${P}/:host/raw`, () => ({
  output:
    "Status: active\n\nTo                         Action      From\n--                         ------      ----\n22/tcp                     ALLOW IN    192.168.1.0/24\n80,443/tcp                 ALLOW IN    Anywhere\n",
}));
post(`${P}/:host/install`, () => ({ ok: true }));
get(`${P}/:host/pending`, () => ({ pending: null }));
post(`${P}/:host/pending/keep`, () => ({ ok: true }));
post(`${P}/:host/pending/undo`, () => ({ ok: true }));
post(`${P}/:host/rules`, (req) => {
  const b = req.body as Partial<Rule>;
  state.update((s) => ({
    ...s,
    rules: [
      ...s.rules,
      {
        ...rule(s.rules.length + 1, "allow", "tcp", "", "", ""),
        ...b,
        id: `ufw-${Date.now()}`,
      },
    ],
  }));
  return changed();
});
put(`${P}/:host/rules/:id`, (req) => {
  state.update((s) => ({
    ...s,
    rules: s.rules.map((r) =>
      r.id === decodeURIComponent(req.params.id)
        ? { ...r, ...(req.body as Partial<Rule>) }
        : r,
    ),
  }));
  return changed();
});
del(`${P}/:host/rules/:id`, (req) => {
  state.update((s) => ({
    ...s,
    rules: s.rules.filter((r) => r.id !== decodeURIComponent(req.params.id)),
  }));
  return changed();
});
post(`${P}/:host/defaults`, (req) => {
  const b = req.body as { incoming?: string; outgoing?: string };
  state.update((s) => ({
    ...s,
    incoming: b.incoming ?? s.incoming,
    outgoing: b.outgoing ?? s.outgoing,
  }));
  return changed();
});
post(`${P}/:host/enable`, () => {
  state.update((s) => ({ ...s, active: true }));
  return changed();
});
post(`${P}/:host/disable`, () => {
  state.update((s) => ({ ...s, active: false }));
  return changed();
});
post(`${P}/:host/zones/:zone/target`, () => changed());
post(`${P}/:host/default-zone`, () => changed());
get(`${P}/:host/watch`, () => ({ on: state.get().watch }));
put(`${P}/:host/watch`, (req) => {
  state.update((s) => ({ ...s, watch: !!(req.body as { on?: boolean }).on }));
  return { ok: true };
});
get(`${P}/:host/fail2ban`, () => ({
  installed: true,
  running: true,
  version: "1.0.2",
  jails: [
    {
      name: "sshd",
      currentlyFailed: 2,
      totalFailed: 148,
      currentlyBanned: 3,
      totalBanned: 41,
      banned: ["203.0.113.44", "198.51.100.23", "192.0.2.88"],
    },
  ],
}));
post(`${P}/:host/fail2ban/ban`, () => ({ ok: true }));
post(`${P}/:host/fail2ban/unban`, () => ({ ok: true }));
post(`${P}/:host/fail2ban/start`, () => ({ ok: true }));
