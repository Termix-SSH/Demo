import QRCode from "qrcode";
import { del, get, HttpError, post } from "../../router";
import { collection, value } from "../../store";
import { socket } from "../../sockets";
import { isRecording } from "../../recording";

// Small plugins whose screens only need a few answers to look alive.

// TOTP: any six digits are accepted.
const totp = value("totp-enrolled", () => false);
const SECRET = "JBSWY3DPEHPK3PXP";
get("/plugin-api/totp/status", () => ({ enabled: totp.get() }));
post("/plugin-api/totp/setup", async () => ({
  secret: SECRET,
  qr_code: await QRCode.toDataURL(
    `otpauth://totp/Termix%20Demo:demo?secret=${SECRET}&issuer=Termix%20Demo`,
  ),
}));
post("/plugin-api/totp/enable", (req) => {
  const code = String(
    (req.body as { totp_code?: string; code?: string })?.totp_code ??
      (req.body as { code?: string })?.code ??
      "",
  );
  if (!/^\d{6}$/.test(code))
    throw new HttpError(401, { error: "Invalid TOTP code" });
  totp.set(true);
  return {
    message: "TOTP enabled successfully",
    backup_codes: [
      "8F2A-1C9E",
      "4D77-B0A2",
      "91C3-5E68",
      "0B4F-D21A",
      "7E19-AC03",
      "C5D0-3F84",
    ],
  };
});
post("/plugin-api/totp/disable", () => {
  totp.set(false);
  return { message: "TOTP disabled successfully" };
});
post("/plugin-api/totp/backup-codes", () => ({
  backup_codes: [
    "2A6B-91DE",
    "F0C3-7B21",
    "58E4-0A9F",
    "D7B1-C366",
    "3C08-E5A4",
    "A91F-24D7",
  ],
}));

// Passkeys: one saved key so the list is not empty.
const passkeys = collection("passkeys", () => [
  {
    id: 1,
    name: "YubiKey 5C",
    deviceType: "multiDevice",
    backedUp: false,
    transports: ["usb", "nfc"],
    createdAt: new Date(Date.now() - 50 * 864e5).toISOString(),
    lastUsedAt: new Date(Date.now() - 2 * 864e5).toISOString(),
  },
]);
get("/plugin-api/webauthn/credentials", () => ({
  credentials: passkeys.all(),
}));
del("/plugin-api/webauthn/credentials/:id", (req) => {
  passkeys.remove(req.params.id);
  return { success: true };
});
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

// Recordings use a virtual authenticator, so adding a key works there. The
// public demo would save a real passkey on the visitor's device, so not there.
post("/plugin-api/webauthn/register/options", (req) => {
  if (!isRecording()) {
    throw new HttpError(400, {
      error: "Passkeys cannot be added in the demo.",
    });
  }
  const { userVerification } = (req.body ?? {}) as {
    userVerification?: string;
  };
  return {
    challengeId: `challenge-${Date.now()}`,
    options: {
      challenge: b64url(crypto.getRandomValues(new Uint8Array(32))),
      rp: { name: "Termix", id: location.hostname },
      user: {
        id: b64url(new TextEncoder().encode("demo-user")),
        name: "demo",
        displayName: "demo",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      timeout: 60000,
      attestation: "none",
      excludeCredentials: [],
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: userVerification ?? "preferred",
      },
    },
  };
});
post("/plugin-api/webauthn/register/verify", (req) => {
  const { name } = (req.body ?? {}) as { name?: string };
  passkeys.insert({
    id: passkeys.nextId(),
    name: name || "Passkey",
    deviceType: "singleDevice",
    backedUp: false,
    transports: ["usb"],
    createdAt: new Date().toISOString(),
    lastUsedAt: new Date().toISOString(),
  });
  return { success: true };
});

// Telemetry is off in the demo.
get("/plugin-api/telemetry/usage/config", () => ({ track: false }));
get("/plugin-api/telemetry/status", () => ({
  enabled: false,
  locked: false,
  instanceId: null,
  lastSentAt: null,
  lastAttemptAt: null,
  lastError: null,
  nextDueAt: null,
}));

// Session sharing: one standing room to show off the meetings list.
const rooms = collection("collab-rooms", () => [
  {
    id: "room-ops",
    name: "Ops standup",
    ownerUserId: "demo-user",
    persistent: true,
    presenterUserId: null,
    stageProtocol: null,
    stageHostId: null,
    stageShareId: null,
    guestLinkEnabled: false,
    createdAt: new Date(Date.now() - 6 * 864e5).toISOString(),
    endedAt: null,
  },
]);
get("/plugin-api/session-sharing/rooms", () => ({ rooms: rooms.all() }));
post("/plugin-api/session-sharing/rooms", (req) => {
  const body = req.body as { name: string; persistent?: boolean };
  const room = {
    id: `room-${Date.now()}`,
    name: body.name,
    ownerUserId: "demo-user",
    persistent: !!body.persistent,
    presenterUserId: null,
    stageProtocol: null,
    stageHostId: null,
    stageShareId: null,
    guestLinkEnabled: false,
    createdAt: new Date().toISOString(),
    endedAt: null,
  };
  rooms.insert(room);
  return { room };
});
// alex is presenting a web-01 terminal, which the terminal route plays out.
const DEMO_STAGE = {
  presenterUserId: "user-alex",
  protocol: "ssh",
  hostId: 1,
  shareId: "demo-share-1",
  sessionId: "demo-shared-session",
  controllerUserId: "user-alex",
};

del("/plugin-api/session-sharing/rooms/:id", (req) => {
  rooms.remove(req.params.id);
  return { success: true };
});
get("/plugin-api/session-sharing/rooms/:id", (req) => {
  const room = rooms.find(req.params.id);
  if (!room) throw new HttpError(404, { error: "Room not found" });
  const since = (days: number) =>
    new Date(Date.now() - days * 864e5).toISOString();
  return {
    room,
    me: "demo-user",
    isHost: true,
    members: [
      {
        userId: "demo-user",
        username: "demo",
        roomRole: "owner",
        createdAt: room.createdAt,
      },
      {
        userId: "user-alex",
        username: "alex",
        roomRole: "member",
        createdAt: since(5),
      },
      {
        userId: "user-sam",
        username: "sam",
        roomRole: "member",
        createdAt: since(4),
      },
      {
        userId: "user-jordan",
        username: "jordan",
        roomRole: "member",
        createdAt: since(2),
      },
    ],
    online: [
      { userId: "demo-user", username: "demo" },
      { userId: "user-alex", username: "alex" },
      { userId: "user-sam", username: "sam" },
    ],
    stage: DEMO_STAGE,
    guests: [],
    controllerUserId: null,
    controlRequests: [],
    eventsWsPath: `/plugin-ws/session-sharing/rooms/${room.id}/events`,
  };
});
get("/plugin-api/session-sharing/rooms/:id/stage", () => ({
  stage: DEMO_STAGE,
}));
get("/plugin-api/session-sharing/rooms/:id/control/requests", () => ({
  requests: [],
}));
// Room events: nothing happens in the demo, so the socket just stays open.
socket("/plugin-ws/session-sharing/rooms/:id/events", () => {});

get("/plugin-api/session-sharing/shared-with-me", () => []);
