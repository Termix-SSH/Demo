import { useEffect, useRef, useState } from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { pluginWsUrl } from "@termix-ssh/plugin-sdk/ui";

/** The BMC serial console, through a relay host. */
export function Sol({
  deviceId,
  isVisible,
}: {
  deviceId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const { instance: terminal, ref } = useXTerm();
  const fit = useRef<FitAddon | null>(null);
  const socket = useRef<WebSocket | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!terminal) return;
    const styles = getComputedStyle(document.documentElement);
    terminal.options.theme = {
      background: styles.getPropertyValue("--background").trim() || "#0a0a0a",
      foreground: styles.getPropertyValue("--foreground").trim() || "#fafafa",
    };
    const addon = new FitAddon();
    fit.current = addon;
    terminal.loadAddon(addon);
    addon.fit();
    const input = terminal.onData((data) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(JSON.stringify({ type: "input", data }));
      }
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (socket.current?.readyState === WebSocket.OPEN) {
        socket.current.send(
          JSON.stringify({ type: "resize", data: { cols, rows } }),
        );
      }
    });
    let closed = false;
    void (async () => {
      const target = await pluginWsUrl("out-of-band", "/sol");
      if (closed) return;
      const ws = new WebSocket(target.url, target.protocols);
      socket.current = ws;
      ws.onopen = () => {
        setNote(t("console.connecting"));
        ws.send(
          JSON.stringify({
            type: "connect",
            data: { id: deviceId, cols: terminal.cols, rows: terminal.rows },
          }),
        );
      };
      ws.onmessage = (event) => {
        const message = JSON.parse(String(event.data)) as {
          type: string;
          data?: string;
          message?: string;
        };
        if (message.type === "output") terminal.write(message.data ?? "");
        else if (message.type === "started") setNote("");
        else if (message.type === "error") setNote(message.message ?? "");
        else if (message.type === "ended") setNote(t("console.ended"));
      };
      ws.onerror = () => setNote(t("console.failed"));
    })().catch(() => setNote(t("console.failed")));
    return () => {
      closed = true;
      input.dispose();
      resize.dispose();
      socket.current?.close();
      socket.current = null;
    };
  }, [terminal, deviceId, t]);

  useEffect(() => {
    if (!isVisible) return;
    const element = (ref as { current: HTMLElement | null }).current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      try {
        fit.current?.fit();
      } catch {
        // Not laid out yet.
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [isVisible, ref]);

  return (
    <div className="flex h-[28rem] flex-col border-t border-border bg-background">
      <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
        {note || t("console.hint")}
      </p>
      <div ref={ref as never} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
