import { useEffect, useMemo, useRef, useState } from "react";
import { useXTerm } from "react-xtermjs";
import { FitAddon } from "@xterm/addon-fit";
import {
  useSlotContributions,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  LoadingState,
  NoticePanel,
  Segmented,
  pluginWsUrl,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { VmDetail } from "../shared/types";
import { errorCode, errorMessage, openConsole, switchToVnc } from "./api";
import { useAction } from "./useAction";

const REMOTE_DISPLAY_SLOT = "session.remoteDisplay";

type Mode = "graphical" | "serial";

export function VmConsole({
  hostId,
  vm,
  isVisible,
  onChanged,
}: {
  hostId: number;
  vm: VmDetail;
  isVisible: boolean;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>(
    vm.graphics.length ? "graphical" : "serial",
  );
  const running = vm.state === "running" || vm.state === "paused";

  if (!running) {
    return <NoticePanel title={t("console.notRunning")} />;
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ToolbarBand>
        <Segmented
          value={mode}
          onChange={(next) => setMode(next as Mode)}
          options={[
            { value: "graphical", label: t("console.graphical") },
            { value: "serial", label: t("console.serial") },
          ]}
        />
      </ToolbarBand>
      <div className="relative min-h-0 flex-1">
        {mode === "graphical" ? (
          <GraphicalConsole
            hostId={hostId}
            vm={vm}
            isVisible={isVisible}
            onChanged={onChanged}
          />
        ) : (
          <SerialConsole hostId={hostId} uuid={vm.uuid} isVisible={isVisible} />
        )}
      </div>
    </div>
  );
}

/** The screen, drawn by Remote Desktop through its shared display slot. */
function GraphicalConsole({
  hostId,
  vm,
  isVisible,
  onChanged,
}: {
  hostId: number;
  vm: VmDetail;
  isVisible: boolean;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const contributions = useSlotContributions(REMOTE_DISPLAY_SLOT);
  const display = useMemo(
    () =>
      contributions.find((item) => item.kind === "component" && item.component),
    [contributions],
  );
  const [token, setToken] = useState("");
  const [failed, setFailed] = useState<{ text: string; code: string } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const action = useAction(onChanged);

  useEffect(() => {
    let current = true;
    setToken("");
    setFailed(null);
    openConsole(hostId, vm.uuid)
      .then((result) => {
        if (current) setToken(result.token);
      })
      .catch((error) => {
        if (current) {
          setFailed({
            text: errorMessage(error, t("console.failed")),
            code: errorCode(error),
          });
        }
      });
    return () => {
      current = false;
    };
  }, [hostId, vm.uuid, attempt, t]);

  if (failed) {
    return (
      <NoticePanel
        title={failed.text}
        tone="warning"
        action={
          failed.code === "spice" ? (
            <Button
              disabled={action.busy}
              onClick={() =>
                void action.run(
                  () => switchToVnc(hostId, vm.uuid),
                  t("console.vncSaved"),
                )
              }
            >
              {t("console.useVnc")}
            </Button>
          ) : (
            <Button variant="ghost" onClick={() => setAttempt((n) => n + 1)}>
              {t("console.retry")}
            </Button>
          )
        }
      />
    );
  }
  if (!display?.component) {
    return <NoticePanel title={t("console.noRemoteDesktop")} tone="warning" />;
  }
  if (!token) return <LoadingState label={t("console.connecting")} />;
  const Display = display.component;
  return (
    <div className="absolute inset-0">
      <Display
        token={token}
        protocol="vnc"
        isVisible={isVisible}
        onError={(text: string) =>
          setFailed({ text: text || t("console.failed"), code: "" })
        }
      />
    </div>
  );
}

/** A text console over the VM's serial port. */
function SerialConsole({
  hostId,
  uuid,
  isVisible,
}: {
  hostId: number;
  uuid: string;
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
      const target = await pluginWsUrl("virtual-machines", "/console");
      if (closed) return;
      const ws = new WebSocket(target.url, target.protocols);
      socket.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            type: "connect",
            data: {
              hostId,
              uuid,
              cols: terminal.cols,
              rows: terminal.rows,
            },
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
        else if (message.type === "connected") setNote("");
        else if (message.type === "error") setNote(message.message ?? "");
        else if (message.type === "disconnected") {
          setNote(t("console.ended"));
        }
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
  }, [terminal, hostId, uuid, t]);

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
    <div className="absolute inset-0 flex flex-col bg-background">
      <p className="border-b border-border px-3 py-1 text-xs text-muted-foreground">
        {note || t("console.serialHint")}
      </p>
      <div ref={ref as never} className="min-h-0 flex-1 p-1" />
    </div>
  );
}
