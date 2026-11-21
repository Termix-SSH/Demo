import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  LogOut,
  Maximize,
  Pause,
  Play,
  Tv,
  LayoutTemplate,
} from "lucide-react";
import {
  useSettings,
  useShell,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  getTabType,
  ShellConfirmCapture,
  SurfaceScope,
  TabStage,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";
import { activeViews, intervalSeconds, step } from "./views";

const CONTROLS_HIDE_MS = 3000;

type WakeLock = { release: () => Promise<void> };

/** Keeps the screen on while the board shows. Not every browser has it. */
function useWakeLock() {
  useEffect(() => {
    const api = (
      navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLock> };
      }
    ).wakeLock;
    if (!api) return;
    let lock: WakeLock | null = null;
    let stopped = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      api
        .request("screen")
        .then((next) => {
          if (stopped) void next.release().catch(() => {});
          else lock = next;
        })
        .catch(() => {});
    };
    take();
    // The browser drops the lock when the page is hidden.
    document.addEventListener("visibilitychange", take);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release().catch(() => {});
    };
  }, []);
}

function ControlButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="size-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
    >
      {children}
    </button>
  );
}

/**
 * Full screen status views for a TV or spare monitor. No sidebar, no tab bar
 * and nothing to click in the views: each one shows for a while, then the next.
 */
export function WallLayout() {
  const { t } = useTranslation();
  const shell = useShellController();
  const tabTypes = useShell()?.registries.useTabTypes() ?? [];
  const settings = useSettings("user");
  const { tabs } = shell;

  const registered = useMemo(
    () => new Set(tabTypes.map((type) => type.id)),
    [tabTypes],
  );
  const views = useMemo(
    () => activeViews(registered, settings.values),
    [registered, settings.values],
  );
  const viewKey = views.map((view) => view.tabType).join(",");
  const seconds = intervalSeconds(settings.values.intervalSeconds);

  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const current = views.length > 0 ? views[index % views.length] : undefined;
  const openSingleton = tabs.openSingleton;

  useWakeLock();

  useEffect(() => {
    if (index >= views.length) setIndex(0);
  }, [index, views.length]);

  // Show the current view, and put it back if something else took the stage.
  useEffect(() => {
    if (!tabs.ready || !current) return;
    if (tabs.active?.type !== current.tabType) openSingleton(current.tabType);
  }, [tabs.ready, tabs.active?.type, current, openSingleton]);

  useEffect(() => {
    if (paused || views.length < 2) return;
    const timer = setTimeout(
      () => setIndex((at) => step(at, views.length, 1)),
      seconds * 1000,
    );
    return () => clearTimeout(timer);
  }, [index, paused, seconds, viewKey, views.length]);

  const go = useCallback(
    (by: number) => setIndex((at) => step(at, views.length, by)),
    [views.length],
  );

  const showControls = useCallback(() => {
    setControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setControls(false), CONTROLS_HIDE_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "ArrowRight") go(1);
      else if (event.key === "ArrowLeft") go(-1);
      else if (event.key === " ") setPaused((value) => !value);
      else if (event.key === "f") shell.fullscreen.toggle();
      else return;
      event.preventDefault();
      showControls();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, showControls, shell.fullscreen]);

  const titleKey = current ? getTabType(current.tabType)?.titleKey : undefined;
  const title = titleKey ? t(titleKey) : "";
  const visible = controls || menuOpen;

  return (
    <div
      className={cn(
        "relative flex flex-col w-screen overflow-hidden bg-background",
        !visible && "cursor-none",
      )}
      style={{ height: "calc(100dvh - var(--termix-titlebar-height, 0px))" }}
    >
      <style>{`@keyframes termix-wall-progress{from{transform:scaleX(0)}to{transform:scaleX(1)}}`}</style>
      <SurfaceScope kind="tab" className="overflow-hidden">
        <ShellConfirmCapture />
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {current ? (
            <TabStage />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
              <Tv className="size-12 text-muted-foreground" />
              <p className="text-2xl font-semibold">{t("wall.noViews")}</p>
              <p className="max-w-lg text-sm text-muted-foreground">
                {t("wall.noViewsHint")}
              </p>
            </div>
          )}
        </div>
      </SurfaceScope>

      {/* Covers the views so nothing in them can be clicked or edited. */}
      <div
        data-testid="wall-cover"
        className="absolute inset-0 z-20"
        onMouseMove={showControls}
        onPointerDown={showControls}
      />

      {current && views.length > 1 && (
        <div className="absolute inset-x-0 bottom-0 z-30 h-1 bg-border/40">
          <div
            key={`${index}-${viewKey}-${paused}`}
            data-testid="wall-progress"
            className="h-full origin-left bg-accent-brand"
            style={{
              animation: paused
                ? undefined
                : `termix-wall-progress ${seconds}s linear forwards`,
              transform: paused ? "scaleX(0)" : undefined,
            }}
          />
        </div>
      )}

      <div
        role="toolbar"
        aria-label={t("layout.name")}
        aria-hidden={!visible}
        onMouseMove={showControls}
        className={cn(
          "absolute bottom-4 left-1/2 z-40 -translate-x-1/2 flex items-center border border-border bg-background/95 transition-opacity",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {title && (
          <span className="px-3 text-sm font-medium whitespace-nowrap">
            {title}
            <span className="ml-2 text-muted-foreground">
              {paused
                ? t("wall.paused")
                : t("wall.position", {
                    current: (index % views.length) + 1,
                    total: views.length,
                  })}
            </span>
          </span>
        )}
        <ControlButton label={t("wall.previous")} onClick={() => go(-1)}>
          <ChevronLeft className="size-4" />
        </ControlButton>
        <ControlButton
          label={paused ? t("wall.resume") : t("wall.pause")}
          onClick={() => setPaused((value) => !value)}
        >
          {paused ? <Play className="size-4" /> : <Pause className="size-4" />}
        </ControlButton>
        <ControlButton label={t("wall.next")} onClick={() => go(1)}>
          <ChevronRight className="size-4" />
        </ControlButton>
        <ControlButton
          label={t("wall.fullscreen")}
          onClick={shell.fullscreen.toggle}
        >
          <Maximize className="size-4" />
        </ControlButton>
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title={t("wall.leave")}
              aria-label={t("wall.leave")}
              className="size-10 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40"
            >
              <LogOut className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side="top"
            align="end"
            className="min-w-48 text-sm"
          >
            <p className="px-2 py-1.5 text-xs text-muted-foreground truncate">
              {shell.username}
            </p>
            <DropdownMenuItem
              onSelect={() => {
                // Core's layout picker, the same one a broken layout gets.
                const url = new URL(window.location.href);
                url.searchParams.set("safe-layout", "1");
                window.location.assign(url.toString());
              }}
            >
              <LayoutTemplate className="size-4" />
              {t("wall.changeLayout")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => shell.logout({ manual: true })}>
              <LogOut className="size-4" />
              {t("wall.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
