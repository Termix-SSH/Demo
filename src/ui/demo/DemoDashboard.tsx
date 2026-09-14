import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Check,
  Database,
  ExternalLink,
  Eye,
  GripVertical,
  KeyRound,
  LayoutGrid,
  Network,
  Pencil,
  Plus,
  RotateCcw,
  Server,
  Settings,
  Terminal,
  User,
  X,
  Zap,
} from "lucide-react";
import { Button } from "@/components/button";
import { Kbd } from "@/components/kbd";
import { VersionBadge } from "@/components/version-badge";
import {
  Facts,
  GroupHeading,
  PanelShell,
  Segmented,
} from "@/components/panel-layout";
import {
  getStatusClasses,
  useStatusColorScheme,
} from "@/hooks/use-status-color-scheme";
import type { Host, TabType } from "@/types/ui-types";
import {
  DEMO_ACTIVITY,
  DEMO_CREDENTIALS,
  DEMO_TUNNELS,
  type DemoActivityItem,
} from "@/demo/demo-data";
import {
  registerDashboardCard,
  useDashboardCards,
  type DashboardCardContext,
  type DashboardCardDef,
  type DashboardPanelId,
} from "@/demo/dashboard-cards";

/**
 * The dashboard, and the homepage that shares its frame.
 *
 * The old version hardcoded five cards in one tree with gap-4 between them, so
 * every number sat in its own floating box and there was no way to reorder,
 * hide or extend anything. Sections are registered now and laid out from a
 * saved slot list: two columns with a draggable divider, hairline rules instead
 * of gaps, and an edit mode for arranging them.
 *
 * Homepage is a view of this same tab rather than a tab of its own, which is
 * how the real app does it -- DashboardTab keeps a "dashboard" | "homepage"
 * state and swaps the body.
 */

type DashboardView = "dashboard" | "homepage";

interface CardSlot {
  key: string;
  id: string;
  panel: DashboardPanelId;
  order: number;
  /** null flexes to fill the column. */
  height: number | null;
}

const SLOTS_KEY = "termix-demo-dashboard-slots";
const WIDTH_KEY = "termix-demo-dashboard-width";
const VIEW_KEY = "termix-demo-dashboard-view";

const VIEW_OPTIONS = [
  { value: "dashboard", label: "Dashboard" },
  { value: "homepage", label: "Homepage" },
] as const satisfies readonly { value: DashboardView; label: string }[];

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private windows refuse writes; the layout just will not persist.
  }
}

/** Slots for whatever is registered and not marked optional. */
function defaultSlots(cards: DashboardCardDef[]): CardSlot[] {
  return cards
    .filter((card) => !card.optional)
    .map((card, i) => ({
      key: `${card.id}_0`,
      id: card.id,
      panel: card.defaultPanel,
      order: i,
      height: card.defaultHeight,
    }));
}

export function DemoDashboard({
  hosts,
  onOpenTab,
  onOpenSingletonTab,
}: {
  hosts: Host[];
  onOpenTab?: (host: Host, type: TabType) => void;
  onOpenSingletonTab?: (type: TabType) => void;
}) {
  const { t } = useTranslation();
  const cards = useDashboardCards();
  const bodyRef = useRef<HTMLDivElement | null>(null);

  const [view, setView] = useState<DashboardView>(() =>
    readJson<DashboardView>(VIEW_KEY, "dashboard"),
  );
  const [editing, setEditing] = useState(false);
  const [slots, setSlots] = useState<CardSlot[]>(
    () => readJson<CardSlot[] | null>(SLOTS_KEY, null) ?? [],
  );
  const [mainPct, setMainPct] = useState<number>(() =>
    readJson<number>(WIDTH_KEY, 62),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);

  // Seed the layout once cards have registered, so a plugin installed later
  // does not wipe what is already arranged.
  useEffect(() => {
    if (cards.length === 0) return;
    setSlots((prev) => (prev.length > 0 ? prev : defaultSlots(cards)));
  }, [cards]);

  useEffect(() => {
    if (slots.length > 0) write(SLOTS_KEY, slots);
  }, [slots]);
  useEffect(() => write(WIDTH_KEY, mainPct), [mainPct]);
  useEffect(() => write(VIEW_KEY, view), [view]);

  const ctx: DashboardCardContext = useMemo(
    () => ({
      hosts,
      credentialCount: DEMO_CREDENTIALS.length,
      activeTunnelCount: DEMO_TUNNELS.filter((tn) => tn.status === "running")
        .length,
      openTab: onOpenTab ?? (() => {}),
      openSingleton: onOpenSingletonTab ?? (() => {}),
    }),
    [hosts, onOpenTab, onOpenSingletonTab],
  );

  const placed = new Set(slots.map((s) => s.id));
  const available = cards.filter((card) => !placed.has(card.id));

  const mainSlots = slots
    .filter((s) => s.panel === "main")
    .sort((a, b) => a.order - b.order);
  const sideSlots = slots
    .filter((s) => s.panel === "side")
    .sort((a, b) => a.order - b.order);

  const startDividerDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startPct = mainPct;
      const move = (ev: MouseEvent) => {
        const box = bodyRef.current?.getBoundingClientRect();
        if (!box) return;
        const next = startPct + ((ev.clientX - startX) / box.width) * 100;
        setMainPct(Math.min(80, Math.max(30, next)));
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [mainPct],
  );

  const startSectionResize = useCallback(
    (e: React.MouseEvent, slot: CardSlot) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const box = (e.currentTarget as HTMLElement).parentElement;
      const startH = box?.getBoundingClientRect().height ?? 200;
      const move = (ev: MouseEvent) => {
        const next = Math.max(72, startH + (ev.clientY - startY));
        setSlots((prev) =>
          prev.map((s) => (s.key === slot.key ? { ...s, height: next } : s)),
        );
      };
      const up = () => {
        window.removeEventListener("mousemove", move);
        window.removeEventListener("mouseup", up);
      };
      window.addEventListener("mousemove", move);
      window.addEventListener("mouseup", up);
    },
    [],
  );

  function drop(panel: DashboardPanelId, order: number) {
    if (!dragKey) return;
    setSlots((prev) => {
      const moving = prev.find((s) => s.key === dragKey);
      if (!moving) return prev;
      const rest = prev.filter((s) => s.key !== dragKey);
      const target = rest
        .filter((s) => s.panel === panel)
        .sort((a, b) => a.order - b.order);
      const others = rest.filter((s) => s.panel !== panel);
      const at = target.findIndex((s) => s.order > order);
      const index = at === -1 ? target.length : at;
      const next = [
        ...target.slice(0, index),
        { ...moving, panel },
        ...target.slice(index),
      ].map((s, i) => ({ ...s, order: i }));
      return [...others, ...next];
    });
    setDragKey(null);
  }

  function hide(key: string) {
    setSlots((prev) => prev.filter((s) => s.key !== key));
  }

  function add(card: DashboardCardDef) {
    setSlots((prev) => [
      ...prev,
      {
        key: `${card.id}_${Date.now()}`,
        id: card.id,
        panel: card.defaultPanel,
        order: prev.filter((s) => s.panel === card.defaultPanel).length,
        height: card.defaultHeight,
      },
    ]);
  }

  const todayLabel = useMemo(
    () =>
      new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      }),
    [],
  );

  return (
    <PanelShell
      icon={<LayoutGrid className="size-4" />}
      title={view === "homepage" ? "Homepage" : t("dashboard.title")}
      status={todayLabel}
      scroll={false}
      actions={
        <>
          <div className="mr-1 hidden items-center gap-1.5 border border-border bg-muted/40 px-2 py-1 lg:flex">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("dashboardTab.commandPalette")}
            </span>
            <Kbd className="h-4 bg-background px-1 text-[10px]">Shift</Kbd>
            <Kbd className="h-4 bg-background px-1 text-[10px]">Shift</Kbd>
          </div>
          {view === "dashboard" && (
            <Button
              variant="ghost"
              size="icon"
              title={editing ? "Done" : "Arrange"}
              className={editing ? "text-accent-brand" : ""}
              onClick={() => setEditing((v) => !v)}
            >
              {editing ? (
                <Check className="size-4" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>
          )}
        </>
      }
      toolbar={
        <>
          <Segmented<DashboardView>
            value={view}
            onChange={setView}
            options={VIEW_OPTIONS}
          />
          {view === "dashboard" && editing && (
            <>
              <span className="hidden text-[10px] uppercase tracking-widest text-muted-foreground sm:inline">
                Drag to reorder
              </span>
              <Button
                variant="ghost"
                size="xs"
                className="gap-1"
                onClick={() => setSlots(defaultSlots(cards))}
              >
                <RotateCcw className="size-3" />
                Reset
              </Button>
            </>
          )}
          <Facts className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>
              {hosts.filter((h) => h.status === "online").length} online
            </span>
            <span>{hosts.length} hosts</span>
          </Facts>
        </>
      }
    >
      {view === "homepage" ? (
        <HomepageView />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <div ref={bodyRef} className="flex min-h-0 flex-1">
            <Column
              panel="main"
              slots={mainSlots}
              cards={cards}
              ctx={ctx}
              editing={editing}
              width={sideSlots.length > 0 ? `${mainPct}%` : "100%"}
              dragKey={dragKey}
              onDragStart={setDragKey}
              onDrop={drop}
              onHide={hide}
              onStartResize={startSectionResize}
            />

            {sideSlots.length > 0 && (
              <>
                <div
                  onMouseDown={startDividerDrag}
                  className="w-px shrink-0 cursor-col-resize bg-border transition-colors hover:bg-accent-brand"
                />
                <Column
                  panel="side"
                  slots={sideSlots}
                  cards={cards}
                  ctx={ctx}
                  editing={editing}
                  width={`${100 - mainPct}%`}
                  dragKey={dragKey}
                  onDragStart={setDragKey}
                  onDrop={drop}
                  onHide={hide}
                  onStartResize={startSectionResize}
                />
              </>
            )}
          </div>

          {editing && <AddTray cards={available} onAdd={add} />}
        </div>
      )}
    </PanelShell>
  );
}

/** One column of sections, separated by hairlines rather than gaps. */
function Column({
  panel,
  slots,
  cards,
  ctx,
  editing,
  width,
  dragKey,
  onDragStart,
  onDrop,
  onHide,
  onStartResize,
}: {
  panel: DashboardPanelId;
  slots: CardSlot[];
  cards: DashboardCardDef[];
  ctx: DashboardCardContext;
  editing: boolean;
  width: string;
  dragKey: string | null;
  onDragStart: (key: string) => void;
  onDrop: (panel: DashboardPanelId, order: number) => void;
  onHide: (key: string) => void;
  onStartResize: (e: React.MouseEvent, slot: CardSlot) => void;
}) {
  return (
    <div
      style={{ width }}
      className="flex min-h-0 min-w-0 flex-col overflow-y-auto"
      onDragOver={(e) => editing && e.preventDefault()}
      onDrop={() => editing && onDrop(panel, slots.length)}
    >
      {slots.length === 0 && editing && (
        <div className="m-2.5 flex flex-1 items-center justify-center border border-dashed border-border p-6 text-xs text-muted-foreground">
          Drop a section here
        </div>
      )}
      {slots.map((slot) => {
        const card = cards.find((c) => c.id === slot.id);
        if (!card) return null;
        return (
          <Section
            key={slot.key}
            slot={slot}
            card={card}
            ctx={ctx}
            editing={editing}
            dragging={dragKey === slot.key}
            onDragStart={() => onDragStart(slot.key)}
            onDrop={() => onDrop(panel, slot.order - 0.5)}
            onHide={() => onHide(slot.key)}
            onStartResize={(e) => onStartResize(e, slot)}
          />
        );
      })}
    </div>
  );
}

function Section({
  slot,
  card,
  ctx,
  editing,
  dragging,
  onDragStart,
  onDrop,
  onHide,
  onStartResize,
}: {
  slot: CardSlot;
  card: DashboardCardDef;
  ctx: DashboardCardContext;
  editing: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDrop: () => void;
  onHide: () => void;
  onStartResize: (e: React.MouseEvent) => void;
}) {
  const Icon = card.icon;
  const flex = slot.height === null;

  return (
    <div
      draggable={editing}
      onDragStart={onDragStart}
      onDragOver={(e) => editing && e.preventDefault()}
      onDrop={(e) => {
        if (!editing) return;
        e.stopPropagation();
        onDrop();
      }}
      style={{ height: slot.height ?? undefined }}
      className={`relative flex shrink-0 flex-col border-b border-border last:border-b-0 ${
        flex ? "min-h-48 flex-1" : ""
      } ${dragging ? "opacity-40" : ""} ${editing ? "cursor-grab" : ""}`}
    >
      {(card.frame === "framed" || editing) && (
        <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5">
          {editing && (
            <GripVertical className="size-3 shrink-0 text-muted-foreground/50" />
          )}
          <Icon className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {card.label}
          </span>
          {editing && (
            <button
              onClick={onHide}
              title="Remove"
              className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        {card.render(ctx)}
      </div>

      {/* Drag the bottom edge to set this section's height. draggable={false}
          and the stopper keep this from starting a reorder drag instead. */}
      <div
        draggable={false}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={onStartResize}
        title="Drag to resize"
        className="absolute inset-x-0 bottom-0 z-10 h-1.5 cursor-ns-resize transition-colors hover:bg-accent-brand/40"
      />
    </div>
  );
}

/** Everything registered but not currently placed. */
function AddTray({
  cards,
  onAdd,
}: {
  cards: DashboardCardDef[];
  onAdd: (card: DashboardCardDef) => void;
}) {
  const builtin = cards.filter((c) => !c.pluginId);
  const fromPlugins = cards.filter((c) => c.pluginId);

  return (
    <div className="shrink-0 border-t border-border bg-surface/40 p-2.5">
      <GroupHeading title="Add a section" count={cards.length} />
      {cards.length === 0 ? (
        <p className="pt-2 text-xs text-muted-foreground">
          Everything is already on the dashboard.
        </p>
      ) : (
        <div className="flex flex-col gap-2 pt-2">
          {builtin.length > 0 && <TrayRow cards={builtin} onAdd={onAdd} />}
          {fromPlugins.length > 0 && (
            <>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
                From plugins
              </span>
              <TrayRow cards={fromPlugins} onAdd={onAdd} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function TrayRow({
  cards,
  onAdd,
}: {
  cards: DashboardCardDef[];
  onAdd: (card: DashboardCardDef) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <button
            key={card.id}
            onClick={() => onAdd(card)}
            className="flex h-7 items-center gap-1.5 border border-border px-2 text-[11px] text-muted-foreground transition-colors hover:border-accent-brand hover:text-accent-brand focus-visible:ring-1 focus-visible:ring-ring"
          >
            <Plus className="size-3" />
            <Icon className="size-3" />
            {card.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * The homepage half of this tab. Deliberately blank: a start page has nothing
 * on it until you put something there, and the canvas is not part of the demo.
 */
function HomepageView() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-2 text-center">
        <LayoutGrid className="size-5 text-muted-foreground/40" />
        <span className="text-xs font-medium">Homepage</span>
        <span className="text-[11px] leading-snug text-muted-foreground">
          A start page you arrange yourself. Drop clocks, host grids, service
          links, notes and charts onto a canvas, then drag and resize them.
          Plugins can add their own widgets.
        </span>
      </div>
    </div>
  );
}

// ─── Built-in sections ────────────────────────────────────────────────────────

function Stat({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2">
      <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  );
}

function StatsStrip({ hosts }: { hosts: Host[] }) {
  const { t } = useTranslation();
  const online = hosts.filter((h) => h.status === "online").length;
  return (
    <div className="grid h-full grid-cols-2 divide-x divide-border md:grid-cols-4">
      <Stat label={t("dashboard.version")}>
        <div className="flex items-baseline gap-1.5">
          <span className="text-lg font-bold leading-none text-accent-brand">
            2.7.1
          </span>
          <VersionBadge status="up_to_date" className="w-fit" />
        </div>
      </Stat>
      <Stat label={t("dashboard.uptime")}>
        <span className="text-lg font-bold leading-none">9d 3h</span>
      </Stat>
      <Stat label={t("dashboard.database")}>
        <span className="text-lg font-bold leading-none text-accent-brand">
          {t("dashboard.healthy")}
        </span>
      </Stat>
      <Stat label="Hosts available">
        <div className="flex items-baseline gap-1">
          <span className="text-lg font-bold leading-none">{online}</span>
          <span className="text-xs leading-none text-muted-foreground">
            /{hosts.length}
          </span>
        </div>
      </Stat>
    </div>
  );
}

function CountersStrip({ ctx }: { ctx: DashboardCardContext }) {
  const { t } = useTranslation();
  const items = [
    {
      icon: Server,
      value: ctx.hosts.length,
      label: t("dashboard.totalHosts"),
      go: () => ctx.openSingleton("host-manager"),
    },
    {
      icon: KeyRound,
      value: ctx.credentialCount,
      label: t("dashboard.totalCredentials"),
      go: () => ctx.openSingleton("host-manager"),
    },
    {
      icon: Network,
      value: ctx.activeTunnelCount,
      label: t("dashboardTab.activeTunnels"),
      go: () => ctx.openSingleton("tunnel"),
    },
  ];
  return (
    <div className="grid h-full grid-cols-3 divide-x divide-border">
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.go}
          className="flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
        >
          <item.icon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-base font-bold">{item.value}</span>
          <span className="truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {item.label}
          </span>
        </button>
      ))}
    </div>
  );
}

function QuickActions({ ctx }: { ctx: DashboardCardContext }) {
  const { t } = useTranslation();
  const actions = [
    {
      icon: Plus,
      label: t("dashboard.addHost"),
      hint: t("dashboardTab.registerNewServer"),
      go: () => window.dispatchEvent(new CustomEvent("host-manager:add-host")),
    },
    {
      icon: KeyRound,
      label: t("dashboard.addCredential"),
      hint: t("dashboardTab.storeSshKeysOrPasswords"),
      go: () =>
        window.dispatchEvent(new CustomEvent("host-manager:add-credential")),
    },
    {
      icon: Settings,
      label: t("dashboard.adminSettings"),
      hint: t("dashboardTab.manageUsersAndRoles"),
      go: () => ctx.openSingleton("admin-settings"),
    },
    {
      icon: User,
      label: t("dashboard.userProfile"),
      hint: t("dashboardTab.manageYourAccount"),
      go: () => ctx.openSingleton("user-profile"),
    },
  ];
  return (
    <div className="grid h-full grid-cols-2 divide-x divide-y divide-border">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.go}
          className="group/btn flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50"
        >
          <span className="flex size-6 shrink-0 items-center justify-center border border-border bg-muted transition-colors group-hover/btn:border-accent-brand/40 group-hover/btn:bg-accent-brand/20">
            <action.icon className="size-3 text-accent-brand" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-xs font-medium">{action.label}</span>
            <span className="truncate text-[10px] text-muted-foreground">
              {action.hint}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function MetricBar({ label, value }: { label: string; value: number }) {
  const color =
    value >= 90 ? "bg-red-500" : value >= 70 ? "bg-warning" : "bg-accent-brand";
  return (
    <div className="flex w-14 flex-col gap-0.5">
      <span className="flex items-baseline justify-between gap-1 text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-bold tabular-nums">{value.toFixed(0)}%</span>
      </span>
      <div className="h-0.5 w-full bg-muted">
        <div className={`h-full ${color}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function HostStatus({ ctx }: { ctx: DashboardCardContext }) {
  const { t } = useTranslation();
  const scheme = useStatusColorScheme();
  return (
    <div className="flex flex-col">
      {ctx.hosts.map((host) => {
        const availability =
          host.status && host.status !== "unknown"
            ? host.status
            : host.online
              ? "online"
              : "offline";
        const disk =
          host.cpu == null ? null : Math.min(96, (host.ram ?? 40) + 8);
        return (
          <div
            key={host.id}
            onClick={() => ctx.openTab(host, "host-metrics")}
            className="group/row flex min-w-0 cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0 hover:bg-muted/50"
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${getStatusClasses(availability, scheme, "dot")}`}
            />
            <span className="min-w-0 flex-1">
              <Facts className="min-w-0">
                <span className="truncate text-xs font-medium">
                  {host.name}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {host.ip}
                </span>
              </Facts>
            </span>
            {availability === "online" && host.cpu !== null && (
              <span className="hidden shrink-0 items-center gap-2 sm:flex">
                <MetricBar label={t("dashboard.cpu")} value={host.cpu} />
                {host.ram !== null && (
                  <MetricBar label={t("dashboard.ram")} value={host.ram} />
                )}
                {disk !== null && <MetricBar label="Disk" value={disk} />}
              </span>
            )}
            <ExternalLink className="size-2.5 shrink-0 text-muted-foreground/0 transition-colors group-hover/row:text-muted-foreground/60" />
          </div>
        );
      })}
    </div>
  );
}

const TYPE_TO_TAB: Record<DemoActivityItem["type"], TabType> = {
  terminal: "terminal",
  file_manager: "files",
  server_stats: "host-metrics",
  tunnel: "tunnel",
  docker: "docker",
  rdp: "rdp",
  vnc: "vnc",
  telnet: "telnet",
};

const TYPE_ICON: Record<DemoActivityItem["type"], React.ReactNode> = {
  terminal: <Terminal className="size-2.5 shrink-0" />,
  file_manager: <Server className="size-2.5 shrink-0" />,
  server_stats: <Activity className="size-2.5 shrink-0" />,
  tunnel: <Network className="size-2.5 shrink-0" />,
  docker: <Server className="size-2.5 shrink-0" />,
  rdp: <Server className="size-2.5 shrink-0" />,
  vnc: <Server className="size-2.5 shrink-0" />,
  telnet: <Terminal className="size-2.5 shrink-0" />,
};

function typeLabel(type: DemoActivityItem["type"]): string {
  switch (type) {
    case "file_manager":
      return "File manager";
    case "server_stats":
      return "Metrics";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

function RecentActivity({ ctx }: { ctx: DashboardCardContext }) {
  const { t } = useTranslation();
  const scheme = useStatusColorScheme();

  function ago(ts: string) {
    const ms = Date.now() - new Date(ts).getTime();
    if (ms < 60_000) return t("dashboard.justNow");
    const s = Math.floor(ms / 1000);
    if (s < 3600) return `${Math.floor(s / 60)}m`;
    if (s < 86_400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86_400)}d`;
  }

  if (DEMO_ACTIVITY.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center py-6 text-xs text-muted-foreground/50">
        {t("dashboard.noRecentActivity")}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {DEMO_ACTIVITY.map((item) => {
        const host = ctx.hosts.find((h) => h.id === item.hostId);
        return (
          <div
            key={item.id}
            onClick={() => host && ctx.openTab(host, TYPE_TO_TAB[item.type])}
            className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0 hover:bg-muted/50"
          >
            <span
              className={`size-1.5 shrink-0 rounded-full ${getStatusClasses(host?.online ?? false, scheme, "dot")}`}
            />
            <span className="truncate text-xs font-medium">
              {item.hostName}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground">
              {TYPE_ICON[item.type]}
              <span className="truncate">{typeLabel(item.type)}</span>
            </span>
            <span className="ml-auto shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {ago(item.timestamp)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Registered at module load, the same way the real app's widgets are.
registerDashboardCard({
  id: "stats_bar",
  label: "Server overview",
  icon: Activity,
  frame: "bare",
  defaultPanel: "main",
  defaultHeight: 60,
  render: (ctx) => <StatsStrip hosts={ctx.hosts} />,
});

registerDashboardCard({
  id: "counters_bar",
  label: "Server stats",
  icon: Database,
  frame: "bare",
  defaultPanel: "main",
  defaultHeight: 44,
  render: (ctx) => <CountersStrip ctx={ctx} />,
});

registerDashboardCard({
  id: "host_status",
  label: "Host status",
  icon: Database,
  frame: "framed",
  defaultPanel: "main",
  defaultHeight: null,
  render: (ctx) => <HostStatus ctx={ctx} />,
});

registerDashboardCard({
  id: "quick_actions",
  label: "Quick actions",
  icon: Zap,
  frame: "framed",
  defaultPanel: "side",
  defaultHeight: 140,
  render: (ctx) => <QuickActions ctx={ctx} />,
});

registerDashboardCard({
  id: "recent_activity",
  label: "Recent activity",
  icon: Activity,
  frame: "framed",
  defaultPanel: "side",
  defaultHeight: null,
  render: (ctx) => <RecentActivity ctx={ctx} />,
});

registerDashboardCard({
  id: "service_links",
  label: "Service links",
  icon: ExternalLink,
  frame: "framed",
  defaultPanel: "side",
  defaultHeight: 160,
  optional: true,
  render: () => (
    <div className="flex flex-col">
      {[
        { name: "Grafana", url: "grafana.internal" },
        { name: "Portainer", url: "portainer.internal" },
        { name: "Proxmox", url: "proxmox.internal:8006" },
      ].map((link) => (
        <span
          key={link.name}
          className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0"
        >
          <Eye className="size-3 shrink-0 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{link.name}</span>
          <span className="ml-auto truncate font-mono text-[10px] text-muted-foreground">
            {link.url}
          </span>
        </span>
      ))}
    </div>
  ),
});
