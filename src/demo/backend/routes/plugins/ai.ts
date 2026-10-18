import { del, get, patch, post, put } from "../../router";
import { rawFetch } from "../../fetch";
import { collection } from "../../store";

// The AI assistant answers from a few canned replies that read the demo's
// hosts, run a safe command and propose a change for the user to approve.

const P = "/plugin-api/ai";
const now = () => new Date().toISOString();

const providers = collection("ai-providers", () => [
  {
    id: 1,
    providerType: "anthropic",
    label: "Claude",
    baseUrl: null,
    apiKeyPrefix: "sk-ant-",
    defaultModel: "claude-sonnet-5-5",
    modelOverrides: {},
    enabled: true,
    createdAt: now(),
  },
  {
    id: 2,
    providerType: "ollama",
    label: "Local Ollama",
    baseUrl: "http://gpu-box:11434",
    apiKeyPrefix: null,
    defaultModel: "qwen3:32b",
    modelOverrides: { "qwen3:32b": { contextWindow: 65536 } },
    enabled: true,
    createdAt: now(),
  },
]);

const MODELS: Record<string, string[]> = {
  anthropic: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
  openai: ["gpt-5", "gpt-5-mini"],
  gemini: ["gemini-3-pro", "gemini-3-flash"],
  ollama: ["qwen3:32b", "llama4:16x17b", "gpt-oss:20b"],
  openai_compatible: ["local-model"],
};

type Proposal = {
  id: number;
  conversationId: number;
  kind: string;
  summary: string | null;
  payload: string;
  status: "pending" | "applied" | "rejected" | "expired";
  resultSummary: string | null;
  createdAt: string;
};
const proposals = collection<Proposal>("ai-proposals", () => []);
const conversations = collection("ai-conversations", () => [
  {
    id: 1,
    title: "Why is the NAS slow?",
    providerId: 1,
    model: "claude-sonnet-5-5",
    createdAt: now(),
    updatedAt: now(),
  },
]);

get(`${P}/status`, () => ({
  globallyEnabled: true,
  enabled: true,
  allowReadOnlyCommands: true,
}));
put(`${P}/opt-in`, () => ({ success: true }));
get(`${P}/providers`, () => ({ providers: providers.all() }));
post(`${P}/providers`, (req) => {
  const body = req.body as Record<string, string>;
  const provider = providers.insert({
    id: providers.nextId(),
    providerType: body.providerType,
    label: body.label,
    baseUrl: body.baseUrl ?? null,
    apiKeyPrefix: body.apiKey ? body.apiKey.slice(0, 7) : null,
    defaultModel: body.defaultModel ?? null,
    modelOverrides: {},
    enabled: true,
    createdAt: now(),
  });
  return { provider };
});
patch(`${P}/providers/:id`, (req) => ({
  provider: providers.patch(req.params.id, req.body as object),
}));
del(`${P}/providers/:id`, (req) => {
  providers.remove(req.params.id);
});
get(`${P}/providers/:id/models`, (req) => ({
  models: MODELS[providers.find(req.params.id)?.providerType ?? ""] ?? [],
}));
// What each model's context window is and where it came from.
const WINDOWS: Record<string, number> = {
  "claude-sonnet-5-5": 1_000_000,
  "claude-opus-5-5": 1_000_000,
  "claude-haiku-5-5": 200_000,
  "gpt-5": 400_000,
  "gpt-5-mini": 400_000,
  "gemini-3-pro": 1_048_576,
  "gemini-3-flash": 1_048_576,
  "qwen3:32b": 40_960,
  "llama4:16x17b": 131_072,
  "gpt-oss:20b": 131_072,
};
get(`${P}/providers/:id/context`, (req) => {
  const provider = providers.find(req.params.id) as
    | {
        providerType: string;
        modelOverrides?: Record<string, { contextWindow?: number }>;
      }
    | undefined;
  return {
    models: (MODELS[provider?.providerType ?? ""] ?? []).map((model) => {
      const override = provider?.modelOverrides?.[model]?.contextWindow ?? null;
      const reported = WINDOWS[model] ?? null;
      return {
        model,
        contextWindow: override ?? reported ?? 32_768,
        source: override ? "override" : reported ? "provider" : "default",
        reservedOutput: 16_000,
        reportedWindow: reported,
        override,
      };
    }),
  };
});
post(`${P}/probe-models`, (req) => ({
  models: MODELS[(req.body as { providerType: string }).providerType] ?? [],
  source: "live",
}));
get(`${P}/conversations`, () => ({ conversations: conversations.all() }));
get(`${P}/conversations/:id`, (req) => ({
  conversation: conversations.find(req.params.id),
  messages: [],
  proposals: proposals
    .all()
    .filter((p) => String(p.conversationId) === req.params.id),
}));
del(`${P}/conversations/:id`, (req) => {
  conversations.remove(req.params.id);
});
post(`${P}/proposals/:id/apply`, async (req) => {
  await new Promise((resolve) => setTimeout(resolve, 900));
  const proposal = proposals.find(req.params.id);
  const summary =
    proposal?.kind === "propose_run_command"
      ? "Done on nas. Freed 3.4 GB of old journal logs."
      : "Done.";
  proposals.patch(req.params.id, { status: "applied", resultSummary: summary });
  return { success: true, summary };
});
post(`${P}/proposals/:id/reject`, (req) => {
  proposals.patch(req.params.id, { status: "rejected" });
});
post(`${P}/proposals/:id/mark-run-in-terminal`, () => ({
  success: true,
  summary: "Sent to the terminal.",
}));
get(`${P}/agents`, () => ({ sessions: [] }));

type Step =
  | { type: "tool"; name: string; args: object; result: unknown }
  | { type: "text"; text: string }
  | { type: "proposal"; kind: string; summary: string; payload: object };

function reply(message: string): Step[] {
  const text = message.toLowerCase();
  if (/^i (approved|rejected)/.test(text)) {
    return [
      {
        type: "text",
        text: !text.startsWith("i approved")
          ? "No problem, nothing was changed."
          : text.includes("automation")
            ? "Saved. **Backup watchdog** is on and alerts on-call if a backup goes missing."
            : "Done. **nas** has 3.4 GB more free space now, so the alert should clear on the next check.",
      },
    ];
  }
  if (/(automation|backup|schedule)/.test(text)) {
    return [
      {
        type: "tool",
        name: "list_automations",
        args: {},
        result: { count: 4 },
      },
      {
        type: "text",
        text: "You already back up `/srv` every night at 3:00 with **Nightly backup**. I can add a weekly check that alerts you if a backup has not finished in 26 hours.",
      },
      {
        type: "proposal",
        kind: "propose_create_automation",
        summary: "Create automation: Backup watchdog",
        payload: {
          name: "Backup watchdog",
          triggerType: "schedule",
          description: "Alert on-call if no backup finished in 26 hours",
        },
      },
    ];
  }
  return [
    {
      type: "tool",
      name: "list_hosts",
      args: { query: "nas" },
      result: { count: 1, hosts: ["nas"] },
    },
    {
      type: "tool",
      name: "run_command",
      args: { host: "nas", command: "df -h /" },
      result: {
        output:
          "Filesystem  Size  Used Avail Use% Mounted on\n/dev/md0    3.6T  2.9T  680G  81% /",
      },
    },
    {
      type: "tool",
      name: "run_command",
      args: { host: "nas", command: "journalctl --disk-usage" },
      result: { output: "Archived and active journals take up 3.4G." },
    },
    {
      type: "text",
      text: "**nas** is at **81%** disk use, which is what set off the alert.\n\nMost of the recent growth is system logs: the journal alone takes **3.4 GB**. Keeping only the last 7 days is safe and frees almost all of it.",
    },
    {
      type: "proposal",
      kind: "propose_run_command",
      summary: "Clear journal logs older than 7 days on nas",
      payload: {
        hostId: 8,
        command: "sudo journalctl --vacuum-time=7d",
        explanation: "Keeps a week of logs and removes the rest.",
      },
    },
  ];
}

rawFetch(
  (path) => path.startsWith(`${P}/chat/stream`),
  async (_path, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      message?: string;
      conversationId?: number;
    };
    const conversationId =
      body.conversationId ??
      conversations.insert({
        id: conversations.nextId(),
        title: (body.message ?? "New chat").slice(0, 60),
        providerId: 1,
        model: "claude-sonnet-5-5",
        createdAt: now(),
        updatedAt: now(),
      }).id;
    const encoder = new TextEncoder();
    const steps = reply(body.message ?? "");
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (data: object) =>
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
          );
        const pause = (ms: number) =>
          new Promise((resolve) => setTimeout(resolve, ms));
        send({ type: "conversation", conversationId });
        await pause(500);
        for (const step of steps) {
          if (init?.signal?.aborted) break;
          if (step.type === "tool") {
            send({ type: "tool_call", name: step.name, arguments: step.args });
            await pause(900);
            send({ type: "tool_result", name: step.name, result: step.result });
            await pause(300);
          } else if (step.type === "text") {
            for (const word of step.text.split(/(?<= )/)) {
              send({ type: "token", text: word });
              await pause(28 + Math.random() * 30);
            }
            await pause(300);
          } else {
            const proposal = proposals.insert({
              id: proposals.nextId(),
              conversationId,
              kind: step.kind,
              summary: step.summary,
              payload: JSON.stringify(step.payload),
              status: "pending",
              resultSummary: null,
              createdAt: now(),
            });
            send({ type: "proposal", proposal });
          }
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  },
);
