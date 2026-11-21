import { useEffect, useRef } from "react";
import { Server } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  defaultConnectAction,
  Kbd,
  runHostAction,
  shell as shellApi,
  useHostActions,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";

const SHOWN = 8;

/** What shows with nothing open: the keys to start, and a few hosts. */
export function EmptyState() {
  const { t } = useTranslation();
  const shell = useShellController();
  const hostActions = useHostActions();
  const firstRef = useRef<HTMLButtonElement>(null);
  const hosts = shell.hosts.list.slice(0, SHOWN);

  useEffect(() => {
    firstRef.current?.focus({ preventScroll: true });
  }, [shell.hosts.loaded]);

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center overflow-y-auto bg-background p-4 font-mono">
      <div className="flex w-full max-w-md flex-col gap-4 text-sm">
        <div className="flex flex-col gap-1.5 text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>K</Kbd>
            <span>{t("terminalLayout.empty.palette")}</span>
          </p>
          <p className="flex items-center gap-1.5">
            <Kbd>Ctrl</Kbd>
            <span>+</span>
            <Kbd>Space</Kbd>
            <span>{t("terminalLayout.empty.prefix")}</span>
          </p>
        </div>
        {hosts.length > 0 ? (
          <div className="flex flex-col border border-border">
            <p className="border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              {t("terminalLayout.empty.hosts")}
            </p>
            {hosts.map((host, i) => (
              <button
                key={host.id}
                ref={i === 0 ? firstRef : undefined}
                type="button"
                onClick={() => {
                  const action = defaultConnectAction(hostActions, host);
                  if (action) runHostAction(action, host, shellApi);
                }}
                onKeyDown={(event) => {
                  if (event.ctrlKey || event.metaKey || event.altKey) return;
                  const step =
                    event.key === "ArrowDown" || event.key === "j"
                      ? 1
                      : event.key === "ArrowUp" || event.key === "k"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const buttons = Array.from(
                    event.currentTarget.parentElement?.querySelectorAll(
                      "button",
                    ) ?? [],
                  );
                  const at = buttons.indexOf(event.currentTarget);
                  buttons[
                    (at + step + buttons.length) % buttons.length
                  ]?.focus();
                }}
                className="flex items-center gap-2 px-3 py-1.5 text-left hover:bg-muted/40 focus:bg-accent-brand/15 focus:outline-none"
              >
                <Server className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{host.name}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {host.username ? `${host.username}@` : ""}
                  {host.ip}
                </span>
              </button>
            ))}
          </div>
        ) : (
          shell.hosts.loaded && (
            <button
              type="button"
              onClick={() =>
                shell.tabs.openSingleton(
                  "host-manager",
                  "host-manager:add-host",
                )
              }
              className="border border-border px-3 py-2 text-left hover:bg-muted/40"
            >
              {t("terminalLayout.empty.addHost")}
            </button>
          )
        )}
      </div>
    </div>
  );
}
