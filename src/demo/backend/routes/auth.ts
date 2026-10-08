import { del, get, HttpError, patch, post } from "../router";
import { collection, value } from "../store";
import { DEMO_USER_ID } from "../../fixtures/hosts";
import { DEMO_USERS, DEMO_SESSIONS, DEMO_API_KEYS } from "../../fixtures/users";

/**
 * Any username and password signs in. The account is always the admin, so
 * every page of the app is reachable.
 */

export const session = value<{ username: string } | null>(
  "session",
  () => null,
);
export const users = collection("users", () => DEMO_USERS);
export const sessions = collection("sessions", () => DEMO_SESSIONS);
export const apiKeys = collection("api-keys", () => DEMO_API_KEYS);
export const instanceSettings = value("instance-settings", () => ({
  registrationAllowed: true,
  passwordLoginAllowed: true,
  passwordResetAllowed: true,
  externalAutoProvision: true,
  secondFactorAfterExternalLogin: false,
  sessionTimeoutHours: 24,
  logLevel: "info",
  notificationPrivateEndpoints: [] as string[],
  donationDismissed: false,
}));

export function requireSession(): { username: string } {
  const current = session.get();
  if (!current) {
    throw new HttpError(401, {
      error: "Authentication required",
      code: "AUTH_REQUIRED",
    });
  }
  return current;
}

export function currentUsername(): string {
  return session.get()?.username ?? "demo";
}

function signIn(username: string) {
  const name = username.trim() || "demo";
  session.set({ username: name });
  users.patch(DEMO_USER_ID, { username: name });
  return {
    success: true,
    is_admin: true,
    username: name,
    userId: DEMO_USER_ID,
    is_external: false,
    totp_enabled: false,
    requires_totp: false,
    rememberMe: true,
  };
}

post("/users/login", (req) => {
  const { username } = (req.body ?? {}) as { username?: string };
  return signIn(username ?? "demo");
});
post("/users/create", (req) => {
  const { username } = (req.body ?? {}) as { username?: string };
  return { ...signIn(username ?? "demo"), message: "User created" };
});
post("/users/logout", () => {
  session.set(null);
  return { success: true, message: "Logged out" };
});
post("/users/proxy-login", () => ({ enabled: false }));
post("/users/internal/auto-session", () => {
  throw new HttpError(403, { error: "Not a desktop" });
});

get("/users/me", () => {
  const { username } = requireSession();
  return {
    userId: DEMO_USER_ID,
    username,
    is_admin: true,
    is_external: false,
    is_dual_auth: false,
    totp_enabled: false,
    data_unlocked: true,
    show_donation_modal: false,
    linked: null,
  };
});
get("/users/me/token", () => ({ token: "demo-token" }));
post("/users/me/dismiss-donation-modal", () => {
  instanceSettings.update((s) => ({ ...s, donationDismissed: true }));
});
post("/users/unlock-data", () => ({ success: true, message: "Unlocked" }));

get("/users/setup-required", () => ({ setup_required: false }));
get("/users/count", () => ({ count: users.all().length }));
get("/users/auth/methods", () => ({
  methods: [
    {
      id: "demo-hint",
      pluginId: "termix-demo",
      kind: "form",
      labelKey: "loginHint",
      instances: [],
    },
  ],
}));
get("/users/db-health", () => ({ status: "healthy" }));

function setting<K extends keyof ReturnType<typeof instanceSettings.get>>(
  path: string,
  key: K,
  shape: (v: ReturnType<typeof instanceSettings.get>[K]) => unknown,
  bodyKey = "allowed",
) {
  get(path, () => shape(instanceSettings.get()[key]));
  patch(path, (req) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    instanceSettings.update((s) => ({ ...s, [key]: body[bodyKey] }));
    return shape(instanceSettings.get()[key]);
  });
}

setting("/users/registration-allowed", "registrationAllowed", (allowed) => ({
  allowed,
}));
setting("/users/password-login-allowed", "passwordLoginAllowed", (allowed) => ({
  allowed,
  forced: false,
}));
setting("/users/password-reset-allowed", "passwordResetAllowed", (allowed) => ({
  allowed,
}));
setting(
  "/users/external-auto-provision",
  "externalAutoProvision",
  (enabled) => ({ enabled }),
  "enabled",
);
setting(
  "/users/second-factor-after-external-login",
  "secondFactorAfterExternalLogin",
  (enabled) => ({ enabled }),
  "enabled",
);
setting(
  "/users/session-timeout",
  "sessionTimeoutHours",
  (hours) => ({ hours, timeoutHours: hours }),
  "hours",
);
setting("/users/log-level", "logLevel", (level) => ({ level }), "level");
setting(
  "/users/notification-private-endpoints",
  "notificationPrivateEndpoints",
  (hosts) => ({ hosts }),
  "hosts",
);

post("/users/change-password", () => ({ success: true }));
post("/users/initiate-reset", () => ({ success: true }));
post("/users/verify-reset-code", () => ({ success: true, tempToken: "demo" }));
post("/users/complete-reset", () => ({ success: true }));

get("/users/list", (req) => {
  let list = users.all().map((u) => ({
    ...u,
    userId: u.id,
    username: u.id === DEMO_USER_ID ? currentUsername() : u.username,
    password_hash: u.is_external ? "" : "set",
    data_unlocked: true,
  }));
  const search = (req.query.search ?? "").toLowerCase();
  if (search)
    list = list.filter((u) => u.username.toLowerCase().includes(search));
  const total = list.length;
  const offset = Number(req.query.offset) || 0;
  const limit = Number(req.query.limit) || total;
  return { users: list.slice(offset, offset + limit), total };
});
post("/users/admin-create", (req) => {
  const { username } = (req.body ?? {}) as { username: string };
  const user = users.insert({
    id: `user-${Date.now()}`,
    username,
    is_admin: false,
    is_external: false,
    totp_enabled: false,
    second_factor_enabled: false,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  });
  return { success: true, user };
});
post("/users/make-admin", (req) => {
  const { username } = req.body as { username: string };
  const user = users.all().find((u) => u.username === username);
  if (user) users.patch(user.id, { is_admin: true });
});
post("/users/remove-admin", (req) => {
  const { username } = req.body as { username: string };
  const user = users.all().find((u) => u.username === username);
  if (user) users.patch(user.id, { is_admin: false });
});
del("/users/delete-user", (req) => {
  const { username, userId } = (req.body ?? {}) as {
    username?: string;
    userId?: string;
  };
  const user = users
    .all()
    .find((u) => u.id === userId || u.username === username);
  if (user && user.id !== DEMO_USER_ID) users.remove(user.id);
});
del("/users/delete-account", () => {
  throw new HttpError(400, {
    error: "The demo account cannot be deleted. Use Reset demo instead.",
  });
});
post("/users/admin/reset-password", () => ({ success: true }));

get("/users/sessions", () => ({ sessions: sessions.all() }));
del("/users/sessions/:id", (req) => sessions.remove(req.params.id));
post("/users/sessions/revoke-all", () => {
  sessions.replace(sessions.all().filter((s) => s.isCurrent));
});

get("/users/api-keys", () => ({ apiKeys: apiKeys.all() }));
post("/users/api-keys", (req) => {
  const body = (req.body ?? {}) as { name?: string; expiresAt?: string };
  const id = apiKeys.nextId();
  const key = {
    id,
    name: body.name || "API key",
    userId: DEMO_USER_ID,
    username: currentUsername(),
    tokenPrefix: `tmx_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
    expiresAt: body.expiresAt ?? null,
    lastUsedAt: null,
    isActive: true,
  };
  apiKeys.insert(key);
  return {
    ...key,
    token: `${key.tokenPrefix}_demo_only_not_a_real_key`,
  };
});
del("/users/api-keys/:id", (req) => apiKeys.remove(req.params.id));
