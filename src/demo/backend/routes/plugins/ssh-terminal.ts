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

/** Host auth types whose plugins ask for a browser sign-in on connect. */
const SIGN_IN_TYPES = new Set(["opkssh", "stepca", "vault"]);

socket("/plugin-ws/ssh-terminal/terminal", (ws) => {
  let shell: FakeShell | null = null;
  // A browser sign-in the connect is waiting on, and its fake progress.
  let pendingSignIn: (() => void) | null = null;
  let signInTimers: ReturnType<typeof setTimeout>[] = [];

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
          const open = () => {
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
          };
          const finish = (after: number) => {
            setTimeout(() => {
              if (ws.closed) return;
              log("auth", "success", `Authenticated as ${host.username}`);
              setTimeout(() => !ws.closed && open(), 140);
            }, after);
          };
          if (stored?.pluginSettings?.warpgate?.useWarpgate === true) {
            // Warpgate asks for a browser approval before the shell opens.
            steps.push([
              560,
              () => {
                pendingSignIn = () => finish(200);
                ws.send({
                  type: "warpgate_auth_required",
                  kind: "browser",
                  label: "Warpgate",
                  url: "https://warpgate.example.com/@warpgate#/login",
                  securityKey: "7 K 2 Q",
                });
              },
            ]);
          } else if (stored?.authType && SIGN_IN_TYPES.has(stored.authType)) {
            const type = stored.authType;
            steps.push([
              560,
              () => {
                pendingSignIn = () => finish(200);
                ws.send({ type: `${type}_auth_required`, hostId: config.id });
              },
            ]);
          } else {
            finish(560);
          }
        }
        for (const [delay, run] of steps) {
          setTimeout(() => {
            if (!ws.closed) run();
          }, delay);
        }
        break;
      }
      case "joinSharedSession": {
        // A teammate presenting web-01 in a meeting room.
        const stored = hosts.find(1);
        ws.send({ type: "sessionAttached", sessionId: "demo-shared-session" });
        shell = new FakeShell(
          {
            name: stored?.name ?? "web-01",
            ip: stored?.ip ?? "10.0.12.21",
            username: stored?.username ?? "deploy",
          },
          (out) => ws.send({ type: "data", data: out }),
        );
        shell.start();
        const typed = shell;
        let at = 1600;
        for (const command of ["uptime", "docker ps", "df -h"]) {
          for (const ch of `${command}\r`) {
            at += ch === "\r" ? 500 : 70 + Math.round(Math.random() * 60);
            signInTimers.push(
              setTimeout(() => !ws.closed && typed.input(ch), at),
            );
          }
          at += 1400;
        }
        break;
      }
      case "warpgate_auth_continue":
      case "opkssh_auth_completed":
      case "stepca_auth_completed":
      case "vault_auth_completed":
        pendingSignIn?.();
        pendingSignIn = null;
        break;
      case "opkssh_start_auth":
      case "stepca_start_auth":
      case "vault_start_auth": {
        const type = msg.type.replace(/_start_auth$/, "");
        // The sign-in happens in another tab, so play it out on a timer.
        const later = (ms: number, message: Record<string, unknown>) =>
          signInTimers.push(
            setTimeout(() => !ws.closed && ws.send(message), ms),
          );
        if (type === "vault") {
          ws.send({
            type: "vault_auth_url",
            url: "about:blank",
            requestId: "demo-vault",
            hostId: data.hostId,
          });
          later(4500, { type: "vault_completed" });
          break;
        }
        ws.send({
          type: `${type}_status`,
          stage: "chooser",
          requestId: `demo-${type}`,
          url: `https://termix.example.com/plugin-api/${type}/login`,
          ...(type === "opkssh"
            ? {
                providers: [
                  { alias: "google", issuer: "https://accounts.google.com" },
                  { alias: "authentik", issuer: "https://auth.example.com" },
                ],
              }
            : {}),
        });
        later(6000, { type: `${type}_status`, stage: "waiting" });
        later(7600, { type: `${type}_status`, stage: "authenticating" });
        later(8800, { type: `${type}_completed` });
        break;
      }
      case "opkssh_cancel":
      case "stepca_cancel":
      case "vault_cancel":
        signInTimers.forEach(clearTimeout);
        signInTimers = [];
        pendingSignIn = null;
        break;
      case "input":
        shell?.input(String(data ?? (msg as { data?: unknown }).data ?? ""));
        break;
      case "resize":
        ws.send({ type: "resized", cols: data.cols, rows: data.rows });
        shell?.resize(Number(data.cols) || 80);
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
