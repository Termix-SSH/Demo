import { del, get, post } from "../../router";
import { collection } from "../../store";

const P = "/plugin-api/session-sharing";

type Share = {
  id: string;
  hostId: number;
  ownerUserId: string;
  protocol: "ssh" | "rdp" | "vnc" | "telnet";
  sessionId: string;
  tabInstanceId: string | null;
  shareType: "link" | "user";
  targetUserId: string | null;
  linkToken: string | null;
  permissionLevel: "read-only" | "read-write";
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastJoinedAt: string | null;
  joinCount: number;
};

const shares = collection<Share>("session-shares", () => []);

const token = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");

post(`${P}/create`, (req) => {
  const body = req.body as Partial<Share> & { expiryHours?: number };
  const now = Date.now();
  const share: Share = {
    id: `share-${now}`,
    hostId: Number(body.hostId),
    ownerUserId: "demo-user",
    protocol: body.protocol ?? "ssh",
    sessionId: body.sessionId ?? "",
    tabInstanceId: body.tabInstanceId ?? null,
    shareType: body.shareType ?? "link",
    targetUserId: body.targetUserId ?? null,
    linkToken: body.shareType === "user" ? null : token(),
    permissionLevel: body.permissionLevel ?? "read-only",
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + (body.expiryHours ?? 24) * 3.6e6).toISOString(),
    revokedAt: null,
    lastJoinedAt: null,
    joinCount: 0,
  };
  shares.insert(share);
  return {
    shareId: share.id,
    linkToken: share.linkToken,
    expiresAt: share.expiresAt,
  };
});

get(`${P}/host/:hostId/active`, (req) => ({
  shares: shares
    .all()
    .filter((s) => String(s.hostId) === req.params.hostId && !s.revokedAt),
}));

get(`${P}/directory`, () => ({
  users: [
    { id: "user-alex", username: "alex" },
    { id: "user-sam", username: "sam" },
    { id: "user-jordan", username: "jordan" },
  ],
  roles: [
    { id: 2, name: "operators", displayName: "Operators" },
    { id: 3, name: "oncall", displayName: "On-call" },
  ],
}));

del(`${P}/:id`, (req) => {
  shares.patch(req.params.id, { revokedAt: new Date().toISOString() });
  return { success: true };
});
