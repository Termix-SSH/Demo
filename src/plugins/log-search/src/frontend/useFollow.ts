import { useCallback, useEffect, useRef, useState } from "react";
import { pluginWsUrl } from "@termix-ssh/plugin-sdk/ui";
import type { LogEntry, SearchRequest } from "../shared/types";

/** Most lines kept in the browser while following. */
export const MAX_KEPT = 2000;

export type FollowState = "idle" | "connecting" | "live" | "ended" | "error";

export interface HostProblem {
  hostId: number;
  host: string;
  message: string;
}

/**
 * Streams new matching lines from many hosts while `search` is set. Newest
 * lines come first, like a search result.
 */
export function useFollow(search: SearchRequest | null) {
  const [lines, setLines] = useState<LogEntry[]>([]);
  const [state, setState] = useState<FollowState>("idle");
  const [error, setError] = useState("");
  const [problems, setProblems] = useState<HostProblem[]>([]);
  const [dropped, setDropped] = useState(0);
  const [paused, setPausedState] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const key = search ? JSON.stringify(search) : "";

  const clear = useCallback(() => {
    setLines([]);
    setDropped(0);
  }, []);

  const setPaused = useCallback((next: boolean) => {
    setPausedState(next);
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "pause", data: next }));
    }
  }, []);

  useEffect(() => {
    if (!search) {
      setState("idle");
      return;
    }
    let closed = false;
    setState("connecting");
    setError("");
    setProblems([]);
    setLines([]);
    setDropped(0);
    setPausedState(false);

    void (async () => {
      try {
        const resolved = await pluginWsUrl("log-search", "/follow", {
          origin: "local",
        });
        if (closed) return;
        if (!resolved) throw new Error("No server to connect to");
        const ws = new WebSocket(resolved.url, resolved.protocols);
        wsRef.current = ws;
        ws.onopen = () => {
          ws.send(JSON.stringify({ type: "connect", data: search }));
        };
        ws.onmessage = (event) => {
          let message: {
            type?: string;
            data?: LogEntry[];
            dropped?: number;
            message?: string;
            hostId?: number;
            host?: string;
          };
          try {
            message = JSON.parse(String(event.data));
          } catch {
            return;
          }
          switch (message.type) {
            case "started":
              setState("live");
              break;
            case "lines":
              if (Array.isArray(message.data)) {
                const incoming = [...message.data].reverse();
                setLines((prev) => incoming.concat(prev).slice(0, MAX_KEPT));
              }
              if (message.dropped) {
                setDropped((prev) => prev + (message.dropped ?? 0));
              }
              break;
            case "hostError":
              setProblems((prev) => [
                ...prev.filter((p) => p.hostId !== message.hostId),
                {
                  hostId: message.hostId ?? 0,
                  host: message.host ?? "",
                  message: message.message ?? "",
                },
              ]);
              break;
            case "error":
              setError(message.message ?? "");
              setState("error");
              break;
            case "ended":
              setState((prev) => (prev === "error" ? prev : "ended"));
              break;
          }
        };
        ws.onclose = () => {
          if (!closed) setState((prev) => (prev === "live" ? "ended" : prev));
        };
      } catch (e) {
        if (closed) return;
        setError(e instanceof Error ? e.message : String(e));
        setState("error");
      }
    })();

    return () => {
      closed = true;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        try {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "disconnect" }));
          }
          ws.close();
        } catch {
          // already closed
        }
      }
    };
    // key stands in for search, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { lines, state, error, problems, dropped, paused, setPaused, clear };
}
