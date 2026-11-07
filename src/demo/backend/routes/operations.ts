import { isRecording } from "../recording";
import { get, HttpError, post } from "../router";
import { hosts } from "./hosts";
import { MANIFESTS } from "./plugins";

/** Core's /operations routes, built from the demo's own plugin manifests. */

type Strings = Record<string, unknown>;

const locales = import.meta.glob<Strings>(
  "../../../plugins/*/locales/en.json",
  {
    eager: true,
    import: "default",
  },
);

function stringsFor(pluginId: string): Strings {
  return (
    Object.entries(locales).find(([file]) =>
      file.includes(`/plugins/${pluginId}/locales/`),
    )?.[1] ?? {}
  );
}

function lookup(strings: Strings, key?: string): string | undefined {
  if (!key) return undefined;
  let node: unknown = strings;
  for (const part of key.split(".")) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

interface DeclaredField {
  key: string;
  labelKey?: string;
  descriptionKey?: string;
  options?: { value: string; labelKey?: string }[];
}

interface Declared {
  id: string;
  titleKey: string;
  descriptionKey?: string;
  inputs?: DeclaredField[];
  [key: string]: unknown;
}

interface Operations {
  actions?: Declared[];
  events?: Declared[];
  resources?: (Declared & { columns?: { key: string; titleKey: string }[] })[];
  signals?: Declared[];
}

function catalog() {
  const out = {
    actions: [] as unknown[],
    events: [] as unknown[],
    resources: [] as unknown[],
    signals: [] as unknown[],
  };
  for (const manifest of Object.values(MANIFESTS)) {
    const operations = (
      manifest as { contributes?: { operations?: Operations } }
    ).contributes?.operations;
    if (!operations) continue;
    const strings = stringsFor(manifest.id);
    const text = (key?: string) => lookup(strings, key) ?? key ?? "";
    for (const action of operations.actions ?? []) {
      out.actions.push({
        ...action,
        pluginId: manifest.id,
        pluginName: manifest.name,
        official: true,
        available: true,
        title: text(action.titleKey),
        description: action.descriptionKey
          ? text(action.descriptionKey)
          : undefined,
        inputs: (action.inputs ?? []).map((field) => ({
          ...field,
          label: text(field.labelKey) || field.key,
          description: field.descriptionKey
            ? text(field.descriptionKey)
            : undefined,
          optionLabels: Object.fromEntries(
            (field.options ?? []).map((option) => [
              option.value,
              text(option.labelKey) || option.value,
            ]),
          ),
        })),
        outputs: [],
        inputSchema: { type: "object", properties: {} },
        // Like core: the hosts whose settings match the action's `when`.
        hostIds:
          action.when?.settings && action.scope !== "server"
            ? hosts
                .all()
                .filter((host) => {
                  const own = (
                    host as {
                      pluginSettings?: Record<string, Record<string, unknown>>;
                    }
                  ).pluginSettings?.[manifest.id];
                  return Object.entries(action.when?.settings ?? {}).every(
                    ([key, value]) => (own?.[key] ?? false) === value,
                  );
                })
                .map((host) => host.id)
            : undefined,
      });
    }
    for (const event of operations.events ?? []) {
      out.events.push({
        ...event,
        pluginId: manifest.id,
        title: text(event.titleKey),
      });
    }
    for (const resource of operations.resources ?? []) {
      out.resources.push({
        ...resource,
        pluginId: manifest.id,
        title: text(resource.titleKey),
        columns: (resource.columns ?? []).map((column) => ({
          ...column,
          title: text(column.titleKey),
        })),
      });
    }
    for (const signal of operations.signals ?? []) {
      out.signals.push({
        ...signal,
        pluginId: manifest.id,
        title: text(signal.titleKey),
      });
    }
  }
  return out;
}

interface DemoRun {
  id: string;
  actionId: string;
  pluginId: string;
  username: string;
  origin: { kind: string };
  hostId: number | null;
  hostName: string | null;
  dryRun: boolean;
  risk: string;
  status: string;
  summary: string;
  input: unknown;
  undoAvailable: boolean;
  createdAt: string;
  finishedAt: string;
}

const runs: DemoRun[] = [];

get("/operations/catalog", () => catalog());

get("/operations/catalog/:id", (req) => {
  const action = (catalog().actions as { id: string }[]).find(
    (entry) => entry.id === req.params.id,
  );
  if (!action) throw new HttpError(404, { error: "Action not found" });
  return action;
});

post("/operations/:id/run", (req) => {
  const action = (
    catalog().actions as {
      id: string;
      pluginId: string;
      risk: string;
      title: string;
    }[]
  ).find((entry) => entry.id === req.params.id);
  if (!action) throw new HttpError(404, { error: "Action not found" });
  const body = (req.body ?? {}) as {
    hostId?: number;
    input?: unknown;
    dryRun?: boolean;
  };
  const host = hosts.all().find((entry) => entry.id === body.hostId);
  const run: DemoRun = {
    id: `demo-${Date.now()}`,
    actionId: action.id,
    pluginId: action.pluginId,
    username: "demo",
    origin: { kind: "ui" },
    hostId: host?.id ?? null,
    hostName: host?.name ?? null,
    dryRun: body.dryRun === true,
    risk: action.risk,
    status: "success",
    summary: body.dryRun
      ? `Would run ${action.title}${isRecording() ? "" : " (demo)"}`
      : `${action.title} done${isRecording() ? "" : " (demo)"}`,
    input: body.input ?? {},
    undoAvailable: false,
    createdAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  if (action.risk !== "read") runs.unshift(run);
  return {
    runId: run.id,
    status: "success",
    summary: run.summary,
    changed: !run.dryRun,
    data:
      action.risk === "read"
        ? { rows: [], status: "ok", label: "OK" }
        : undefined,
  };
});

get("/operations/runs", () => ({ runs: runs.slice(0, 100) }));
get("/operations/runs/:id", (req) => {
  const run = runs.find((entry) => entry.id === req.params.id);
  if (!run) throw new HttpError(404, { error: "Run not found" });
  return run;
});
post("/operations/runs/:id/cancel", () => ({ cancelled: false }));
get("/operations/approvals", () => ({ approvals: [] }));
get("/operations/events", () => ({ events: catalog().events }));
get("/operations/timeline", () => ({ events: [] }));

get("/operations/signals", () => ({
  signals: (catalog().signals as { id: string; scope: string }[]).map(
    (signal) => ({
      id: signal.id,
      hosts:
        signal.scope === "server"
          ? []
          : hosts.all().map((host) => ({
              hostId: host.id,
              state: "ok",
              value: { status: "ok", label: "OK" },
            })),
    }),
  ),
}));

get("/operations/resources/:id", () => ({
  rows: [],
  hosts: hosts.all().map((host) => ({ hostId: host.id, state: "ok" })),
}));

// Operations Center's own routes.
const OC = "/plugin-api/operations-center";
get(`${OC}/rules`, () => ({ rules: [] }));
get(`${OC}/rollouts`, () => ({ rollouts: [] }));
get(`${OC}/baselines`, () => ({ baselines: [] }));
get(`${OC}/attention`, () => ({ drifted: 0, rollouts: [] }));
