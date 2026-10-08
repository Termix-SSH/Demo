import { DEMO_USER_ID } from "./hosts";

const now = Date.now();
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();
const ahead = (hours: number) =>
  new Date(now + hours * 3_600_000).toISOString();

export const DEMO_USERS = [
  {
    id: DEMO_USER_ID,
    username: "demo",
    is_admin: true,
    is_external: false,
    totp_enabled: false,
    second_factor_enabled: false,
    createdAt: ago(60 * 24 * 90),
    lastLoginAt: ago(1),
  },
  {
    id: "user-ana",
    username: "ana",
    is_admin: true,
    is_external: true,
    totp_enabled: true,
    second_factor_enabled: true,
    createdAt: ago(60 * 24 * 60),
    lastLoginAt: ago(60 * 3),
  },
  {
    id: "user-marco",
    username: "marco",
    is_admin: false,
    is_external: false,
    totp_enabled: true,
    second_factor_enabled: true,
    createdAt: ago(60 * 24 * 40),
    lastLoginAt: ago(60 * 26),
  },
  {
    id: "user-oncall",
    username: "oncall",
    is_admin: false,
    is_external: false,
    totp_enabled: false,
    second_factor_enabled: false,
    createdAt: ago(60 * 24 * 12),
    lastLoginAt: ago(60 * 24 * 4),
  },
];

export const DEMO_SESSIONS = [
  {
    id: "s-current",
    userId: DEMO_USER_ID,
    username: "demo",
    deviceType: "web",
    deviceInfo: "Chrome on Windows",
    createdAt: ago(2),
    expiresAt: ahead(24),
    lastActiveAt: ago(0),
    isCurrent: true,
    isCurrentSession: true,
  },
  {
    id: "s-desktop",
    userId: DEMO_USER_ID,
    username: "demo",
    deviceType: "desktop",
    deviceInfo: "Termix Desktop on macOS",
    createdAt: ago(60 * 20),
    expiresAt: ahead(140),
    lastActiveAt: ago(45),
    isCurrent: false,
  },
  {
    id: "s-ana",
    userId: "user-ana",
    username: "ana",
    deviceType: "web",
    deviceInfo: "Firefox on Linux",
    createdAt: ago(60 * 3),
    expiresAt: ahead(21),
    lastActiveAt: ago(12),
    isCurrent: false,
  },
  {
    id: "s-marco",
    userId: "user-marco",
    username: "marco",
    deviceType: "mobile",
    deviceInfo: "Termix on iOS",
    createdAt: ago(60 * 26),
    expiresAt: ahead(400),
    lastActiveAt: ago(60 * 5),
    isCurrent: false,
  },
];

export const DEMO_API_KEYS = [
  {
    id: 1,
    name: "CI deploys",
    userId: DEMO_USER_ID,
    username: "demo",
    tokenPrefix: "tmx_8f2a1c",
    createdAt: ago(60 * 24 * 30),
    expiresAt: null,
    lastUsedAt: ago(60 * 7),
    isActive: true,
  },
  {
    id: 2,
    name: "Grafana",
    userId: DEMO_USER_ID,
    username: "demo",
    tokenPrefix: "tmx_c41e90",
    createdAt: ago(60 * 24 * 9),
    expiresAt: ahead(24 * 80),
    lastUsedAt: ago(30),
    isActive: true,
  },
];
