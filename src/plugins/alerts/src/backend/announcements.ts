import { eq } from "drizzle-orm";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  isLive,
  parseAnnouncement,
  type Announcement,
} from "../announcements-schema.js";
import { ANNOUNCEMENT_SOURCE, type AlertItem } from "../types.js";
import type { AlertsRepository } from "./repository.js";

export const FEED_URL =
  "https://raw.githubusercontent.com/Termix-SSH/Plugin-Alerts/main/announcements.json";
export const REFRESH_MS = 30 * 60 * 1000;
const ANNOUNCEMENT_CATEGORY = "termix.announcement";

export function parseFeed(raw: unknown): Announcement[] {
  if (!Array.isArray(raw)) return [];
  const feed: Announcement[] = [];
  for (const entry of raw) {
    const result = parseAnnouncement(entry);
    if (result.announcement) feed.push(result.announcement);
  }
  return feed;
}

interface Recipient {
  registeredAt: number | null;
  isAdmin: boolean;
}

/** Whether this user should get the announcement at all. */
export function reaches(entry: Announcement, user: Recipient | null): boolean {
  if (!user) return entry.audience === "everyone";
  if (entry.audience === "admins" && !user.isAdmin) return false;
  if (entry.newUsers || user.registeredAt === null) return true;
  return Date.parse(entry.date) >= user.registeredAt;
}

/** SQLite's CURRENT_TIMESTAMP has no zone and means UTC. */
export function parseTimestamp(raw: unknown): number | null {
  const time =
    raw instanceof Date
      ? raw.getTime()
      : typeof raw === "string"
        ? Date.parse(
            /(z|[+-]\d\d:?\d\d)$/i.test(raw)
              ? raw
              : `${raw.trim().replace(" ", "T")}Z`,
          )
        : NaN;
  return Number.isFinite(time) ? time : null;
}

const dedupeKey = (id: string) => `announcement:${id}`;

/**
 * Termix announcements from this plugin's repo, brought into each user's
 * inbox the first time they look after one goes live. A user only gets the
 * ones published after they signed up, unless an announcement says
 * otherwise. A user who deletes one never gets it back.
 */
export function createAnnouncements(
  ctx: PluginContext,
  repository: AlertsRepository,
  options: {
    /** Called with what a sync added, so open apps hear about it. */
    onAdded?: (userId: string, items: AlertItem[]) => Promise<void> | void;
  } = {},
) {
  let feed: Announcement[] = [];
  let fetchedAt = 0;
  let refreshing: Promise<void> | null = null;
  const syncing = new Map<string, Promise<AlertItem[]>>();
  const recipients = new Map<string, Recipient | null>();

  async function enabled(): Promise<boolean> {
    return (await ctx.settings.get<boolean>("announcements")) !== false;
  }

  async function refresh(): Promise<void> {
    if (refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const response = await ctx.fetch(FEED_URL, {
          headers: {
            Accept: "application/json",
            "User-Agent": "TermixAlertChecker/1.0",
          },
          timeoutMs: 15_000,
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        feed = parseFeed(await response.json());
      } catch (error) {
        ctx.log.warn(
          `Could not fetch Termix announcements: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        fetchedAt = Date.now();
        recipients.clear();
        refreshing = null;
      }
    })();
    return refreshing;
  }

  async function current(): Promise<Announcement[]> {
    if (!(await enabled())) return [];
    if (Date.now() - fetchedAt > REFRESH_MS) await refresh();
    const now = Date.now();
    return feed.filter((entry) => isLive(entry, now));
  }

  async function recipient(userId: string): Promise<Recipient | null> {
    if (recipients.has(userId)) return recipients.get(userId)!;
    let found: Recipient | null = null;
    // A failed lookup throws, so the sync is skipped rather than handing the
    // user every old announcement as if they had no signup date.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { users } = await ctx.db.refs<{ users: any }>();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const drizzle = await ctx.db.client<any>();
    const rows = await drizzle
      .select({ registeredAt: users.registeredAt, isAdmin: users.isAdmin })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (rows[0]) {
      found = {
        registeredAt: parseTimestamp(rows[0].registeredAt),
        isAdmin: Boolean(rows[0].isAdmin),
      };
    }
    recipients.set(userId, found);
    return found;
  }

  async function syncUser(userId: string): Promise<AlertItem[]> {
    const added: AlertItem[] = [];
    const active = await current();
    if (active.length === 0) return added;
    const user = await recipient(userId);
    const dismissed = await repository.dismissedIds(userId);
    for (const entry of active) {
      if (!reaches(entry, user)) continue;
      if (dismissed.has(entry.id)) continue;
      if (await repository.hasItemWithKey(userId, dedupeKey(entry.id))) {
        continue;
      }
      const firstUrl = entry.actions.find((action) => action.url)?.url;
      added.push(
        await repository.insertItem({
          userId,
          source: ANNOUNCEMENT_SOURCE,
          category: ANNOUNCEMENT_CATEGORY,
          severity: entry.severity,
          title: entry.title,
          body: entry.body || null,
          link: firstUrl ? { url: firstUrl } : null,
          context: {
            announcementId: entry.id,
            actions: entry.actions,
            display: entry.display,
          },
          dedupeKey: dedupeKey(entry.id),
        }),
      );
    }
    return added;
  }

  return {
    refresh,

    /** Adds any announcement the user has not seen yet. Returns what was added. */
    sync(userId: string): Promise<AlertItem[]> {
      const running = syncing.get(userId);
      if (running) return running;
      const run = syncUser(userId)
        .then(async (added) => {
          if (added.length > 0) await options.onAdded?.(userId, added);
          return added;
        })
        .catch((error) => {
          ctx.log.warn(
            `Could not add announcements to the inbox: ${error instanceof Error ? error.message : String(error)}`,
          );
          return [] as AlertItem[];
        })
        .finally(() => syncing.delete(userId));
      syncing.set(userId, run);
      return run;
    },

    /** Remembers that the user removed an announcement from their inbox. */
    async forget(userId: string, item: AlertItem): Promise<void> {
      const id = item.context?.announcementId;
      if (item.source === ANNOUNCEMENT_SOURCE && typeof id === "string") {
        await repository.dismiss(userId, id);
      }
    },
  };
}

export type Announcements = ReturnType<typeof createAnnouncements>;
