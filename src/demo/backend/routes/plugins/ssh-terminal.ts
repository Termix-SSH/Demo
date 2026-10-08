import { del, get, post, put } from "../../router";
import { socket } from "../../sockets";
import { value } from "../../store";
import { hosts } from "../hosts";
import { FakeShell } from "../../shell";
import { DEMO_OFFLINE_HOSTS } from "../../../fixtures/hosts";
import { tmuxScreen } from "./tmux-monitor";

const P = "/plugin-api/ssh-terminal";

const SEED_HISTORY: Record<string, string[]> = {
  "1": [
    "sudo systemctl reload nginx",
    "docker compose pull && docker compose up -d",
    "tail -f /var/log/nginx/access.log",
    "df -h",
    "./deploy.sh",
    "git -C /srv/app log --oneline -5",
  ],
  "3": [
    "sudo -u postgres psql -c 'select now()'",
    "pg_lsclusters",
    "du -sh /var/lib/postgresql",
  ],
  "7": ["pvesh get /nodes", "qm list", "pct list", "zpool status"],
};
const history = value<Record<string, string[]>>(
  "command-history",
  () => SEED_HISTORY,
);

get(`${P}/client-settings`, () => ({
  sessionTimeoutMinutes: 30,
  sessionPersistence: true,
  commandHistoryEnabled: true,
  touchInput: {},
  user: {},
}));
put(`${P}/user-settings`, () => ({ success: true }));
get(`${P}/command-history/:hostId`, (req) =>
  [...(history.get()[req.params.hostId] ?? [])].reverse(),
);
post(`${P}/command-history`, (req) => {
  const { hostId, command } = req.body as { hostId: number; command: string };
  if (!command?.trim()) return { success: true };
  history.update((all) => {
    const list = (all[hostId] ?? []).filter((c) => c !== command);
    return { ...all, [hostId]: [...list, command].slice(-200) };
  });
  return { success: true };
});
post(`${P}/command-history/delete`, (req) => {
  const { hostId, command } = req.body as { hostId: number; command: string };
  history.update((all) => ({
    ...all,
    [hostId]: (all[hostId] ?? []).filter((c) => c !== command),
  }));
});
del(`${P}/command-history/:hostId`, (req) => {
  history.update((all) => ({ ...all, [req.params.hostId]: [] }));
});
put(`${P}/hosts/:hostId/auto-tmux`, () => ({ success: true }));
post(`${P}/image-storage/test`, () => ({
  success: true,
  message: "Demo storage is always reachable.",
}));

type HostConfig = {
  id?: number;
  name?: string;
  ip?: string;
  username?: string;
};

let sessionCounter = 0;

socket("/plugin-ws/ssh-terminal/terminal", (ws) => {
  let shell: FakeShell | null = null;

  const log = (stage: string, level: string, message: string) =>
    ws.send({ type: "connection_log", data: { stage, level, message } });

  ws.onMessage((raw) => {
    if (typeof raw !== "string") return;
    let msg: { type?: string; data?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const data = (msg.data ?? {}) as Record<string, unknown>;
    switch (msg.type) {
      case "connectToHost":
      case "attachSession": {
        const config = (data.hostConfig ?? {}) as HostConfig;
        const stored = config.id ? hosts.find(config.id) : undefined;
        const host = {
          name: stored?.name ?? config.name ?? "demo",
          ip: stored?.ip ?? config.ip ?? "10.0.0.2",
          username: (config.username || stored?.username || "deploy") as string,
        };
        const steps: Array<[number, () => void]> = [
          [0, () => log("dns", "info", `Resolving ${host.ip}`)],
          [180, () => log("tcp", "info", `Connecting to ${host.ip}:22`)],
          [
            380,
            () =>
              log(
                "handshake",
                "success",
                "SSH handshake complete (curve25519-sha256, ssh-ed25519)",
              ),
          ],
        ];
        if (config.id && DEMO_OFFLINE_HOSTS.has(config.id)) {
          steps.push([
            2200,
            () => {
              log("tcp", "error", `Connection to ${host.ip}:22 timed out`);
              ws.send({
                type: "error",
                message: `Failed to connect to host: connect ETIMEDOUT ${host.ip}:22`,
              });
            },
          ]);
        } else {
          steps.push(
            [
              560,
              () => log("auth", "success", `Authenticated as ${host.username}`),
            ],
            [
              700,
              () => {
                sessionCounter += 1;
                const sessionId = `demo-session-${sessionCounter}`;
                ws.send({ type: "sessionCreated", sessionId });
                ws.send({ type: "connected", message: "SSH connected" });
                shell = new FakeShell(host, (out) =>
                  ws.send({ type: "data", data: out }),
                );
                const tmux = data.tmuxAttachSession
                  ? tmuxScreen(
                      String(data.tmuxAttachSession),
                      Number(data.cols) || 120,
                    )
                  : null;
                if (tmux) {
                  ws.send({
                    type: "tmux_session_attached",
                    sessionName: data.tmuxAttachSession,
                  });
                  ws.send({ type: "data", data: tmux });
                  return;
                }
                shell.start();
                if (typeof data.initialPath === "string" && data.initialPath) {
                  shell.input(`cd ${data.initialPath}
`);
                }
                if (
                  typeof data.executeCommand === "string" &&
                  data.executeCommand
                ) {
                  shell.input(`${data.executeCommand}
`);
                }
              },
            ],
          );
        }
        for (const [delay, run] of steps) {
          setTimeout(() => {
            if (!ws.closed) run();
          }, delay);
        }
        break;
      }
      case "input":
        shell?.input(String(data ?? (msg as { data?: unknown }).data ?? ""));
        break;
      case "resize":
        ws.send({ type: "resized", cols: data.cols, rows: data.rows });
        break;
      case "ping":
        ws.send({ type: "pong" });
        break;
      case "get_cwd":
        ws.send({ type: "cwd", path: shell?.workingDirectory ?? "/" });
        break;
      case "disconnect":
        ws.send({ type: "disconnected", message: "Disconnected" });
        ws.close();
        break;
      case "listSessions":
        ws.send({ type: "sessionList", sessions: [] });
        break;
    }
  });
});
