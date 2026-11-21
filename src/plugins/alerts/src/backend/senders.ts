import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import {
  PUSH_PLATFORMS,
  type AlertLink,
  type ChannelType,
  type Severity,
} from "../types.js";

export interface OutgoingAlert {
  /** The inbox item, so a tap on a phone can open it. */
  itemId?: number;
  title: string;
  body: string;
  severity: Severity;
  category: string;
  source: string;
  link?: AlertLink | null;
  context?: Record<string, unknown> | null;
}

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

export interface SendMail {
  (
    smtp: SmtpSettings,
    message: {
      to: string[];
      subject: string;
      text: string;
    },
  ): Promise<void>;
}

export interface SenderDeps {
  fetch: PluginFetch;
  /** Hosts the admin lets channels reach on a private network. */
  privateAllowlist: () => Promise<string[]>;
  smtp: () => Promise<SmtpSettings | null>;
  sendMail: SendMail;
}

const NTFY_PRIORITY: Record<Severity, number> = {
  info: 2,
  success: 2,
  warning: 3,
  critical: 5,
};

const NTFY_TAGS: Record<Severity, string> = {
  info: "information_source",
  success: "white_check_mark",
  warning: "warning",
  critical: "rotating_light",
};

const DISCORD_COLORS: Record<Severity, number> = {
  info: 3447003,
  success: 3066993,
  warning: 16753920,
  critical: 15158332,
};

const DISCORD_WEBHOOK =
  /^https:\/\/(?:canary\.|ptb\.)?(?:discord\.com|discordapp\.com)\/api\/webhooks\/.+/i;

const SLACK_WEBHOOK = /^https:\/\/hooks\.slack\.com\/.+/i;
const PUSHOVER_KEY = /^[A-Za-z0-9]{30}$/;
const MATRIX_ROOM = /^![^:\s]+:[^\s]+$/;
export const PUSHOVER_URL = "https://api.pushover.net/1/messages.json";

const GOTIFY_PRIORITY: Record<Severity, number> = {
  info: 2,
  success: 2,
  warning: 5,
  critical: 8,
};

const PUSHOVER_PRIORITY: Record<Severity, number> = {
  info: -1,
  success: -1,
  warning: 0,
  critical: 1,
};

const TEAMS_STYLE: Record<Severity, string> = {
  info: "accent",
  success: "good",
  warning: "warning",
  critical: "attention",
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const TELEGRAM_TOKEN = /^\d+:[A-Za-z0-9_-]+$/;
const TELEGRAM_CHAT = /^(?:-?\d+|@[A-Za-z0-9_]{4,})$/;

const EXPO_TOKEN = /^Expo(?:nent)?PushToken\[[^\]\s]{1,200}\]$/;
export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Expo said the phone no longer takes pushes, so the channel should stop. */
export class DeviceGoneError extends Error {
  constructor() {
    super("The phone is no longer registered for notifications");
    this.name = "DeviceGoneError";
  }
}

/** The values a webhook body template can use, as {{name}}. */
export function templateValues(
  alert: OutgoingAlert,
  link: string | undefined,
): Record<string, unknown> {
  const context = alert.context ?? {};
  return {
    title: alert.title,
    message: alert.body,
    severity: alert.severity,
    category: alert.category,
    source: alert.source,
    link,
    hostName: context.hostName,
    hostId: context.hostId,
    ruleName: context.sourceName ?? alert.title,
    ruleId: context.sourceId,
    triggerType: context.triggerType,
    value: context.value,
    threshold: context.threshold,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Fills {{name}} in a JSON body template. Values are escaped for a JSON
 * string, so they go inside quotes: "text": "{{title}}". Unknown names are
 * left empty.
 */
export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
): string {
  return template.replace(/\{\{\s*([A-Za-z]+)\s*\}\}/g, (_match, name) => {
    const value = values[name];
    if (value === undefined || value === null) return "";
    return JSON.stringify(String(value)).slice(1, -1);
  });
}

const SAMPLE_VALUES: Record<string, unknown> = {
  title: "Sample",
  message: "Sample",
  severity: "info",
  category: "sample",
  source: "sample",
  link: "https://example.com",
  hostName: "host",
  hostId: 1,
  ruleName: "rule",
  ruleId: 1,
  triggerType: "sample",
  value: 1,
  threshold: 1,
  timestamp: new Date(0).toISOString(),
};

const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export function parseRecipients(value: unknown): string[] {
  return str(value)
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

/** What is wrong with a channel's config, or null when it can be saved. */
export function validateChannelConfig(
  type: ChannelType,
  config: Record<string, unknown>,
): string | null {
  switch (type) {
    case "webhook": {
      if (!/^https?:\/\//i.test(str(config.url)))
        return "webhook config requires an http(s) url";
      const template = str(config.bodyTemplate);
      if (!template) return null;
      try {
        JSON.parse(renderTemplate(template, SAMPLE_VALUES));
        return null;
      } catch {
        return "webhook body template is not valid JSON";
      }
    }
    case "telegram":
      if (!TELEGRAM_TOKEN.test(str(config.token)))
        return "telegram config requires a bot token from BotFather";
      return TELEGRAM_CHAT.test(str(config.chatId))
        ? null
        : "telegram config requires a chat id or @channel name";
    case "ntfy":
      if (!/^https?:\/\//i.test(str(config.url))) {
        return "ntfy config requires an http(s) url";
      }
      return str(config.topic) ? null : "ntfy config requires a topic";
    case "discord":
      return DISCORD_WEBHOOK.test(str(config.url))
        ? null
        : "discord config requires a Discord webhook URL";
    case "slack":
      return SLACK_WEBHOOK.test(str(config.url))
        ? null
        : "slack config requires a Slack webhook URL";
    case "teams":
      return /^https:\/\//i.test(str(config.url))
        ? null
        : "teams config requires an https webhook URL";
    case "gotify":
      if (!/^https?:\/\//i.test(str(config.url)))
        return "gotify config requires an http(s) server url";
      return str(config.token) ? null : "gotify config requires an app token";
    case "pushover":
      if (!PUSHOVER_KEY.test(str(config.token)))
        return "pushover config requires an application token";
      return PUSHOVER_KEY.test(str(config.userKey))
        ? null
        : "pushover config requires a user or group key";
    case "matrix":
      if (!/^https?:\/\//i.test(str(config.url)))
        return "matrix config requires an http(s) homeserver url";
      if (!MATRIX_ROOM.test(str(config.roomId)))
        return "matrix config requires a room id like !abc:example.org";
      return str(config.token)
        ? null
        : "matrix config requires an access token";
    case "mobile":
      if (!EXPO_TOKEN.test(str(config.token)))
        return "mobile config requires an Expo push token";
      return (PUSH_PLATFORMS as readonly string[]).includes(
        str(config.platform),
      )
        ? null
        : "mobile config requires a platform";
    case "email": {
      const to = parseRecipients(config.to);
      if (to.length === 0) return "email config requires at least one address";
      return to.every((address) => EMAIL.test(address))
        ? null
        : "email config has an invalid address";
    }
  }
}

const PLAIN_HEADER = /^[\x20-\x7e]*$/;

/** fetch sends header values as Latin-1, so anything else goes as RFC 2047. */
function headerText(value: string): string {
  return PLAIN_HEADER.test(value) && !value.startsWith("=?")
    ? value
    : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function linkUrl(alert: OutgoingAlert): string | undefined {
  const url = alert.link?.url;
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

/**
 * Sends one alert to one channel and throws on failure, so the caller can say
 * which channel failed. Private and loopback targets need both the channel's
 * allowPrivateNetwork opt-in and an exact host in the admin allowlist.
 */
export async function sendToChannel(
  channel: { type: ChannelType; config: Record<string, unknown> },
  alert: OutgoingAlert,
  deps: SenderDeps,
): Promise<void> {
  const { config } = channel;

  if (channel.type === "email") {
    const smtp = await deps.smtp();
    if (!smtp) throw new Error("Email is not set up on this server");
    const to = parseRecipients(config.to);
    if (to.length === 0) throw new Error("Channel has no email address");
    const url = linkUrl(alert);
    await deps.sendMail(smtp, {
      to,
      subject: `[Termix] ${alert.title}`,
      text: [alert.body || alert.title, url].filter(Boolean).join("\n\n"),
    });
    return;
  }

  if (channel.type === "mobile") {
    return sendPush(config, alert, deps);
  }

  const allowPrivateHosts =
    config.allowPrivateNetwork === true ? await deps.privateAllowlist() : [];
  const post = async (
    url: string,
    init: { method: string; headers: Record<string, string>; body: string },
  ) => {
    const response = await deps.fetch(url, {
      ...init,
      timeoutMs: 30_000,
      allowPrivateHosts,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail.slice(0, 200)}` : ""}`,
      );
    }
  };

  if (channel.type === "pushover") {
    const token = str(config.token);
    const user = str(config.userKey);
    if (!token || !user) throw new Error("Pushover channel is not set up");
    const click = linkUrl(alert);
    return post(PUSHOVER_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        user,
        title: (alert.title || "Termix").slice(0, 250),
        message: (alert.body || alert.title || "Termix").slice(0, 1024),
        priority: PUSHOVER_PRIORITY[alert.severity],
        ...(click ? { url: click.slice(0, 512) } : {}),
      }),
    });
  }

  if (channel.type === "telegram") {
    const token = str(config.token);
    const chatId = str(config.chatId);
    if (!token || !chatId) throw new Error("Telegram channel is not set up");
    const text = [alert.title, alert.body, linkUrl(alert)]
      .filter(Boolean)
      .join("\n\n");
    return post(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text || "Termix",
        disable_web_page_preview: true,
      }),
    });
  }

  const url = str(config.url);
  if (!url) throw new Error("Channel is missing a URL");
  const context = alert.context ?? {};

  switch (channel.type) {
    case "webhook": {
      const headers =
        config.headers && typeof config.headers === "object"
          ? (config.headers as Record<string, string>)
          : {};
      const template = str(config.bodyTemplate);
      if (template) {
        return post(url, {
          method: config.method === "PUT" ? "PUT" : "POST",
          headers: { "Content-Type": "application/json", ...headers },
          body: renderTemplate(template, templateValues(alert, linkUrl(alert))),
        });
      }
      return post(url, {
        method: config.method === "PUT" ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          title: alert.title,
          message: alert.body,
          severity: alert.severity,
          category: alert.category,
          source: alert.source,
          link: linkUrl(alert),
          hostName: context.hostName,
          hostId: context.hostId,
          ruleName: context.sourceName ?? alert.title,
          ruleId: context.sourceId,
          triggerType: context.triggerType,
          value: context.value,
          threshold: context.threshold,
          timestamp: new Date().toISOString(),
        }),
      });
    }
    case "ntfy": {
      const topic = str(config.topic);
      if (!topic) throw new Error("ntfy channel is missing a topic");
      const headers: Record<string, string> = {
        Title: headerText(alert.title || "Termix"),
        Priority: String(NTFY_PRIORITY[alert.severity]),
        Tags: NTFY_TAGS[alert.severity],
      };
      const click = linkUrl(alert);
      if (click) {
        headers.Click = PLAIN_HEADER.test(click) ? click : new URL(click).href;
      }
      const token = str(config.token);
      if (token) headers.Authorization = `Bearer ${token}`;
      return post(`${url.replace(/\/$/, "")}/${encodeURIComponent(topic)}`, {
        method: "POST",
        headers,
        body: alert.body || alert.title,
      });
    }
    case "slack": {
      const click = linkUrl(alert);
      const text = [
        `*${slackEscape(alert.title || "Termix")}*`,
        alert.body ? slackEscape(alert.body) : "",
        click ? `<${click}|Open in Termix>` : "",
      ]
        .filter(Boolean)
        .join("\n");
      return post(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
    }
    case "teams": {
      return post(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(teamsCard(alert)),
      });
    }
    case "gotify": {
      const token = str(config.token);
      if (!token) throw new Error("Gotify channel is missing an app token");
      const click = linkUrl(alert);
      return post(`${url.replace(/\/$/, "")}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Gotify-Key": token },
        body: JSON.stringify({
          title: alert.title || "Termix",
          message: alert.body || alert.title || "Termix",
          priority: GOTIFY_PRIORITY[alert.severity],
          ...(click
            ? { extras: { "client::notification": { click: { url: click } } } }
            : {}),
        }),
      });
    }
    case "matrix": {
      const token = str(config.token);
      const roomId = str(config.roomId);
      if (!token || !roomId) throw new Error("Matrix channel is not set up");
      const click = linkUrl(alert);
      const plain = [alert.title, alert.body, click]
        .filter(Boolean)
        .join("\n\n");
      const html = [
        `<strong>${htmlEscape(alert.title || "Termix")}</strong>`,
        alert.body ? htmlEscape(alert.body).replace(/\n/g, "<br>") : "",
        click ? `<a href="${htmlEscape(click)}">Open in Termix</a>` : "",
      ]
        .filter(Boolean)
        .join("<br><br>");
      const txn = `termix-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      return post(
        `${url.replace(/\/$/, "")}/_matrix/client/v3/rooms/${encodeURIComponent(roomId)}/send/m.room.message/${txn}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            msgtype: "m.text",
            body: plain || "Termix",
            format: "org.matrix.custom.html",
            formatted_body: html,
          }),
        },
      );
    }
    case "discord": {
      const embed: Record<string, unknown> = {
        title: alert.title || "Termix",
        description: alert.body || undefined,
        color: DISCORD_COLORS[alert.severity],
        timestamp: new Date().toISOString(),
      };
      const click = linkUrl(alert);
      if (click) embed.url = click;
      const payload: Record<string, unknown> = { embeds: [embed] };
      if (str(config.username)) payload.username = str(config.username);
      if (str(config.avatar_url)) payload.avatar_url = str(config.avatar_url);
      return post(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    }
  }
}

function slackEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function htmlEscape(text: string): string {
  return slackEscape(text).replace(/"/g, "&quot;");
}

/** An Adaptive Card, which Teams workflow webhooks take. */
export function teamsCard(alert: OutgoingAlert): Record<string, unknown> {
  const click = linkUrl(alert);
  const body: Record<string, unknown>[] = [
    {
      type: "TextBlock",
      text: alert.title || "Termix",
      weight: "Bolder",
      size: "Medium",
      wrap: true,
      color: TEAMS_STYLE[alert.severity],
    },
  ];
  if (alert.body)
    body.push({ type: "TextBlock", text: alert.body, wrap: true });
  return {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        content: {
          $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body,
          ...(click
            ? {
                actions: [
                  {
                    type: "Action.OpenUrl",
                    title: "Open in Termix",
                    url: click,
                  },
                ],
              }
            : {}),
        },
      },
    ],
  };
}

/** The message Expo gets. Clipped so it stays under Expo's 4 KB limit. */
export function pushMessage(
  config: Record<string, unknown>,
  alert: OutgoingAlert,
): Record<string, unknown> {
  const urgent = alert.severity === "critical" || alert.severity === "warning";
  return {
    to: str(config.token),
    title: (alert.title || "Termix").slice(0, 150),
    body: (alert.body || alert.title || "").slice(0, 1500),
    sound: "default",
    priority: urgent ? "high" : "normal",
    channelId: alert.severity === "critical" ? "alerts-critical" : "alerts",
    data: {
      itemId: alert.itemId,
      source: alert.source,
      category: alert.category.slice(0, 128),
      severity: alert.severity,
      accountKey: str(config.accountKey) || undefined,
      tab: alert.link?.tab,
    },
  };
}

async function sendPush(
  config: Record<string, unknown>,
  alert: OutgoingAlert,
  deps: SenderDeps,
): Promise<void> {
  if (!str(config.token)) throw new Error("Phone is not set up");
  const response = await deps.fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify([pushMessage(config, alert)]),
    timeoutMs: 30_000,
  });
  const text = await response.text().catch(() => "");
  let reply: {
    data?: Array<{
      status?: string;
      message?: string;
      details?: { error?: string };
    }>;
    errors?: Array<{ message?: string }>;
  } = {};
  try {
    reply = text ? JSON.parse(text) : {};
  } catch {
    // not JSON, the status below says enough
  }
  if (!response.ok) {
    const detail = reply.errors?.[0]?.message ?? text.slice(0, 200);
    throw new Error(
      `HTTP ${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`,
    );
  }
  const ticket = reply.data?.[0];
  if (ticket?.status === "error") {
    if (ticket.details?.error === "DeviceNotRegistered") {
      throw new DeviceGoneError();
    }
    throw new Error(ticket.message || "The push service refused the alert");
  }
}

/**
 * A send failure in words a user can act on. undici hides the real reason
 * behind "fetch failed", with the cause holding what went wrong.
 */
export function describeSendError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = (error as { cause?: unknown }).cause;
  const reason = cause instanceof Error ? cause.message : "";
  if (/private destinations/i.test(reason || error.message)) {
    return "This address is on a private network. Turn on Allow a private network address for the channel, and ask an admin to add the host to Allowed private notification hosts.";
  }
  return reason && /^fetch failed$/i.test(error.message)
    ? `Could not reach the address: ${reason}`
    : error.message;
}
