import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import { createKeyboard } from "../shared/hid";
import type { InputEvent } from "../shared/types";
import { errorMessage, type KvmApi } from "./api";
import { BUTTONS, keyName, pointerPosition, shortcutEvents } from "./input";
import { useFullscreen } from "./fullscreen";
import { Toolbar } from "./Toolbar";

const ABS = 32767;
const GATHER_MS = 2500;

type Atx = "power-short" | "power-long" | "reset";

/**
 * A JetKVM screen. Termix only passes the WebRTC offer and answer, so the
 * browser must be able to reach the JetKVM itself for the video.
 */
export function JetScreen({
  deviceId,
  isVisible,
  canPower,
  api,
}: {
  deviceId: number;
  isVisible: boolean;
  canPower: boolean;
  api: KvmApi;
}) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [fullscreen, toggleFullscreen] = useFullscreen(root);
  const channel = useRef<RTCDataChannel | null>(null);
  const keyboard = useRef(createKeyboard());
  const rpcId = useRef(1);
  const buttons = useRef(0);
  const lastPosition = useRef({ x: 0, y: 0 });
  const [note, setNote] = useState("");
  const [live, setLive] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const rpc = useCallback((method: string, params: Record<string, unknown>) => {
    if (channel.current?.readyState !== "open") return;
    channel.current.send(
      JSON.stringify({ jsonrpc: "2.0", method, params, id: rpcId.current++ }),
    );
  }, []);

  const send = useCallback(
    (event: InputEvent) => {
      if (event.t === "key") {
        const report = keyboard.current.press(event.code, event.down);
        if (report)
          rpc("keyboardReport", { modifier: report[0], keys: report.slice(2) });
      } else if (event.t === "move" || event.t === "button") {
        if (event.t === "button") {
          const bit = [1, 4, 2][event.button] ?? 0;
          buttons.current = event.down
            ? buttons.current | bit
            : buttons.current & ~bit;
        }
        const position = event.t === "move" ? event : lastPosition.current;
        lastPosition.current = position;
        rpc("absMouseReport", {
          x: Math.round(position.x * ABS),
          y: Math.round(position.y * ABS),
          buttons: buttons.current,
        });
      } else if (event.t === "wheel") {
        rpc("wheelReport", { wheelY: event.dy > 0 ? -1 : 1 });
      }
    },
    [rpc],
  );

  useEffect(() => {
    if (!isVisible) return;
    let closed = false;
    const peer = new RTCPeerConnection({ iceServers: [] });
    peer.addTransceiver("video", { direction: "recvonly" });
    peer.addTransceiver("audio", { direction: "recvonly" });
    const rpcChannel = peer.createDataChannel("rpc");
    channel.current = rpcChannel;
    rpcChannel.onopen = () => {
      setLive(true);
      setNote("");
    };
    rpcChannel.onclose = () => setLive(false);
    peer.ontrack = (event) => {
      if (video.current && event.track.kind === "video") {
        video.current.srcObject =
          event.streams[0] ?? new MediaStream([event.track]);
      }
    };
    setNote(t("screen.connecting"));
    void (async () => {
      await peer.setLocalDescription(await peer.createOffer());
      // Wait for the local candidates, but not forever
      await new Promise<void>((resolve) => {
        if (peer.iceGatheringState === "complete") return resolve();
        const timer = setTimeout(resolve, GATHER_MS);
        peer.addEventListener("icegatheringstatechange", () => {
          if (peer.iceGatheringState === "complete") {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      if (closed || !peer.localDescription) return;
      const answer = await api.session(
        deviceId,
        btoa(JSON.stringify(peer.localDescription)),
      );
      if (closed) return;
      await peer.setRemoteDescription(JSON.parse(atob(answer)));
    })().catch((error: unknown) => {
      if (!closed) setNote(errorMessage(error) || t("screen.failed"));
    });
    return () => {
      closed = true;
      channel.current = null;
      peer.close();
      setLive(false);
    };
  }, [api, deviceId, isVisible, attempt, t]);

  function atx(action: Atx) {
    rpc("setATXPowerAction", { action });
    toast.success(t("power.sentShort"));
  }

  function snapshot() {
    const element = video.current;
    if (!element?.videoWidth) return;
    const draw = document.createElement("canvas");
    draw.width = element.videoWidth;
    draw.height = element.videoHeight;
    draw.getContext("2d")?.drawImage(element, 0, 0);
    draw.toBlob((blob) => {
      if (!blob) return;
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `kvm-${deviceId}.png`;
      link.click();
      URL.revokeObjectURL(link.href);
    });
  }

  return (
    <div ref={root} className="flex min-h-0 flex-1 flex-col bg-background">
      <Toolbar
        note={note}
        live={live}
        onShortcut={(name) => {
          for (const event of shortcutEvents(name)) send(event);
          wrap.current?.focus();
        }}
        onSnapshot={snapshot}
        fullscreen={fullscreen}
        onFullscreen={toggleFullscreen}
        onReconnect={() => setAttempt((value) => value + 1)}
        extra={
          canPower && (
            <>
              <Button
                variant="outline"
                disabled={!live}
                onClick={() => atx("power-short")}
              >
                {t("power.action.on")}
              </Button>
              <Button
                variant="outline"
                disabled={!live}
                onClick={() => atx("power-long")}
              >
                {t("power.action.off")}
              </Button>
              <Button
                variant="outline"
                disabled={!live}
                onClick={() => atx("reset")}
              >
                {t("power.action.reset")}
              </Button>
            </>
          )
        }
      />
      <div
        ref={wrap}
        tabIndex={0}
        className="flex min-h-0 flex-1 items-center justify-center bg-black outline-none"
        onBlur={() => {
          rpc("keyboardReport", { modifier: 0, keys: [0, 0, 0, 0, 0, 0] });
          keyboard.current.release();
        }}
        onKeyDown={(event) => {
          if (!live) return;
          event.preventDefault();
          const code = keyName(event);
          if (code && !event.repeat) send({ t: "key", code, down: true });
        }}
        onKeyUp={(event) => {
          if (!live) return;
          event.preventDefault();
          const code = keyName(event);
          if (code) send({ t: "key", code, down: false });
        }}
      >
        <video
          ref={video}
          autoPlay
          playsInline
          muted
          className="max-h-full max-w-full cursor-crosshair object-contain"
          onContextMenu={(event) => event.preventDefault()}
          onMouseMove={(event) =>
            live &&
            send({ t: "move", ...pointerPosition(event.currentTarget, event) })
          }
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
          onMouseUp={(event) =>
            live &&
            send({
              t: "button",
              button: BUTTONS[event.button] ?? 0,
              down: false,
            })
          }
          onWheel={(event) => live && send({ t: "wheel", dy: event.deltaY })}
        />
      </div>
    </div>
  );
}
