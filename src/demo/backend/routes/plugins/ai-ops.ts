import { del, get, HttpError, post, put } from "../../router";
import { rawFetch } from "../../fetch";
import { collection, value } from "../../store";
import { hosts } from "../hosts";
import { fleetMembers } from "./fleets";

// The AI assistant of AI 1.1: one conversation shared by the AI tab and the
// floating panel, commands on target hosts with live results per host, the
// Termix CLI, usage, and auto-ops tasks with plans to approve. Replies are
// canned and read the demo's hosts.

const P = "/plugin-api/ai";
const now = () => new Date().toISOString();
const ago = (minutes: number) =>
  new Date(Date.now() - minutes * 60_000).toISOString();
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const CONTEXT_WINDOW = 200_000;

const hostName = (id: number) =>
  hosts.all().find((host) => host.id === id)?.name ?? `#${id}`;

interface Conversation {
  id: number;
  title: string | null;
  updatedAt: string;
  targets: number[];
  totalTokens: number;
  promptTokens: number;
}

interface Message {
  id: number;
  conversationId: number;
  role: "user" | "assistant" | "tool" | "summary";
  content: string;
  toolCalls: string | null;
  reasoning: string | null;
  createdAt: string;
}

const conversations = collection<Conversation>("ai-ops-conversations", () => [
  {
    id: 1,
    title: "Daily patrol follow-up",
    updatedAt: ago(60 * 20),
    targets: [8],
    totalTokens: 18_420,
    promptTokens: 9_800,
  },
  {
    id: 2,
    title: "Disk space cleanup on nas",
    updatedAt: ago(42),
    targets: [8],
    totalTokens: 31_050,
    promptTokens: 14_200,
  },
]);
const messages = collection<Message>("ai-ops-messages", () => [
  {
    id: 1,
    conversationId: 1,
    role: "user",
    content: "What did the patrol find this morning?",
    toolCalls: null,
    reasoning: null,
    createdAt: ago(60 * 20),
  },
  {
    id: 2,
    conversationId: 1,
    role: "assistant",
    content:
      "Two warnings: **nas** is at 81% disk use and **edge-sfo** did not answer. Everything else passed.",
    toolCalls: null,
    reasoning: null,
    createdAt: ago(60 * 20),
  },
]);

get(`${P}/ops/fleets`, () => ({ available: true, fleets: fleetMembers() }));

get(`${P}/ops/conversations`, () => ({
  conversations: conversations
    .all()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ promptTokens: _p, ...rest }) => ({ ...rest, running: false })),
}));
get(`${P}/ops/conversations/:id`, (req) => {
  const conversation = conversations.find(req.params.id);
  if (!conversation)
    throw new HttpError(404, { error: "Conversation not found" });
  const { promptTokens, ...rest } = conversation;
  return {
    conversation: {
      ...rest,
      running: false,
      context: promptTokens
        ? {
            promptTokens,
            contextWindow: CONTEXT_WINDOW,
            estimated: false,
            contextSource: "provider",
            reservedOutput: 16_000,
          }
        : null,
    },
    messages: messages
      .all()
      .filter((m) => String(m.conversationId) === req.params.id),
  };
});
del(`${P}/ops/conversations/:id`, (req) => {
  conversations.remove(req.params.id);
});
post(`${P}/ops/conversations/:id/stop`, () => ({ success: true }));
post(`${P}/ops/conversations/:id/compact`, () => ({ compacted: false }));
rawFetch(
  (path) => /^\/plugin-api\/ai\/ops\/conversations\/\d+\/stream/.test(path),
  async () =>
    new Response(new ReadableStream({ start: (c) => c.close() }), {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    }),
);

type HostRun = { hostId: number; output: string; exitCode?: number };

type Step =
  | { type: "reasoning"; text: string }
  | { type: "text"; text: string }
  | { type: "run"; command: string; hosts: HostRun[] }
  | { type: "cli"; args: string[]; output: string }
  | { type: "open_terminal"; hostId: number };

const LAG_COMMAND =
  'psql -Atc "select now() - pg_last_xact_replay_timestamp()"';

function reply(message: string, targets: number[]): Step[] {
  const text = message.toLowerCase();
  if (/snippet|terminal/.test(text)) {
    return [
      {
        type: "cli",
        args: [
          "snippets",
          "create",
          "--name",
          "Replication lag",
          "--folder",
          "Databases",
          "--content",
          LAG_COMMAND,
        ],
        output: JSON.stringify(
          { id: 14, name: "Replication lag", folder: "Databases" },
          null,
          2,
        ),
      },
      { type: "open_terminal", hostId: 4 },
      {
        type: "text",
        text: "Saved **Replication lag** in your Databases snippets and opened a terminal on **db-replica**.",
      },
    ];
  }
  if (/lag|replica|db-/.test(text)) {
    return [
      {
        type: "reasoning",
        text: "db-replica is now a target. Read the replay delay first, then what is running on it.",
      },
      {
        type: "run",
        command: LAG_COMMAND,
        hosts: [{ hostId: 4, output: "00:04:12.381907" }],
      },
      {
        type: "run",
        command:
          'psql -Atc "select pid, state, now() - xact_start, left(query, 60) from pg_stat_activity where xact_start is not null order by 3 desc limit 3"',
        hosts: [
          {
            hostId: 4,
            output:
              "48211|active|00:38:02|autovacuum: VACUUM ANALYZE public.events\n48977|active|00:00:01|select count(*) from orders where created_at > $1",
          },
        ],
      },
      {
        type: "text",
        text: "**db-replica is 4 minutes behind.** An autovacuum on `public.events` has run for 38 minutes and holds replay back, so reads on the web tier wait for fresh rows and time out.\n\nIt is catching up, nothing needs a restart. Once the vacuum ends the lag should drop within a few minutes.",
      },
    ];
  }
  const web = targets.length ? targets : [1, 2];
  return [
    {
      type: "reasoning",
      text: `The targets are ${web.map(hostName).join(" and ")}. Start with load and nginx on both, then the error log, before guessing.`,
    },
    {
      type: "text",
      text: "I'll check load and nginx on both web hosts first.",
    },
    {
      type: "run",
      command: "uptime && systemctl is-active nginx",
      hosts: web.map((hostId, i) => ({
        hostId,
        output: ` 10:42:1${i} up ${31 + i * 9} days,  2:0${i},  1 user,  load average: 0.3${i}, 0.28, 0.25\nactive`,
      })),
    },
    {
      type: "text",
      text: "Both are up and load is low, so it is not CPU. Checking the nginx error log next.",
    },
    {
      type: "run",
      command:
        "grep 'upstream timed out' /var/log/nginx/error.log | tail -n 1; grep -c 'upstream timed out' /var/log/nginx/error.log",
      hosts: web.map((hostId, i) => ({
        hostId,
        output: `2026/10/18 10:41:5${i} [error] upstream timed out (110) while reading response header from upstream, upstream: "http://10.0.12.41:8080/api/orders"\n${412 - i * 23}`,
      })),
    },
    {
      type: "cli",
      args: ["hosts", "list", "--tag", "postgres"],
      output: JSON.stringify(
        [
          { id: 3, name: "db-primary", ip: "10.0.12.40", folder: "Production" },
          { id: 4, name: "db-replica", ip: "10.0.12.41", folder: "Production" },
        ],
        null,
        2,
      ),
    },
    {
      type: "text",
      text: "**nginx is fine, its backend is not.** Both web hosts log hundreds of `upstream timed out` errors since 10:00, all for `/api/orders` on **10.0.12.41**, which is **db-replica**.\n\nThe read API waits on the replica. Add `@db-replica` as a target and I can check its replication lag.",
    },
  ];
}

const usage = value("ai-usage-today", () => 48_210);

rawFetch(
  (path) => path.startsWith(`${P}/ops/chat`),
  async (_path, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      message?: string;
      conversationId?: number;
      hostIds?: number[];
    };
    const targets = body.hostIds ?? [];
    const conversation =
      (body.conversationId && conversations.find(body.conversationId)) ||
      conversations.insert({
        id: conversations.nextId(),
        title: (body.message ?? "New conversation").slice(0, 60),
        updatedAt: now(),
        targets,
        totalTokens: 0,
        promptTokens: 0,
      });
    const id = conversation.id;
    const store = (row: Omit<Message, "id" | "conversationId" | "createdAt">) =>
      messages.insert({
        id: messages.nextId(),
        conversationId: id,
        createdAt: now(),
        ...row,
      });
    store({
      role: "user",
      content: body.message ?? "",
      toolCalls: null,
      reasoning: null,
    });

    const encoder = new TextEncoder();
    const steps = reply(body.message ?? "", targets);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        let prompt = conversation.promptTokens || 6_200;
        let total = conversation.totalTokens;
        const sendUsage = () => {
          const completion = 180 + Math.round(Math.random() * 120);
          prompt += 1_400 + Math.round(Math.random() * 900);
          total += prompt + completion;
          usage.set(usage.get() + prompt + completion);
          send({
            type: "usage",
            usage: {
              promptTokens: prompt,
              completionTokens: completion,
              estimated: false,
            },
            contextWindow: CONTEXT_WINDOW,
            contextSource: "provider",
            reservedOutput: 16_000,
          });
        };
        const words = async (type: "token" | "reasoning", text: string) => {
          for (const word of text.split(/(?<= )/)) {
            send({ type, text: word });
            await pause(type === "reasoning" ? 14 : 24 + Math.random() * 24);
          }
        };

        send({ type: "conversation", conversationId: id });
        if (targets.length) send({ type: "targets", hostIds: targets });
        await pause(450);
        let call = 0;
        let pendingText = "";
        let pendingReasoning: string | null = null;
        for (const step of steps) {
          if (init?.signal?.aborted) break;
          if (step.type === "reasoning") {
            await words("reasoning", step.text);
            pendingReasoning = step.text;
            await pause(250);
          } else if (step.type === "text") {
            await words("token", step.text);
            pendingText += step.text;
            sendUsage();
            await pause(300);
          } else {
            const callId = `call-${id}-${messages.nextId()}-${call++}`;
            const name =
              step.type === "run"
                ? "run_command"
                : step.type === "cli"
                  ? "termix"
                  : "open_host_terminal";
            const args =
              step.type === "run"
                ? {
                    command: step.command,
                    hostIds: step.hosts.map((h) => h.hostId),
                  }
                : step.type === "cli"
                  ? { args: step.args }
                  : { hostId: step.hostId };
            store({
              role: "assistant",
              content: pendingText,
              toolCalls: JSON.stringify([
                { id: callId, name, arguments: args },
              ]),
              reasoning: pendingReasoning,
            });
            pendingText = "";
            pendingReasoning = null;
            send({ type: "tool_call", name, arguments: args });
            let result: unknown;
            if (step.type === "run") {
              const rows = [];
              for (const host of step.hosts) {
                await pause(500 + Math.random() * 450);
                const row = {
                  hostId: host.hostId,
                  name: hostName(host.hostId),
                  exitCode: host.exitCode ?? 0,
                  output: host.output,
                  durationMs: 380 + Math.round(Math.random() * 900),
                };
                rows.push(row);
                send({ type: "tool_progress", name, host: row });
              }
              result = {
                command: step.command,
                hosts: rows.map((r) => ({
                  id: r.hostId,
                  name: r.name,
                  exitCode: r.exitCode,
                  output: r.output,
                })),
              };
            } else if (step.type === "cli") {
              await pause(800);
              result = { exitCode: 0, output: step.output };
            } else {
              await pause(400);
              send({
                type: "client_action",
                action: { kind: "open_host_terminal", hostId: step.hostId },
              });
              result = { status: "requested" };
            }
            await pause(200);
            send({ type: "tool_result", name, result });
            store({
              role: "tool",
              content: JSON.stringify(result),
              toolCalls: JSON.stringify([{ id: callId, name }]),
              reasoning: null,
            });
            sendUsage();
            await pause(350);
          }
        }
        if (pendingText || pendingReasoning) {
          store({
            role: "assistant",
            content: pendingText,
            toolCalls: null,
            reasoning: pendingReasoning,
          });
        }
        conversations.patch(id, {
          updatedAt: now(),
          targets,
          totalTokens: total,
          promptTokens: prompt,
        });
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  },
);

// Usage over the last 30 days, shaped like the real summary.

function totals(prompt: number, completion: number, calls: number) {
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: prompt + completion,
    calls,
    estimated: false,
  };
}

get(`${P}/usage`, (req) => {
  const byDay = Array.from({ length: 30 }, (_, i) => {
    const date = new Date(Date.now() - i * 864e5);
    const weekend = [0, 6].includes(date.getDay());
    const base =
      i === 0
        ? usage.get()
        : (weekend ? 22_000 : 61_000) + ((i * 7919) % 38_000);
    const completion = Math.round(base * 0.09);
    return {
      day: date.toISOString().slice(0, 10),
      ...totals(base - completion, completion, Math.round(base / 2_600)),
    };
  });
  const sum = (days: typeof byDay) =>
    totals(
      days.reduce((n, d) => n + d.promptTokens, 0),
      days.reduce((n, d) => n + d.completionTokens, 0),
      days.reduce((n, d) => n + d.calls, 0),
    );
  const month = sum(byDay);
  const split = (share: number) =>
    totals(
      Math.round(month.promptTokens * share),
      Math.round(month.completionTokens * share),
      Math.round(month.calls * share),
    );
  return {
    scope: req.query.scope === "all" ? "all" : "me",
    today: byDay[0],
    week: sum(byDay.slice(0, 7)),
    month,
    byDay,
    byModel: [
      { model: "claude-sonnet-5-5", ...split(0.71) },
      { model: "qwen3:32b", ...split(0.22) },
      { model: "claude-haiku-5-5", ...split(0.07) },
    ],
    bySource: [
      { source: "assistant", ...split(0.58) },
      { source: "task", ...split(0.31) },
      { source: "terminal", ...split(0.08) },
      { source: "compaction", ...split(0.03) },
    ],
    ...(req.query.scope === "all"
      ? {
          byUser: [
            { userId: "demo-user", ...split(0.64) },
            { userId: "alex", ...split(0.36) },
          ],
        }
      : {}),
  };
});

// Auto-ops: tasks automations ran, plans waiting for approval, presets.

type TaskStatus =
  | "running"
  | "reported"
  | "proposed"
  | "approved"
  | "rejected"
  | "expired"
  | "executing"
  | "done"
  | "failed"
  | "skipped";

interface PlanHost {
  hostId: number;
  commands: string[];
  rationale: string;
  risk: string;
  rollback: string;
  verify: string[];
  outputs: string[];
  results?: unknown[];
}

interface Task {
  id: number;
  automationId: number;
  presetId: string | null;
  title: string;
  autonomy: "report" | "propose";
  status: TaskStatus;
  severity: "info" | "warning" | "critical" | null;
  summary: string | null;
  hostIds: number[];
  conversationId: number | null;
  totalTokens: number;
  createdAt: string;
  finishedAt: string | null;
  expiresAt: string | null;
  trigger: { kind: string; summary: string };
  report: string | null;
  plan: PlanHost[] | null;
  approvedAt: number | null;
}

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16];

const tasks = collection<Task>("ai-tasks", () => [
  {
    id: 4,
    automationId: 12,
    presetId: "disk-cleanup",
    title: "Disk space cleanup",
    autonomy: "propose",
    status: "proposed",
    severity: "warning",
    summary:
      "nas is at 87% on /. Old journal logs and unused Docker images take 21 GB and are safe to remove.",
    hostIds: [8],
    conversationId: 2,
    totalTokens: 31_050,
    createdAt: ago(44),
    finishedAt: ago(42),
    expiresAt: new Date(Date.now() + 23 * 3600_000).toISOString(),
    trigger: {
      kind: "metric",
      summary: "Disk on nas at 87% for 5 minutes",
    },
    report:
      "**/ on nas is 87% full** (3.1 of 3.6 TB).\n\n- Journal logs older than 7 days: 3.4 GB, safe to remove\n- Unused Docker images: 17.8 GB, safe to remove\n- /srv/backups: 1.9 TB, business data, left alone\n\nThe plan below frees about 21 GB.",
    plan: [
      {
        hostId: 8,
        commands: [
          "journalctl --vacuum-time=7d",
          "docker image prune -af --filter until=720h",
        ],
        rationale:
          "Journal logs and images unused for 30 days are the only large items that hold no data.",
        risk: "Low. Old logs are gone and an image is pulled again if a container needs it.",
        rollback: "Nothing to roll back; images can be pulled again.",
        verify: ["df -h /"],
        outputs: [
          "Vacuuming done, freed 3.4G of archived journals from /var/log/journal.",
          "Total reclaimed space: 17.8GB",
          "Filesystem  Size  Used Avail Use% Mounted on\n/dev/md0    3.6T  3.1T  521G  86% /",
        ],
      },
    ],
    approvedAt: null,
  },
  {
    id: 3,
    automationId: 11,
    presetId: "daily-patrol",
    title: "Daily patrol",
    autonomy: "report",
    status: "reported",
    severity: "warning",
    summary:
      "2 warnings: nas disk at 81%, edge-sfo did not answer. 13 hosts passed.",
    hostIds: ALL,
    conversationId: 1,
    totalTokens: 52_380,
    createdAt: ago(60 * 21 + 4),
    finishedAt: ago(60 * 21),
    expiresAt: null,
    trigger: { kind: "schedule", summary: "Every day at 09:00" },
    report:
      "**2 warnings, 13 hosts passed.**\n\n- **nas**: / at 81%, up 6% this week\n- **edge-sfo**: no answer on SSH, ping times out\n\nNo failed services, no pending reboots, certificates valid for 30+ days.",
    plan: null,
    approvedAt: null,
  },
  {
    id: 2,
    automationId: 13,
    presetId: "container-anomaly",
    title: "Container anomaly",
    autonomy: "propose",
    status: "done",
    severity: "info",
    summary: "plex on media-server exited after an update. Started it again.",
    hostIds: [10],
    conversationId: null,
    totalTokens: 12_940,
    createdAt: ago(60 * 30),
    finishedAt: ago(60 * 29),
    expiresAt: null,
    trigger: { kind: "container", summary: "plex exited on media-server" },
    report:
      "**plex** exited with code 0 after its image updated. Started it once, it is healthy.",
    plan: null,
    approvedAt: null,
  },
  {
    id: 1,
    automationId: 14,
    presetId: "cert-expiry-weekly",
    title: "Weekly certificate expiry",
    autonomy: "report",
    status: "reported",
    severity: "info",
    summary: "All 9 certificates are valid for more than 30 days.",
    hostIds: ALL,
    conversationId: null,
    totalTokens: 21_660,
    createdAt: ago(60 * 24 * 6),
    finishedAt: ago(60 * 24 * 6 - 3),
    expiresAt: null,
    trigger: { kind: "schedule", summary: "Every Monday at 09:45" },
    report: "All 9 certificates are valid for more than 30 days.",
    plan: null,
    approvedAt: null,
  },
]);

/** An approved plan runs for a few seconds, then is done. */
function progress(task: Task): Task {
  if (task.approvedAt === null) return task;
  const elapsed = Date.now() - task.approvedAt;
  const steps = Math.min(3, Math.floor(elapsed / 1_300));
  const done = steps >= 3;
  return {
    ...task,
    status: done ? "done" : "executing",
    finishedAt: done ? new Date(task.approvedAt + 3_900).toISOString() : null,
    summary: done ? "Freed 21.2 GB on nas. / is at 86%." : task.summary,
    plan:
      task.plan?.map((host) => ({
        ...host,
        results: [...host.commands, ...host.verify]
          .slice(0, steps)
          .map((command, i) => ({
            command,
            phase: i < host.commands.length ? "execute" : "verify",
            exitCode: 0,
            output: host.outputs[i] ?? "",
          })),
      })) ?? null,
  };
}

function item(task: Task) {
  const t = progress(task);
  return {
    id: t.id,
    userId: "demo-user",
    mine: true,
    automationId: t.automationId,
    presetId: t.presetId,
    title: t.title,
    autonomy: t.autonomy,
    status: t.status,
    severity: t.severity,
    summary: t.summary,
    hostIds: t.hostIds,
    dryRun: false,
    conversationId: t.conversationId,
    promptTokens: Math.round(t.totalTokens * 0.9),
    completionTokens: Math.round(t.totalTokens * 0.1),
    totalTokens: t.totalTokens,
    createdAt: t.createdAt,
    finishedAt: t.finishedAt,
    expiresAt: t.expiresAt,
  };
}

function findTask(id: string): Task {
  const task = tasks.find(id);
  if (!task) throw new HttpError(404, { error: "Task not found" });
  return task;
}

const byNewest = (a: Task, b: Task) => b.createdAt.localeCompare(a.createdAt);

get(`${P}/tasks`, () => {
  const all = tasks.all().sort(byNewest);
  return {
    tasks: all.map(item),
    approvals: all
      .filter((t) =>
        ["proposed", "approved", "executing"].includes(progress(t).status),
      )
      .map(item),
  };
});
get(`${P}/tasks/presets`, () => {
  const preset = (
    id: string,
    autonomy: "report" | "propose",
    trigger: Record<string, unknown> & { kind: string },
    enabled: string | null,
  ) => ({
    id,
    version: 2,
    autonomy,
    trigger,
    hostSelector: { kind: trigger.kind === "schedule" ? "all" : "trigger" },
    maxRunSeconds: 600,
    runbook: "",
    enabled: enabled ? [{ automationId: 11, version: 2, name: enabled }] : [],
    updateAvailable: false,
  });
  return {
    automationsAvailable: true,
    presets: [
      preset("daily-patrol", "report", { kind: "schedule" }, "Daily patrol"),
      preset(
        "disk-cleanup",
        "propose",
        { kind: "metric" },
        "Disk space cleanup",
      ),
      preset("host-down-triage", "report", { kind: "status" }, null),
      preset("service-failure", "propose", { kind: "health" }, null),
      preset(
        "container-anomaly",
        "propose",
        { kind: "container" },
        "Container anomaly",
      ),
      preset("resource-overload-cpu", "report", { kind: "metric" }, null),
      preset("resource-overload-memory", "report", { kind: "metric" }, null),
      preset("security-updates-weekly", "report", { kind: "schedule" }, null),
      preset(
        "cert-expiry-weekly",
        "report",
        { kind: "schedule" },
        "Weekly certificate expiry",
      ),
    ],
    custom: [],
  };
});
get(`${P}/tasks/preferences`, () => ({
  preferences: { providerId: null, model: null, language: "en" },
}));
put(`${P}/tasks/preferences`, (req) => ({
  preferences: {
    providerId: null,
    model: null,
    language: "en",
    ...(req.body as object),
  },
}));
post(`${P}/tasks/presets/:id/enable`, () => ({ success: true }));
post(`${P}/tasks/custom-presets`, () => ({ success: true }));
del(`${P}/tasks/custom-presets/:id`, () => ({ success: true }));
get(`${P}/tasks/:id`, (req) => {
  const task = progress(findTask(req.params.id));
  return {
    task: {
      ...item(task),
      trigger: task.trigger,
      report: task.report,
      plan: task.plan?.map(({ outputs: _o, ...host }) => host) ?? null,
      decidedBy: task.approvedAt ? "demo" : null,
      decidedAt: task.approvedAt
        ? new Date(task.approvedAt).toISOString()
        : null,
      hostNames: Object.fromEntries(
        task.hostIds.map((id) => [String(id), hostName(id)]),
      ),
      canDecide: true,
    },
  };
});
post(`${P}/tasks/:id/approve`, (req) => {
  findTask(req.params.id);
  tasks.patch(req.params.id, { approvedAt: Date.now() });
  return { success: true };
});
post(`${P}/tasks/:id/reject`, (req) => {
  findTask(req.params.id);
  tasks.patch(req.params.id, { status: "rejected", finishedAt: now() });
  return { success: true };
});
