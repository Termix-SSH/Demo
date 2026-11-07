import { get, post } from "../../router";
import { collection } from "../../store";
import { DEMO_USER_ID } from "../../../fixtures/hosts";

const P = "/plugin-api/privileged-access";
const HOUR = 3_600_000;
const at = (minutesAgo: number) =>
  new Date(Date.now() - minutesAgo * 60_000).toISOString();

type Status =
  "pending" | "approved" | "denied" | "expired" | "revoked" | "cancelled";

interface Request extends Record<string, unknown> {
  id: number;
  hostId: number;
  hostName: string;
  userId: string;
  username: string;
  reason: string | null;
  ticket: string | null;
  hours: number;
  status: Status;
  createdAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  comment: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  endedAt: string | null;
}

const HOSTS = [
  {
    id: 3,
    name: "db-primary",
    maxHours: 4,
    requireReason: true,
    requireTicket: true,
  },
  {
    id: 4,
    name: "db-replica",
    maxHours: 8,
    requireReason: true,
    requireTicket: false,
  },
  {
    id: 6,
    name: "bastion",
    maxHours: 2,
    requireReason: true,
    requireTicket: false,
  },
  {
    id: 7,
    name: "proxmox",
    maxHours: 4,
    requireReason: true,
    requireTicket: true,
  },
];

const request = (
  id: number,
  hostId: number,
  userId: string,
  username: string,
  status: Status,
  minutesAgo: number,
  extra: Partial<Request> = {},
): Request => {
  const created = Date.now() - minutesAgo * 60_000;
  const decided = status !== "pending" && status !== "cancelled";
  return {
    id,
    hostId,
    hostName: HOSTS.find((h) => h.id === hostId)?.name ?? null,
    userId,
    username,
    reason: "Restart the replica after the disk swap",
    ticket: "OPS-1482",
    hours: 2,
    status,
    createdAt: new Date(created).toISOString(),
    decidedByName: decided ? "demo" : null,
    decidedAt: decided ? new Date(created + 4 * 60_000).toISOString() : null,
    comment: null,
    startsAt:
      status === "approved"
        ? new Date(created + 4 * 60_000).toISOString()
        : null,
    expiresAt:
      status === "approved"
        ? new Date(created + 4 * 60_000 + 2 * HOUR).toISOString()
        : null,
    endedAt: null,
    ...extra,
  } as Request;
};

const requests = collection<Request>("privileged-access-requests", () => [
  request(1, 3, "user-ana", "ana", "pending", 6, {
    reason: "Run the monthly vacuum on the orders table",
    ticket: "OPS-1490",
    hours: 1,
  }),
  request(2, 7, "user-marco", "marco", "pending", 14, {
    reason: "Move the build VM to the new storage pool",
    ticket: "OPS-1493",
    hours: 3,
  }),
  request(3, 6, DEMO_USER_ID, "demo", "approved", 25, {
    reason: "Rotate the jump host keys",
    ticket: null,
  }),
  request(4, 4, "user-oncall", "oncall", "approved", 50, {
    reason: "Replica lag alert at 02:10",
    ticket: "INC-311",
  }),
  request(5, 3, DEMO_USER_ID, "demo", "expired", 60 * 26, {
    reason: "Restore a dropped table",
    ticket: "OPS-1461",
    expiresAt: at(60 * 24),
    endedAt: at(60 * 24),
  }),
  request(6, 7, "user-marco", "marco", "denied", 60 * 30, {
    reason: "Just looking",
    ticket: null,
    comment: "Please add a ticket",
  }),
]);

const isActive = (r: Request) =>
  r.status === "approved" &&
  (!r.expiresAt || Date.parse(r.expiresAt) > Date.now());

get(`${P}/hosts`, () => ({
  hosts: HOSTS.map((h) => {
    const grant = requests
      .all()
      .find(
        (r) => r.hostId === h.id && r.userId === DEMO_USER_ID && isActive(r),
      );
    return {
      ...h,
      accessUntil: grant?.expiresAt ? Date.parse(grant.expiresAt) : null,
    };
  }),
}));

get(`${P}/requests`, (req) => {
  const scope = String(req.query.scope ?? "mine");
  const all = [...requests.all()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const list =
    scope === "pending"
      ? all.filter((r) => r.status === "pending")
      : scope === "active"
        ? all.filter(isActive)
        : scope === "all"
          ? all
          : all.filter((r) => r.userId === DEMO_USER_ID);
  return { requests: list };
});

post(`${P}/requests`, (req) => {
  const b = req.body as {
    hostId: number;
    hours: number;
    reason: string;
    ticket: string;
  };
  const id = Math.max(0, ...requests.all().map((r) => r.id)) + 1;
  const row = request(
    id,
    Number(b.hostId),
    DEMO_USER_ID,
    "demo",
    "pending",
    0,
    {
      hours: Number(b.hours) || 1,
      reason: b.reason || null,
      ticket: b.ticket || null,
    },
  );
  requests.insert(row);
  return { request: row };
});

const decide = (id: string, status: Status, comment?: string) => {
  const now = Date.now();
  const row = requests.find(id);
  requests.patch(id, {
    status,
    decidedByName: "demo",
    decidedAt: new Date(now).toISOString(),
    comment: comment || null,
    startsAt: status === "approved" ? new Date(now).toISOString() : null,
    expiresAt:
      status === "approved"
        ? new Date(now + (row?.hours ?? 1) * HOUR).toISOString()
        : null,
  });
  return { ok: true };
};

post(`${P}/requests/:id/approve`, (req) =>
  decide(
    req.params.id,
    "approved",
    (req.body as { comment?: string })?.comment,
  ),
);
post(`${P}/requests/:id/deny`, (req) =>
  decide(req.params.id, "denied", (req.body as { comment?: string })?.comment),
);
post(`${P}/requests/:id/end`, (req) => {
  requests.patch(req.params.id, {
    status: "revoked",
    endedAt: new Date().toISOString(),
  });
  return { ok: true };
});
get(`${P}/report.csv`, () => "id,host,user,status\n");
get(`${P}/summary`, () => {
  const all = requests.all();
  return {
    approver: true,
    pending: all.filter((r) => r.status === "pending").length,
    latest: all.slice(-5).reverse(),
    active: all.filter(isActive),
  };
});
