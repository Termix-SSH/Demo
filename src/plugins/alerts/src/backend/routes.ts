import type { Request, Response, Router } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import {
  CHANNEL_TYPES,
  CREATABLE_CHANNEL_TYPES,
  isSeverity,
  type AlertRule,
  type ChannelType,
  type MobileDevice,
  type PushPlatform,
  type Severity,
} from "../types.js";
import type { Announcements } from "./announcements.js";
import { deliverToChannels } from "./hub.js";
import type { AlertsRepository } from "./repository.js";
import { validateChannelConfig, type SenderDeps } from "./senders.js";
import { maskConfig, mergeConfig } from "./channel-secrets.js";
import type { ChannelDetail } from "../types.js";

import type { AlertStream } from "./stream.js";

function forBrowser(channel: ChannelDetail | null) {
  if (!channel) return channel;
  const { config, saved, hints } = maskConfig(channel.type, channel.config);
  return { ...channel, config, saved, hints };
}

interface RouteDeps {
  ctx: PluginContext;
  repository: AlertsRepository;
  stream: AlertStream;
  senders: SenderDeps;
  announcements: Announcements;
}

function actor(ctx: PluginContext): string {
  // Core's plugin router authenticates every request and runs it as that user.
  return ctx.currentActor() as string;
}

function positiveInt(value: unknown): number | null {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function isChannelType(value: unknown): value is ChannelType {
  return (CHANNEL_TYPES as readonly string[]).includes(String(value));
}

const INSTALL_ID = /^[A-Za-z0-9_-]{8,64}$/;

const running = new Map<string, Promise<unknown>>();

/** Runs jobs with the same key one after another. */
function oneAtATime<T>(key: string, job: () => Promise<T>): Promise<T> {
  const before = running.get(key) ?? Promise.resolve();
  const next = before.catch(() => undefined).then(job);
  running.set(key, next);
  void next
    .catch(() => undefined)
    .finally(() => {
      if (running.get(key) === next) running.delete(key);
    });
  return next;
}
const ACCOUNT_KEY = /^[A-Za-z0-9._:-]{1,64}$/;

function idList(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(positiveInt).filter((id): id is number => id !== null)
    : [];
}

export function registerRoutes(router: Router, deps: RouteDeps): void {
  const { ctx, repository, stream, senders, announcements } = deps;

  router.use(ctx.rbac.require("use") as never);

  const publishUnread = async (userId: string) => {
    stream.publish(userId, "unread", {
      count: await repository.unreadCount(userId),
    });
  };

  /**
   * @openapi
   * /plugin-api/alerts/items:
   *   get:
   *     summary: List the caller's alerts
   *     description: Newest first. Brings in any Termix announcement the caller has not seen yet.
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: query
   *         name: unread
   *         schema:
   *           type: boolean
   *       - in: query
   *         name: source
   *         schema:
   *           type: string
   *       - in: query
   *         name: severity
   *         schema:
   *           type: string
   *           enum: [info, success, warning, critical]
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *       - in: query
   *         name: before
   *         description: Only alerts with a lower id, for paging.
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The alerts and the unread count.
   *       403:
   *         description: Missing the alerts.use permission.
   */
  router.get("/items", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    await announcements.sync(userId);
    const severity = isSeverity(req.query.severity)
      ? req.query.severity
      : undefined;
    const items = await repository.listItems(userId, {
      unread: req.query.unread === "true",
      source: typeof req.query.source === "string" ? req.query.source : "",
      severity,
      limit: positiveInt(req.query.limit) ?? 50,
      beforeId: positiveInt(req.query.before) ?? undefined,
    });
    res.json({ items, unread: await repository.unreadCount(userId) });
  });

  /**
   * @openapi
   * /plugin-api/alerts/unread:
   *   get:
   *     summary: Count the caller's unread alerts
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: The unread count.
   */
  router.get("/unread", async (_req: Request, res: Response) => {
    const userId = actor(ctx);
    await announcements.sync(userId);
    res.json({ count: await repository.unreadCount(userId) });
  });

  /**
   * @openapi
   * /plugin-api/alerts/stream:
   *   get:
   *     summary: Stream new alerts
   *     description: Server-sent events. Sends "unread" with the count on connect and after every change, and "item" with each new or updated alert.
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: An event stream.
   */
  router.get("/stream", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    stream.open(req, res, userId, {
      count: await repository.unreadCount(userId),
    });
    // After opening, so what it adds reaches this app as new alerts.
    await announcements.sync(userId);
  });

  /**
   * @openapi
   * /plugin-api/alerts/items/read:
   *   post:
   *     summary: Mark alerts read or unread
   *     tags:
   *       - Alerts
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               ids:
   *                 type: array
   *                 items:
   *                   type: integer
   *               all:
   *                 type: boolean
   *               read:
   *                 type: boolean
   *                 description: False marks them unread. Defaults to true.
   *     responses:
   *       200:
   *         description: The new unread count.
   */
  router.post("/items/read", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const read = body.read !== false;
    await repository.setRead(
      userId,
      body.all === true ? "all" : idList(body.ids),
      read,
    );
    await publishUnread(userId);
    res.json({ count: await repository.unreadCount(userId) });
  });

  /**
   * @openapi
   * /plugin-api/alerts/items/{id}:
   *   delete:
   *     summary: Delete an alert
   *     description: A deleted Termix announcement does not come back.
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   *       404:
   *         description: No such alert for the caller.
   */
  router.delete("/items/:id", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const id = positiveInt(req.params.id);
    const item = id ? await repository.deleteItem(userId, id) : null;
    if (!item) return res.status(404).json({ error: "Alert not found" });
    await announcements.forget(userId, item);
    await publishUnread(userId);
    res.json({ success: true });
  });

  /**
   * @openapi
   * /plugin-api/alerts/items:
   *   delete:
   *     summary: Clear the caller's alerts
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: query
   *         name: read
   *         description: Only clear alerts already read.
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: How many alerts were removed.
   */
  router.delete("/items", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const removed = await repository.clearItems(
      userId,
      req.query.read === "true",
    );
    for (const item of removed) await announcements.forget(userId, item);
    await publishUnread(userId);
    res.json({ removed: removed.length });
  });

  /**
   * @openapi
   * /plugin-api/alerts/categories:
   *   get:
   *     summary: List the sources and categories of the caller's alerts
   *     description: For building delivery rules.
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: Source and category pairs.
   */
  router.get("/categories", async (_req: Request, res: Response) => {
    res.json(await repository.listCategories(actor(ctx)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/meta:
   *   get:
   *     summary: What channel types this server can use
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: The channel types and whether email is set up.
   */
  router.get("/meta", async (_req: Request, res: Response) => {
    res.json({
      emailAvailable: (await senders.smtp()) !== null,
      channelTypes: CREATABLE_CHANNEL_TYPES,
    });
  });

  /**
   * @openapi
   * /plugin-api/alerts/channels:
   *   get:
   *     summary: List the caller's channels
   *     description: Without their config.
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: The channels.
   */
  router.get("/channels", async (_req: Request, res: Response) => {
    res.json(await repository.listChannels(actor(ctx)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/channels/{id}:
   *   get:
   *     summary: Get one of the caller's channels with its config
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The channel.
   *       404:
   *         description: No such channel for the caller.
   */
  router.get("/channels/:id", async (req: Request, res: Response) => {
    const id = positiveInt(req.params.id);
    const channel = id ? await repository.getChannel(actor(ctx), id) : null;
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    res.json(forBrowser(channel));
  });

  const readChannel = (
    body: Record<string, unknown>,
    partial: boolean,
  ):
    | { error: string }
    | {
        name?: string;
        type?: ChannelType;
        config?: Record<string, unknown>;
        enabled?: boolean;
      } => {
    const out: {
      name?: string;
      type?: ChannelType;
      config?: Record<string, unknown>;
      enabled?: boolean;
    } = {};
    if (body.name !== undefined || !partial) {
      const name = typeof body.name === "string" ? body.name.trim() : "";
      if (!name) return { error: "name is required" };
      out.name = name.slice(0, 100);
    }
    if (body.type !== undefined || !partial) {
      // Mobile channels come only from the device routes.
      if (!isChannelType(body.type) || (!partial && body.type === "mobile")) {
        return {
          error: `type must be one of ${CREATABLE_CHANNEL_TYPES.join(", ")}`,
        };
      }
      out.type = body.type;
    }
    if (body.config !== undefined || !partial) {
      if (
        !body.config ||
        typeof body.config !== "object" ||
        Array.isArray(body.config)
      ) {
        return { error: "config is required" };
      }
      out.config = body.config as Record<string, unknown>;
    }
    if (body.enabled !== undefined) out.enabled = body.enabled !== false;
    return out;
  };

  /**
   * @openapi
   * /plugin-api/alerts/channels:
   *   post:
   *     summary: Create a channel
   *     tags:
   *       - Alerts
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, type, config]
   *             properties:
   *               name:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [webhook, ntfy, discord, telegram, slack, teams, gotify, pushover, matrix, email]
   *               config:
   *                 type: object
   *               enabled:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: The new channel.
   *       400:
   *         description: The channel is not valid.
   */
  router.post("/channels", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const input = readChannel(
      (req.body ?? {}) as Record<string, unknown>,
      false,
    );
    if ("error" in input) return res.status(400).json(input);
    const problem = validateChannelConfig(input.type!, input.config!);
    if (problem) return res.status(400).json({ error: problem });
    const id = await repository.createChannel(userId, {
      name: input.name!,
      type: input.type!,
      config: input.config!,
      enabled: input.enabled,
    });
    res.status(201).json(forBrowser(await repository.getChannel(userId, id)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/channels/{id}:
   *   put:
   *     summary: Update a channel
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     requestBody:
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name:
   *                 type: string
   *               type:
   *                 type: string
   *                 enum: [webhook, ntfy, discord, telegram, slack, teams, gotify, pushover, matrix, email]
   *               config:
   *                 type: object
   *               enabled:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: The updated channel.
   *       400:
   *         description: The channel is not valid.
   *       404:
   *         description: No such channel for the caller.
   */
  router.put("/channels/:id", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const id = positiveInt(req.params.id);
    const existing = id ? await repository.getChannel(userId, id) : null;
    if (!id || !existing) {
      return res.status(404).json({ error: "Channel not found" });
    }
    const input = readChannel(
      (req.body ?? {}) as Record<string, unknown>,
      true,
    );
    if ("error" in input) return res.status(400).json(input);
    const type = input.type ?? existing.type;
    if ((type === "mobile") !== (existing.type === "mobile")) {
      return res
        .status(400)
        .json({ error: "A mobile channel can not change type" });
    }
    if (input.config !== undefined) {
      input.config = mergeConfig(
        type,
        input.config,
        existing.type,
        existing.config,
      );
    }
    if (input.config !== undefined || input.type !== undefined) {
      const problem = validateChannelConfig(
        type,
        input.config ?? existing.config,
      );
      if (problem) return res.status(400).json({ error: problem });
    }
    await repository.updateChannel(userId, id, input);
    res.json(forBrowser(await repository.getChannel(userId, id)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/channels/{id}:
   *   delete:
   *     summary: Delete a channel
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   *       404:
   *         description: No such channel for the caller.
   */
  router.delete("/channels/:id", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const id = positiveInt(req.params.id);
    const existing = id ? await repository.getChannel(userId, id) : null;
    if (!id || !existing) {
      return res.status(404).json({ error: "Channel not found" });
    }
    const ruleId = positiveInt(existing.config.ruleId);
    if (existing.type === "mobile" && ruleId) {
      await repository.deleteRule(userId, ruleId);
    }
    await repository.deleteChannel(userId, id);
    res.json({ success: true });
  });

  /**
   * @openapi
   * /plugin-api/alerts/channels/{id}/test:
   *   post:
   *     summary: Send a test alert to a channel
   *     description: Takes the same path a real alert does, private network opt-in included.
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Whether the channel accepted it, with the error when it did not.
   *       404:
   *         description: No such channel for the caller.
   */
  router.post("/channels/:id/test", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const id = positiveInt(req.params.id);
    const channel = id
      ? (await repository.deliverableChannels(userId)).find(
          (candidate) => candidate.id === id,
        )
      : undefined;
    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const [result] = await deliverToChannels(
      [channel],
      {
        title: "Termix",
        body: "This is a test alert from Termix.",
        severity: "info",
        category: "alerts.test",
        source: ctx.pluginId,
        context: { sourceName: "Test", triggerType: "test" },
      },
      senders,
      async (channelId) => {
        await repository.updateChannel(userId, channelId, { enabled: false });
      },
    );
    res.json(
      result.ok ? { success: true } : { success: false, error: result.error },
    );
  });

  const readRule = async (
    userId: string,
    body: Record<string, unknown>,
  ): Promise<{ error: string } | Omit<AlertRule, "id">> => {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return { error: "name is required" };
    const match =
      typeof body.match === "string" && body.match.trim()
        ? body.match.trim().slice(0, 128)
        : "*";
    const minSeverity = isSeverity(body.minSeverity)
      ? body.minSeverity
      : "warning";
    const owned = new Set(
      (await repository.listChannels(userId)).map((channel) => channel.id),
    );
    const channelIds = [...new Set(idList(body.channelIds))];
    if (channelIds.length === 0) {
      return { error: "Pick at least one channel" };
    }
    if (channelIds.some((id) => !owned.has(id))) {
      return { error: "Unknown channel" };
    }
    return {
      name: name.slice(0, 100),
      match,
      minSeverity,
      channelIds,
      enabled: body.enabled !== false,
    };
  };

  /**
   * @openapi
   * /plugin-api/alerts/rules:
   *   get:
   *     summary: List the caller's delivery rules
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: The rules.
   */
  router.get("/rules", async (_req: Request, res: Response) => {
    res.json(await repository.listRules(actor(ctx)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/rules:
   *   post:
   *     summary: Create a delivery rule
   *     description: Sends every alert whose category matches and whose severity is at least minSeverity to the listed channels.
   *     tags:
   *       - Alerts
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, channelIds]
   *             properties:
   *               name:
   *                 type: string
   *               match:
   *                 type: string
   *                 description: '"*", "automations.*" or an exact category.'
   *               minSeverity:
   *                 type: string
   *                 enum: [info, success, warning, critical]
   *               channelIds:
   *                 type: array
   *                 items:
   *                   type: integer
   *               enabled:
   *                 type: boolean
   *     responses:
   *       201:
   *         description: The new rule.
   *       400:
   *         description: The rule is not valid.
   */
  router.post("/rules", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const input = await readRule(
      userId,
      (req.body ?? {}) as Record<string, unknown>,
    );
    if ("error" in input) return res.status(400).json(input);
    const id = await repository.createRule(userId, input);
    res.status(201).json({ id, ...input });
  });

  /**
   * @openapi
   * /plugin-api/alerts/rules/{id}:
   *   put:
   *     summary: Update a delivery rule
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: The updated rule.
   *       400:
   *         description: The rule is not valid.
   *       404:
   *         description: No such rule for the caller.
   */
  router.put("/rules/:id", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const id = positiveInt(req.params.id);
    if (!id) return res.status(404).json({ error: "Rule not found" });
    const input = await readRule(
      userId,
      (req.body ?? {}) as Record<string, unknown>,
    );
    if ("error" in input) return res.status(400).json(input);
    if (!(await repository.updateRule(userId, id, input))) {
      return res.status(404).json({ error: "Rule not found" });
    }
    res.json({ id, ...input });
  });

  /**
   * @openapi
   * /plugin-api/alerts/rules/{id}:
   *   delete:
   *     summary: Delete a delivery rule
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: integer
   *     responses:
   *       200:
   *         description: Deleted.
   *       404:
   *         description: No such rule for the caller.
   */
  router.delete("/rules/:id", async (req: Request, res: Response) => {
    const id = positiveInt(req.params.id);
    const deleted = id ? await repository.deleteRule(actor(ctx), id) : false;
    if (!deleted) return res.status(404).json({ error: "Rule not found" });
    res.json({ success: true });
  });

  const findDevices = async (userId: string, installId: string) =>
    (await repository.deliverableChannels(userId)).filter(
      (channel) =>
        channel.type === "mobile" && channel.config?.installId === installId,
    );

  /**
   * Removes a phone's channels and their rules, plus phone rules left with
   * no channel. 1.4.0-beta.1 could make a phone twice.
   */
  const removeDevices = async (
    userId: string,
    channels: Awaited<ReturnType<typeof findDevices>>,
  ) => {
    for (const channel of channels) {
      const ruleId = positiveInt(channel.config?.ruleId);
      if (ruleId) await repository.deleteRule(userId, ruleId);
      await repository.deleteChannel(userId, channel.id);
    }
    for (const rule of await repository.listRules(userId)) {
      if (rule.name.startsWith("Mobile: ") && rule.channelIds.length === 0) {
        await repository.deleteRule(userId, rule.id);
      }
    }
  };

  const rulesById = async (userId: string) =>
    new Map(
      (await repository.listRules(userId)).map((rule) => [rule.id, rule]),
    );

  const describeDevice = (
    channel: {
      id: number;
      name: string;
      enabled: boolean;
      config: Record<string, unknown> | null;
    },
    byId: Map<number, AlertRule>,
  ): MobileDevice => {
    const config = channel.config ?? {};
    const rule = byId.get(positiveInt(config.ruleId) ?? 0);
    return {
      installId: String(config.installId ?? ""),
      channelId: channel.id,
      name: channel.name,
      platform: config.platform === "ios" ? "ios" : "android",
      enabled: channel.enabled,
      minSeverity: rule?.minSeverity ?? "warning",
    };
  };

  /**
   * @openapi
   * /plugin-api/alerts/devices:
   *   get:
   *     summary: List the caller's phones linked for push notifications
   *     description: Push tokens are never returned.
   *     tags:
   *       - Alerts
   *     responses:
   *       200:
   *         description: The phones.
   */
  router.get("/devices", async (_req: Request, res: Response) => {
    const userId = actor(ctx);
    const byId = await rulesById(userId);
    const phones = (await repository.deliverableChannels(userId)).filter(
      (channel) => channel.type === "mobile",
    );
    res.json(phones.map((channel) => describeDevice(channel, byId)));
  });

  /**
   * @openapi
   * /plugin-api/alerts/devices/{installId}:
   *   put:
   *     summary: Link or update a phone for push notifications
   *     description: Used by the Termix app. Makes a mobile channel and a rule that sends alerts at or above minSeverity to it.
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: installId
   *         required: true
   *         schema:
   *           type: string
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [token, platform]
   *             properties:
   *               token:
   *                 type: string
   *                 description: The Expo push token.
   *               platform:
   *                 type: string
   *                 enum: [ios, android]
   *               name:
   *                 type: string
   *               accountKey:
   *                 type: string
   *                 description: The app's id for this server, sent back in each push.
   *               enabled:
   *                 type: boolean
   *               minSeverity:
   *                 type: string
   *                 enum: [info, success, warning, critical]
   *     responses:
   *       200:
   *         description: The phone.
   *       400:
   *         description: The request is not valid.
   */
  router.put("/devices/:installId", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const installId = String(req.params.installId ?? "");
    if (!INSTALL_ID.test(installId)) {
      return res.status(400).json({ error: "installId is not valid" });
    }
    const body = (req.body ?? {}) as Record<string, unknown>;
    const accountKey =
      typeof body.accountKey === "string" && ACCOUNT_KEY.test(body.accountKey)
        ? body.accountKey
        : "";
    const platform = body.platform as PushPlatform;
    const config: Record<string, unknown> = {
      token: typeof body.token === "string" ? body.token.trim() : "",
      platform,
      installId,
      accountKey,
    };
    const problem = validateChannelConfig("mobile", config);
    if (problem) return res.status(400).json({ error: problem });
    const name =
      (typeof body.name === "string" ? body.name.trim().slice(0, 100) : "") ||
      "Phone";
    const minSeverity: Severity = isSeverity(body.minSeverity)
      ? body.minSeverity
      : "warning";
    const enabled = body.enabled !== false;

    // The app can send several at once; one at a time keeps one channel and rule.
    const device = await oneAtATime(`${userId}:${installId}`, async () => {
      const [existing, ...copies] = await findDevices(userId, installId);
      if (copies.length > 0) await removeDevices(userId, copies);
      let channelId: number;
      if (existing) {
        channelId = existing.id;
        config.ruleId = existing.config?.ruleId;
        await repository.updateChannel(userId, channelId, {
          name,
          config,
          enabled,
        });
      } else {
        channelId = await repository.createChannel(userId, {
          name,
          type: "mobile",
          config,
          enabled,
        });
      }

      const rule = (await rulesById(userId)).get(
        positiveInt(config.ruleId) ?? 0,
      );
      const ruleInput = {
        name: `Mobile: ${name}`.slice(0, 100),
        match: rule?.match ?? "*",
        minSeverity,
        channelIds: [channelId],
        enabled: true,
      };
      if (rule) {
        await repository.updateRule(userId, rule.id, ruleInput);
      } else {
        config.ruleId = await repository.createRule(userId, ruleInput);
        await repository.updateChannel(userId, channelId, { config });
      }
      // Copies left by 1.4.0-beta.1, which could race.
      for (const extra of await repository.listRules(userId)) {
        if (
          extra.id !== config.ruleId &&
          extra.name.startsWith("Mobile: ") &&
          extra.channelIds.length === 1 &&
          extra.channelIds[0] === channelId
        ) {
          await repository.deleteRule(userId, extra.id);
        }
      }
      const result: MobileDevice = {
        installId,
        channelId,
        name,
        platform,
        enabled,
        minSeverity,
      };
      return result;
    });
    res.json(device);
  });

  /**
   * @openapi
   * /plugin-api/alerts/devices/{installId}:
   *   delete:
   *     summary: Unlink a phone
   *     description: Removes its mobile channel and its rule. Answers 200 when the phone was already gone.
   *     tags:
   *       - Alerts
   *     parameters:
   *       - in: path
   *         name: installId
   *         required: true
   *         schema:
   *           type: string
   *     responses:
   *       200:
   *         description: Removed, or was not linked.
   *       400:
   *         description: The install id is not valid.
   */
  router.delete("/devices/:installId", async (req: Request, res: Response) => {
    const userId = actor(ctx);
    const installId = String(req.params.installId ?? "");
    if (!INSTALL_ID.test(installId)) {
      return res.status(400).json({ error: "installId is not valid" });
    }
    // Unlinking twice is fine: the phone only wants to be gone.
    await oneAtATime(`${userId}:${installId}`, async () =>
      removeDevices(userId, await findDevices(userId, installId)),
    );
    res.json({ success: true });
  });
}
