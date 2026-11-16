import { createHash } from "node:crypto";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

const MAX_DEVICES = 30;
// Only rewrite a known device's last seen time this often.
const TOUCH_MS = 60 * 60 * 1000;

export interface LoginEventDetails {
  username?: string;
  ipAddress?: string;
  methodId?: string;
  deviceType?: string;
  deviceInfo?: string;
  restricted?: boolean;
}

interface KnownDevice {
  key: string;
  firstSeen: string;
  lastSeen: string;
}

/** A device is the app type plus browser and system, never the address. */
export function deviceKey(details: LoginEventDetails): string {
  return createHash("sha256")
    .update(`${details.deviceType ?? ""}|${details.deviceInfo ?? ""}`)
    .digest("hex");
}

function storeKey(userId: string): string {
  return `devices:${userId}`;
}

function readDevices(value: unknown): KnownDevice[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is KnownDevice =>
          !!item &&
          typeof item.key === "string" &&
          typeof item.firstSeen === "string" &&
          typeof item.lastSeen === "string",
      )
    : [];
}

/**
 * Remembers the device a user signed in from, and tells them when it is new.
 * The very first sign in after install only records, so nobody gets a notice
 * for the device they always use.
 */
export async function noteLogin(
  ctx: PluginContext,
  userId: string,
  details: LoginEventDetails,
  options: { enabled: boolean; now?: Date },
): Promise<"new" | "known" | "first"> {
  const now = options.now ?? new Date();
  const key = deviceKey(details);
  const devices = readDevices(await ctx.kv.get(storeKey(userId)));
  const known = devices.find((device) => device.key === key);

  if (known) {
    if (now.getTime() - Date.parse(known.lastSeen) > TOUCH_MS) {
      known.lastSeen = now.toISOString();
      await ctx.kv.set(storeKey(userId), devices);
    }
    return "known";
  }

  const first = devices.length === 0;
  const next = [
    { key, firstSeen: now.toISOString(), lastSeen: now.toISOString() },
    ...devices,
  ]
    .sort((a, b) => b.lastSeen.localeCompare(a.lastSeen))
    .slice(0, MAX_DEVICES);
  await ctx.kv.set(storeKey(userId), next);
  if (first) return "first";

  if (options.enabled && (await wantsNotice(ctx, userId))) {
    await ctx.notify.send({
      title: "New sign in to your account",
      body: `Someone signed in as ${details.username ?? "you"} from a device not seen before: ${
        details.deviceInfo || details.deviceType || "unknown device"
      }, address ${details.ipAddress || "unknown"}. If this was not you, change your password and sign out every session in Sessions and keys.`,
      severity: "warning",
      category: "login-security.new_device",
      audience: { userId },
    });
  }
  return "new";
}

async function wantsNotice(
  ctx: PluginContext,
  userId: string,
): Promise<boolean> {
  return (
    (await ctx.settings.getUser<boolean>(userId, "newDeviceNotice")) !== false
  );
}

/** Forgets a user's devices, so the next sign in counts as their first. */
export async function forgetDevices(
  ctx: PluginContext,
  userId: string,
): Promise<void> {
  await ctx.kv.delete(storeKey(userId));
}
