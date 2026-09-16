import { useEffect, useRef, useState } from "react";
import { useOptionalConnectionLog } from "@/ssh/connection-log/ConnectionLogContext";
import type { ConnectionStage, LogEntry } from "@/types/connection-log";
import type { ConnectionStatus } from "@/components/connection/connection-status";

/**
 * One connect sequence for every tab type.
 *
 * Each panel used to draw its own loader: a spinning RefreshCw for metrics,
 * tunnels, docker and proxmox, skeleton rows for tmux, and the terminal alone
 * got the real ConnectionScreen. They now all run this hook, which walks a
 * scripted set of stages into the shared connection log so the loading screen
 * looks and reads the same everywhere.
 */

type Step = {
  /** Delay after the previous step. */
  after: number;
  type: LogEntry["type"];
  stage: ConnectionStage;
  message: string;
};

export type DemoConnectionKind =
  | "terminal"
  | "files"
  | "host-metrics"
  | "tunnel"
  | "docker"
  | "proxmox"
  | "tmux";

/** The line under the spinner while a tab connects. */
const HEADLINES: Record<DemoConnectionKind, string> = {
  terminal: "Opening terminal session",
  files: "Opening file browser",
  "host-metrics": "Starting metrics stream",
  tunnel: "Loading tunnels",
  docker: "Connecting to Docker",
  proxmox: "Connecting to Proxmox",
  tmux: "Reading tmux sessions",
};

function sshHandshake(target: string): Step[] {
  return [
    {
      after: 120,
      type: "info",
      stage: "dns",
      message: `Resolving ${target.split("@")[1] ?? target}`,
    },
    { after: 180, type: "info", stage: "tcp", message: "TCP socket open" },
    {
      after: 220,
      type: "info",
      stage: "handshake",
      message: "SSH-2.0-OpenSSH_9.6p1 Ubuntu-3ubuntu13",
    },
    {
      after: 200,
      type: "info",
      stage: "auth",
      message: "Authenticating with publickey",
    },
    {
      after: 240,
      type: "success",
      stage: "connected",
      message: `Authenticated as ${target.split("@")[0]}`,
    },
  ];
}

function script(kind: DemoConnectionKind, target: string): Step[] {
  switch (kind) {
    case "terminal":
      return [
        ...sshHandshake(target),
        {
          after: 160,
          type: "info",
          stage: "connection",
          message: "Requesting pty (xterm-256color, 80x24)",
        },
        {
          after: 180,
          type: "success",
          stage: "connected",
          message: "Shell ready",
        },
      ];

    case "files":
      return [
        ...sshHandshake(target),
        {
          after: 160,
          type: "info",
          stage: "sftp_connecting",
          message: "Opening SFTP subsystem",
        },
        {
          after: 200,
          type: "success",
          stage: "sftp_connected",
          message: "SFTP session ready",
        },
      ];

    case "host-metrics":
      return [
        ...sshHandshake(target),
        {
          after: 150,
          type: "info",
          stage: "stats_connecting",
          message: "Reading /proc/stat and /proc/meminfo",
        },
        {
          after: 200,
          type: "info",
          stage: "stats_polling",
          message: "Polling every 2s",
        },
        {
          after: 160,
          type: "success",
          stage: "connected",
          message: "Metrics stream live",
        },
      ];

    case "tunnel":
      return [
        {
          after: 140,
          type: "info",
          stage: "tunnel_connecting",
          message: "Loading saved tunnels",
        },
        {
          after: 200,
          type: "info",
          stage: "tunnel_source",
          message: "Checking local ports",
        },
        {
          after: 220,
          type: "info",
          stage: "tunnel_endpoint",
          message: "Reading forwarding state",
        },
        {
          after: 180,
          type: "success",
          stage: "tunnel_connected",
          message: "Tunnel list ready",
        },
      ];

    case "docker":
      return [
        ...sshHandshake(target),
        {
          after: 150,
          type: "info",
          stage: "docker_connecting",
          message: "Reaching /var/run/docker.sock",
        },
        {
          after: 200,
          type: "info",
          stage: "docker_session",
          message: "Listing containers",
        },
        {
          after: 180,
          type: "success",
          stage: "docker_ready",
          message: "Docker engine ready",
        },
      ];

    case "proxmox":
      return [
        {
          after: 140,
          type: "info",
          stage: "connection",
          message: "Connecting to pve.home.arpa:8006",
        },
        {
          after: 200,
          type: "info",
          stage: "auth",
          message: "Authenticating with API token",
        },
        {
          after: 220,
          type: "info",
          stage: "validation",
          message: "Reading nodes, guests and storage",
        },
        {
          after: 180,
          type: "success",
          stage: "connected",
          message: "Cluster snapshot ready",
        },
      ];

    case "tmux":
      return [
        ...sshHandshake(target),
        {
          after: 150,
          type: "info",
          stage: "connection",
          message: "Running tmux list-sessions",
        },
        {
          after: 200,
          type: "success",
          stage: "connected",
          message: "Sessions attached",
        },
      ];
  }
}

export interface DemoConnectionOptions {
  kind: DemoConnectionKind;
  /** user@host:port, shown under the spinner and used in the log lines. */
  target?: string;
  /** Skips the connect sequence and reports an unreachable host. */
  offline?: boolean;
}

export interface DemoConnection {
  status: ConnectionStatus;
  isConnecting: boolean;
  /** Headline for the connection screen. */
  message: string;
  /** Second line, the host being reached. */
  detail?: string;
  retry: () => void;
}

export function useDemoConnection({
  kind,
  target = "demo@termix",
  offline = false,
}: DemoConnectionOptions): DemoConnection {
  const log = useOptionalConnectionLog();
  const addLog = log?.addLog;
  const clearLogs = log?.clearLogs;
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [nonce, setNonce] = useState(0);
  // Keeps the effect off addLog's identity, which changes on every log append.
  const addLogRef = useRef(addLog);
  addLogRef.current = addLog;

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    clearLogs?.();
    setStatus("connecting");

    if (offline) {
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          addLogRef.current?.({
            type: "info",
            stage: "dns",
            message: `Resolving ${target.split("@")[1] ?? target}`,
          });
        }, 160),
        setTimeout(() => {
          if (cancelled) return;
          addLogRef.current?.({
            type: "error",
            stage: "error",
            message: "No route to host. The host is marked offline.",
          });
          setStatus("disconnected");
        }, 900),
      );
      return () => {
        cancelled = true;
        timers.forEach(clearTimeout);
      };
    }

    let elapsed = 0;
    const steps = script(kind, target);
    steps.forEach((step) => {
      elapsed += step.after;
      timers.push(
        setTimeout(() => {
          if (cancelled) return;
          addLogRef.current?.({
            type: step.type,
            stage: step.stage,
            message: step.message,
          });
        }, elapsed),
      );
    });
    timers.push(
      setTimeout(() => {
        if (!cancelled) setStatus("connected");
      }, elapsed + 160),
    );

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [kind, target, offline, nonce, clearLogs]);

  return {
    status,
    isConnecting: status !== "connected",
    message: offline ? "Host unreachable" : HEADLINES[kind],
    detail: target,
    retry: () => setNonce((n) => n + 1),
  };
}
