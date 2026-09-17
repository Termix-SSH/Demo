import React from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils.ts";
import { Button } from "@/components/button.tsx";
import { RefreshCw } from "lucide-react";
import { ConnectionLogPanel } from "@/components/connection/ConnectionLogPanel.tsx";
import type { ConnectionStatus } from "@/components/connection/connection-status.ts";

/**
 * The single loading screen every tab shows while it connects.
 *
 * Redrawn for this demo's chrome: a thin arc instead of the old 4px ring, the
 * host line in mono under the headline, and the connection log docked below on
 * the same hairline rhythm the panels use.
 */

interface ConnectionScreenProps {
  status: ConnectionStatus;
  message?: string;
  /** Second line under the headline, usually user@host:port. */
  detail?: string;
  backgroundColor?: string;
  attempt?: number;
  maxAttempts?: number;
  nextRetryInMs?: number | null;
  onManualRetry?: () => void;
  retryLabel?: string;
  disconnectedMessage?: string;
  extraActions?: React.ReactNode;
  logPosition?: "top" | "bottom";
  emptyState?: React.ReactNode;
  className?: string;
}

export function ConnectionScreen({
  status,
  message,
  detail,
  backgroundColor,
  attempt = 0,
  maxAttempts = 0,
  nextRetryInMs = null,
  onManualRetry,
  retryLabel,
  disconnectedMessage,
  extraActions,
  logPosition = "bottom",
  emptyState,
  className,
}: ConnectionScreenProps) {
  const { t } = useTranslation();

  if (status === "connected" && !emptyState) {
    return null;
  }

  const connecting = status === "connecting";
  const failed = status === "error" || status === "disconnected";
  const showRetryButton = failed && !!onManualRetry;
  const showLog = status !== "connected";

  return (
    <div
      className={cn("absolute inset-0 z-[100] flex flex-col", className)}
      style={{ backgroundColor: backgroundColor || "var(--bg-base)" }}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center p-6">
        {emptyState ? (
          emptyState
        ) : (
          <div className="flex flex-col items-center gap-3.5 text-center">
            <ConnectionMark failed={failed} />

            <div className="space-y-1.5">
              {message && (
                <p className="text-sm font-semibold tracking-tight text-foreground">
                  {failed
                    ? disconnectedMessage || t("connection.disconnected")
                    : message}
                </p>
              )}
              {detail && (
                <p className="font-mono text-xs text-muted-foreground">
                  {detail}
                </p>
              )}
              {attempt > 0 && !failed && (
                <p className="text-xs tabular-nums text-muted-foreground">
                  {nextRetryInMs && nextRetryInMs > 0
                    ? t("connection.retryingIn", {
                        seconds: Math.ceil(nextRetryInMs / 1000),
                        attempt,
                        max: maxAttempts,
                      })
                    : t("connection.retryingNow", {
                        attempt,
                        max: maxAttempts,
                      })}
                </p>
              )}
            </div>

            {(showRetryButton || (failed && extraActions)) && (
              <div className="flex gap-2 pt-0.5">
                {showRetryButton && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={onManualRetry}
                    className="gap-2 font-semibold"
                  >
                    <RefreshCw className="size-3.5" />
                    {retryLabel || t("connection.reconnect")}
                  </Button>
                )}
                {extraActions}
              </div>
            )}
          </div>
        )}
      </div>

      {showLog && !emptyState && (
        <ConnectionLogPanel
          isConnecting={connecting}
          isConnected={false}
          hasConnectionError={failed}
          position={logPosition}
        />
      )}
    </div>
  );
}

/** A thin arc while connecting, a still ring once it has given up. */
function ConnectionMark({ failed }: { failed: boolean }) {
  return (
    <div className="relative size-9">
      <svg viewBox="0 0 36 36" className="size-full" aria-hidden="true">
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          strokeWidth="2"
          className="stroke-border"
        />
        {!failed && (
          <circle
            cx="18"
            cy="18"
            r="15"
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="26 68"
            className="origin-center animate-spin stroke-accent-brand [animation-duration:900ms]"
          />
        )}
      </svg>
      {failed && (
        <span className="absolute inset-0 m-auto size-1.5 rounded-full bg-destructive" />
      )}
    </div>
  );
}
