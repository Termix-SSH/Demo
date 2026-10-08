import { del, get, HttpError, post, put } from "../../router";
import { collection, value } from "../../store";
import { hosts } from "../hosts";

const P = "/plugin-api/automations";
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

interface Row {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  enabled: number;
  definition: Record<string, unknown>;
  definition_version: number;
  concurrency_policy: string;
  max_run_seconds: number;
  dry_run: number;
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
  channels: number[];
}

function row(
  id: number,
  name: string,
  description: string,
  trigger: Record<string, unknown>,
  steps: Array<Record<string, unknown>>,
  lastRun: [number, string] | null,
  enabled = true,
): Row {
  return {
    id,
    user_id: "demo-user",
    name,
    description,
    enabled: enabled ? 1 : 0,
    definition: { version: 1, trigger, steps },
    definition_version: 1,
    concurrency_policy: "skip",
    max_run_seconds: 300,
    dry_run: 0,
    last_run_at: lastRun ? ago(lastRun[0]) : null,
    last_run_status: lastRun ? lastRun[1] : null,
    created_at: ago(60 * 24 * 14),
    updated_at: ago(60 * 24 * 2),
    channels: [1],
  };
}

const automations = collection<Row>("automations", () => [
  row(
    1,
    "Nightly backup",
    "Runs restic on every homelab box at 3am and reports the result",
    { kind: "schedule", cron: "0 3 * * *", timezone: "UTC" },
    [
      {
        id: "s1",
        type: "run_command",
        name: "Back up",
        command: "restic backup /srv --quiet",
        hostSelector: { kind: "fleet", fleetId: 3 },
      },
      {
        id: "s2",
        type: "notify",
        name: "Tell the team",
        channelIds: [1],
        title: "Backup finished",
        severity: "info",
      },
    ],
    [62, "success"],
  ),
  row(
    2,
    "Restart app when it exits",
    "Brings the app container back if it stops on web-01",
    {
      kind: "docker_event",
      hostSelector: { kind: "host", hostId: 1 },
      container: "app",
      event: "exited",
      cooldownMinutes: 15,
    },
    [
      {
        id: "s1",
        type: "docker",
        action: "start",
        container: "app",
        hostSelector: { kind: "trigger" },
      },
      { id: "s2", type: "wait", seconds: 10 },
      {
        id: "s3",
        type: "http",
        method: "GET",
        url: "https://example.home.arpa/api/health",
      },
    ],
    [60 * 26, "success"],
  ),
  row(
    3,
    "Disk filling up",
    "Prunes Docker images when a disk passes 85%",
    {
      kind: "metric_threshold",
      hostSelector: { kind: "all" },
      metric: { path: "disk.percent" },
      operator: ">=",
      value: 85,
      forSeconds: 300,
      cooldownMinutes: 60,
      severity: "warning",
    },
    [
      {
        id: "s1",
        type: "run_snippet",
        snippetId: 1,
        hostSelector: { kind: "trigger" },
      },
      {
        id: "s2",
        type: "notify",
        channelIds: [1, 2],
        title: "Disk pruned on {{host.name}}",
        severity: "warning",
      },
    ],
    [60 * 49, "failed"],
  ),
  row(
    4,
    "Wake the NAS for backups",
    "Wakes the NAS before the nightly backup",
    { kind: "schedule", cron: "50 2 * * *", timezone: "UTC" },
    [{ id: "s1", type: "wol", hostId: 8 }],
    null,
    false,
  ),
]);

interface Run {
  id: number;
  automation_id: number;
  user_id: string;
  trigger_type: string;
  trigger_context: string | null;
  status: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  error: string | null;
  dry_run: number;
  parent_run_id: number | null;
}

const runs = collection<Run>("automation-runs", () => [
  {
    id: 1,
    automation_id: 1,
    user_id: "demo-user",
    trigger_type: "schedule",
    trigger_context: null,
    status: "success",
    started_at: ago(62),
    finished_at: ago(50),
    duration_ms: 763_000,
    error: null,
    dry_run: 0,
    parent_run_id: null,
  },
  {
    id: 2,
    automation_id: 2,
    user_id: "demo-user",
    trigger_type: "docker_event",
    trigger_context: '{"container":"app"}',
    status: "success",
    started_at: ago(60 * 26),
    finished_at: ago(60 * 26 - 1),
    duration_ms: 14_200,
    error: null,
    dry_run: 0,
    parent_run_id: null,
  },
  {
    id: 3,
    automation_id: 3,
    user_id: "demo-user",
    trigger_type: "metric_threshold",
    trigger_context: '{"host":"nas","value":86}',
    status: "failed",
    started_at: ago(60 * 49),
    finished_at: ago(60 * 49 - 1),
    duration_ms: 4_100,
    error: "Snippet exited with code 1",
    dry_run: 0,
    parent_run_id: null,
  },
  {
    id: 4,
    automation_id: 1,
    user_id: "demo-user",
    trigger_type: "schedule",
    trigger_context: null,
    status: "success",
    started_at: ago(60 * 24 + 62),
    finished_at: ago(60 * 24 + 50),
    duration_ms: 702_000,
    error: null,
    dry_run: 0,
    parent_run_id: null,
  },
]);

function stepsFor(run: Run) {
  const automation = automations.find(run.automation_id);
  const steps = (automation?.definition.steps ?? []) as Array<{
    id: string;
    type: string;
  }>;
  return steps.map((step, i) => {
    const failed = run.status === "failed" && i === 0;
    const skipped = run.status === "failed" && i > 0;
    return {
      id: run.id * 10 + i,
      run_id: run.id,
      step_index: i,
      step_id: step.id,
      step_type: step.type,
      status: failed ? "failed" : skipped ? "skipped" : "success",
      started_at: run.started_at,
      finished_at: run.finished_at,
      output:
        failed || skipped
          ? null
          : step.type === "run_command"
            ? "snapshot 8f2a1c9e saved\nprocessed 14211 files, 41.2 GiB in 12:41"
            : "OK",
      error: failed ? run.error : null,
      truncated: 0,
    };
  });
}

get(`${P}/`, () => automations.all());
get(`${P}/editor-options`, () => ({
  hosts: hosts.all().map((h) => ({ id: h.id, name: h.name })),
  snippets: [
    { id: 1, name: "Prune unused images" },
    { id: 2, name: "Compose redeploy" },
    { id: 6, name: "Upgrade packages" },
  ],
  fleets: [
    { id: 1, name: "Web tier" },
    { id: 2, name: "Databases" },
    { id: 3, name: "Homelab" },
    { id: 4, name: "Edge VPS" },
  ],
  channels: [
    { id: 1, name: "Ops Discord" },
    { id: 2, name: "Phone (ntfy)" },
    { id: 3, name: "On-call email" },
  ],
  providers: {
    snippets: true,
    fleets: true,
    tunnels: true,
    docker: true,
    "docker-events": true,
    "host-metrics": true,
    "wake-on-lan": true,
  },
}));
get(`${P}/runs/history`, (req) => {
  let list = [...runs.all()].sort((a, b) =>
    b.started_at.localeCompare(a.started_at),
  );
  if (req.query.automationId)
    list = list.filter(
      (r) => String(r.automation_id) === req.query.automationId,
    );
  return list.map((r) => ({
    ...r,
    automation_name: automations.find(r.automation_id)?.name ?? null,
  }));
});
get(`${P}/runs/:runId/steps`, (req) => {
  const run = runs.find(req.params.runId);
  if (!run) throw new HttpError(404, { error: "Run not found" });
  return stepsFor(run);
});
post(`${P}/`, (req) => {
  const body = req.body as {
    name: string;
    description?: string;
    enabled?: boolean;
    definition: Record<string, unknown>;
    channels?: number[];
  };
  const record: Row = {
    ...row(
      automations.nextId(),
      body.name,
      body.description ?? "",
      {},
      [],
      null,
      body.enabled !== false,
    ),
    definition: body.definition,
    channels: body.channels ?? [],
  };
  automations.insert(record);
  return record;
});
put(`${P}/:id`, (req) => {
  const body = req.body as Record<string, unknown>;
  const changes: Partial<Row> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) changes.name = body.name as string;
  if (body.description !== undefined)
    changes.description = body.description as string;
  if (body.enabled !== undefined) changes.enabled = body.enabled ? 1 : 0;
  if (body.definition !== undefined)
    changes.definition = body.definition as Record<string, unknown>;
  if (body.channels !== undefined) changes.channels = body.channels as number[];
  return automations.patch(req.params.id, changes);
});
del(`${P}/:id`, (req) => {
  automations.remove(req.params.id);
  return { success: true };
});
post(`${P}/:id/run`, (req) => {
  const automation = automations.find(req.params.id);
  if (!automation) throw new HttpError(404, { error: "Automation not found" });
  const id = runs.nextId();
  const now = new Date().toISOString();
  runs.insert({
    id,
    automation_id: automation.id,
    user_id: "demo-user",
    trigger_type: "manual",
    trigger_context: null,
    status: "success",
    started_at: now,
    finished_at: now,
    duration_ms: 1800,
    error: null,
    dry_run: (req.body as { dryRun?: boolean })?.dryRun ? 1 : 0,
    parent_run_id: null,
  });
  automations.patch(automation.id, {
    last_run_at: now,
    last_run_status: "success",
  });
  return { runId: id, status: "success" };
});

// Host maintenance windows
const maintenance = value<Record<string, unknown>>("maintenance", () => ({
  "3": {
    active: null,
    plans: [
      {
        id: "p1",
        reason: "Postgres minor upgrade",
        start: new Date(Date.now() + 2 * 864e5).toISOString(),
        durationMinutes: 45,
        recurrence: "once",
        graceMinutes: 15,
        notifyOverdue: true,
        nextStart: new Date(Date.now() + 2 * 864e5).toISOString(),
      },
    ],
  },
}));
get(`${P}/maintenance`, () =>
  Object.entries(maintenance.get()).map(([hostId, state]) => ({
    hostId: Number(hostId),
    state: { ...(state as object), owned: true },
  })),
);
get(`${P}/maintenance/:hostId`, (req) => ({
  active: null,
  plans: [],
  ...((maintenance.get()[req.params.hostId] as object) ?? {}),
  owned: true,
}));
type Plan = {
  id: string;
  reason: string;
  start: string;
  durationMinutes: number;
  recurrence: string;
  graceMinutes: number;
  notifyOverdue: boolean;
  nextStart: string | null;
};
type State = { active: Record<string, unknown> | null; plans: Plan[] };

post(`${P}/maintenance/:hostId`, (req) => {
  const current = (maintenance.get()[req.params.hostId] ?? {
    active: null,
    plans: [],
  }) as State;
  const input = req.body as Record<string, unknown>;
  const now = new Date();
  const minutes = Number(input.durationMinutes) || 60;
  let next: State = current;
  if (input.action === "end") next = { ...current, active: null };
  else if (input.action === "remove")
    next = {
      ...current,
      plans: current.plans.filter((p) => p.id !== input.id),
    };
  else if (input.action === "start") {
    next = {
      ...current,
      active: {
        startedAt: now.toISOString(),
        reasons: [String(input.reason ?? "")].filter(Boolean),
        estimatedEnd: new Date(now.getTime() + minutes * 60_000).toISOString(),
        graceMinutes: Number(input.graceMinutes) || 15,
        notifyOverdue: input.notifyOverdue !== false,
        notified: false,
      },
    };
  } else {
    const start = String(input.start ?? now.toISOString());
    next = {
      ...current,
      plans: [
        ...current.plans,
        {
          id: `p${Date.now()}`,
          reason: String(input.reason ?? ""),
          start,
          durationMinutes: minutes,
          recurrence: String(input.recurrence ?? "once"),
          graceMinutes: Number(input.graceMinutes) || 15,
          notifyOverdue: input.notifyOverdue !== false,
          nextStart: start,
        },
      ],
    };
  }
  maintenance.update((all) => ({ ...all, [req.params.hostId]: next }));
  return { ...next, owned: true };
});
