import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { pluginWsUrl } from "@termix-ssh/plugin-sdk/ui";
import type { InputEvent } from "../shared/types";
import { errorMessage, type KvmApi } from "./api";
import { BUTTONS, pointerPosition, shortcutEvents } from "./input";
import { Toolbar } from "./Toolbar";

const MOVE_GAP_MS = 16;

/** The screen of a KVM that Termix connects to. Frames arrive as JPEG over a socket. */
export function Screen({
  deviceId,
  isVisible,
  canPaste,
  api,
}: {
  deviceId: number;
  isVisible: boolean;
  canPaste: boolean;
  api: KvmApi;
}) {
  const { t } = useTranslation();
  const canvas = useRef<HTMLCanvasElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const socket = useRef<WebSocket | null>(null);
  const held = useRef(new Set<string>());
  const lastMove = useRef(0);
  const [note, setNote] = useState("");
  const [live, setLive] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const send = useCallback((event: InputEvent) => {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type: "input", data: event }));
    }
  }, []);

  const releaseKeys = useCallback(() => {
    for (const code of held.current) send({ t: "key", code, down: false });
    held.current.clear();
  }, [send]);

  useEffect(() => {
    if (!isVisible) return;
    let closed = false;
    let decoding = false;
    void (async () => {
      const target = await pluginWsUrl("ip-kvm", "/screen");
      if (closed) return;
      const ws = new WebSocket(target.url, target.protocols);
      ws.binaryType = "arraybuffer";
      socket.current = ws;
      ws.onopen = () => {
        setNote(t("screen.connecting"));
        ws.send(JSON.stringify({ type: "connect", data: { id: deviceId } }));
      };
      ws.onmessage = (event) => {
        if (typeof event.data === "string") {
          const message = JSON.parse(event.data) as {
            type: string;
            message?: string;
          };
          if (message.type === "started") {
            setLive(true);
            setNote("");
          } else if (message.type === "error") {
            setLive(false);
            setNote(message.message ?? t("screen.failed"));
          } else if (message.type === "ended") {
            setLive(false);
            setNote(message.message || t("screen.ended"));
          }
          return;
        }
        // Keep only the newest frame while one is still being decoded
        if (decoding) return;
        decoding = true;
        const blob = new Blob([event.data as ArrayBuffer], {
          type: "image/jpeg",
        });
        createImageBitmap(blob)
          .then((bitmap) => {
            const element = canvas.current;
            if (element) {
              if (
                element.width !== bitmap.width ||
                element.height !== bitmap.height
              ) {
                element.width = bitmap.width;
                element.height = bitmap.height;
              }
              element.getContext("2d")?.drawImage(bitmap, 0, 0);
            }
            bitmap.close();
          })
          .catch(() => {})
          .finally(() => {
            decoding = false;
          });
      };
      ws.onerror = () => setNote(t("screen.failed"));
      ws.onclose = () => setLive(false);
    })().catch(() => setNote(t("screen.failed")));
    return () => {
      closed = true;
      socket.current?.close();
      socket.current = null;
      held.current.clear();
      setLive(false);
    };
  }, [deviceId, isVisible, attempt, t]);

  // React wheel listeners are passive, so this one is added by hand
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      send({ t: "wheel", dy: event.deltaY });
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, [send]);

  function runShortcut(name: string) {
    for (const event of shortcutEvents(name)) send(event);
    wrap.current?.focus();
  }

  async function paste(text: string) {
    try {
      await api.paste(deviceId, text);
    } catch (error) {
      toast.error(errorMessage(error));
      throw error;
    }
  }

  function snapshot() {
    canvas.current?.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `kvm-${deviceId}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Toolbar
        note={note}
        live={live}
        onShortcut={runShortcut}
        onPaste={canPaste ? paste : undefined}
        onSnapshot={snapshot}
        onFullscreen={() => void wrap.current?.requestFullscreen?.()}
        onReconnect={() => setAttempt((value) => value + 1)}
      />
      <div
        ref={wrap}
        tabIndex={0}
        className="flex min-h-0 flex-1 items-center justify-center bg-black outline-none"
        onBlur={releaseKeys}
        onKeyDown={(event) => {
          if (!live) return;
          event.preventDefault();
          if (event.repeat) return;
          held.current.add(event.code);
          send({ t: "key", code: event.code, down: true });
        }}
        onKeyUp={(event) => {
          if (!live) return;
          event.preventDefault();
          held.current.delete(event.code);
          send({ t: "key", code: event.code, down: false });
        }}
      >
        <canvas
          ref={canvas}
          width={640}
          height={360}
          className="max-h-full max-w-full cursor-crosshair object-contain"
          onContextMenu={(event) => event.preventDefault()}
          onMouseMove={(event) => {
            if (!live) return;
            const now = performance.now();
            if (now - lastMove.current < MOVE_GAP_MS) return;
            lastMove.current = now;
            send({ t: "move", ...pointerPosition(event.currentTarget, event) });
          }}
          onMouseDown={(event) => {
            wrap.current?.focus();
            if (!live) return;
            event.preventDefault();
            send({ t: "move", ...pointerPosition(event.currentTarget, event) });
            send({
              t: "button",
              button: BUTTONS[event.button] ?? 0,
              down: true,
            });
          }}
          onMouseUp={(event) => {
            if (!live) return;
            send({
              t: "button",
              button: BUTTONS[event.button] ?? 0,
              down: false,
            });
          }}
        />
      </div>
    </div>
  );
}
