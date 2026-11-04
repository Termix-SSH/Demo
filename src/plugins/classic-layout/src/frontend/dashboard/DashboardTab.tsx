import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  APP_VERSION,
  useActionSlot,
  useIsMobile,
  usePluginStore,
  Button,
  Skeleton,
  Kbd,
  Facts,
  GroupHeading,
  PanelShell,
  Segmented,
  useConfirm,
  DASHBOARD_CARDS,
  type DashboardCardId,
  type TabType,
  type Host,
  getSSHHosts,
  getUptime,
  getVersionInfo,
  releaseUrlFrom,
  getDatabaseHealth,
  getRecentActivity,
  getCredentials,
  resetRecentActivity,
  getUserInfo,
  isElectron,
  type RecentActivityItem,
  getRegisteredDashboardCard,
  useRegisteredDashboardCards,
  PluginViewPlaceholder,
  shell,
  useServerStatus,
  useServerStatusMeta,
  sshHostToHost,
  Select2,
  reportCoreIssueUrl,
  docsUrl,
  useUiPreferencesContext,
  TileFrame,
  TileGrid,
  TilePicker,
  appendTile,
  type TilePickerEntry,
  type TileSlot,
} from "@termix-ssh/plugin-sdk/ui";
import {
  usePluginUiPreferences,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AUTO_FIRST_CARDS,
  autoSlots,
  decodeGrid,
  defaultGrid,
  decodeSlots,
  encodeGrid,
  gridFromColumns,
  sameGrid,
  type GridCard,
} from "./dashboard-layout";
import {
  Activity,
  Check,
  Database,
  LayoutGrid,
  Pencil,
  RotateCcw,
  Server,
  Zap,
} from "lucide-react";
import { withLiveHostStatus } from "../sidebar/live-host-status";
import { sortHostTree, type SortKey } from "../sidebar/host-sort";
import {
  CountersStrip,
  HostStatusList,
  QuickActions,
  RecentActivityList,
  StatsStrip,
  type VersionStatus,
} from "./dashboard-core-cards";

export { HostStatusList as HostStatusCard } from "./dashboard-core-cards";

const HOST_STATUS_SORT_LABELS: Partial<Record<SortKey, string>> = {
  default: "hosts.sortDefault",
  "name-asc": "hosts.sortNameAsc",
  "name-desc": "hosts.sortNameDesc",
  "ip-asc": "hosts.sortIpAsc",
  "ip-desc": "hosts.sortIpDesc",
  "status-online": "hosts.sortOnlineFirst",
  "status-offline": "hosts.sortOfflineFirst",
};
const HOST_STATUS_SORTS = Object.keys(HOST_STATUS_SORT_LABELS) as SortKey[];

// ─── Types ────────────────────────────────────────────────────────────────────

type PanelId = "main" | "side";

type CardSlot = {
  key: string;
  id: DashboardCardId;
  panel: PanelId;
  order: number;
  height: number | null;
};

// ─── Default layout ───────────────────────────────────────────────────────────

const DEFAULT_SLOTS: CardSlot[] = [
  { key: "stats_bar_0", id: "stats_bar", panel: "main", order: 0, height: 76 },
  {
    key: "counters_bar_0",
    id: "counters_bar",
    panel: "main",
    order: 1,
    height: 52,
  },
  {
    key: "host_status_0",
    id: "host_status",
    panel: "main",
    order: 2,
    height: null,
  },
  {
    key: "quick_actions_0",
    id: "quick_actions",
    panel: "side",
    order: 0,
    height: 180,
  },
  {
    key: "recent_activity_0",
    id: "recent_activity",
    panel: "side",
    order: 1,
    height: null,
  },
];

/** Cards core draws itself, how they are framed and what marks them. */
const CORE_CARD_META: Record<
  string,
  { icon: React.ElementType; frame: "framed" | "bare" }
> = {
  stats_bar: { icon: Activity, frame: "bare" },
  counters_bar: { icon: Database, frame: "bare" },
  quick_actions: { icon: Zap, frame: "framed" },
  host_status: { icon: Server, frame: "framed" },
  recent_activity: { icon: Activity, frame: "framed" },
};

/**
 * A plugin's card, or a placeholder that keeps the slot while its plugin is
 * off, so the card comes back in the same place when the plugin does.
 */
export function PluginCardSlot({
  id,
  isVisible,
  onOpenSingletonTab,
  config,
  setConfig,
  editMode,
}: {
  id: string;
  isVisible: boolean;
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  config?: Record<string, unknown>;
  setConfig?: (config: Record<string, unknown>) => void;
  editMode?: boolean;
}) {
  useRegisteredDashboardCards();
  const cardShell = useMemo(
    () => ({
      ...shell,
      openSingletonTab: (type: string) => onOpenSingletonTab(type as TabType),
    }),
    [onOpenSingletonTab],
  );
  const card = getRegisteredDashboardCard(id);
  if (!card) {
    return (
      <div className="flex h-full w-full overflow-hidden">
        <PluginViewPlaceholder kind="card" viewId={id} compact />
      </div>
    );
  }
  const Component = card.component;
  return (
    <Component
      isVisible={isVisible}
      shell={cardShell}
      config={config ?? {}}
      setConfig={setConfig}
      editMode={editMode}
    />
  );
}

function isStatusCheckEnabled(host: Host): boolean {
  return host.statusCheckEnabled !== false;
}

interface CardMeta {
  label: string;
  icon: React.ElementType;
  frame: "framed" | "bare";
  action?: React.ReactNode;
}

const GRID_KEY = "dashboardTab.grid";
const OLD_KEY = "dashboardTab.slots";

function readOldSlots(): CardSlot[] | null {
  try {
    const saved = localStorage.getItem(OLD_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as CardSlot[];
    return parsed.map((s, i) => ({ key: s.key ?? `${s.id}_${i}`, ...s }));
  } catch {
    return null;
  }
}

function readCachedGrid(): GridCard[] | null {
  try {
    const saved = localStorage.getItem(GRID_KEY);
    return saved ? (JSON.parse(saved) as GridCard[]) : null;
  } catch {
    return null;
  }
}

/** Picker entry ids for cards placed from an entry: card id, then the entry key. */
const ENTRY_SEP = "::";

// ─── DashboardTab ─────────────────────────────────────────────────────────────

export function DashboardTab({
  onOpenSingletonTab,
  onOpenTab,
  isVisible = true,
}: {
  onOpenSingletonTab: (type: TabType, pendingEvent?: string) => void;
  onOpenTab: (host: Host, type: TabType) => void;
  /** When false, pause dashboard metrics refresh while the tab stays mounted. */
  isVisible?: boolean;
}) {
  const registeredCards = useRegisteredDashboardCards();
  const layoutPrefs = usePluginUiPreferences<{
    dashboardSlots?: string[];
    dashboardGrid?: string[];
  }>();
  // Until the saved preferences arrive, a new browser must not save over them.
  const prefsLoaded = useUiPreferencesContext()?.loaded ?? true;
  const registeredIds = registeredCards.map((card) => card.id).join(",");
  // How tall the view is, so an unarranged dashboard fills it.
  const viewRef = useRef<HTMLDivElement | null>(null);
  const [room, setRoom] = useState(0);
  useLayoutEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    const update = () => setRoom(element.clientHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  });
  const auto = useMemo(
    () => defaultGrid(registeredIds.split(","), room),
    [registeredIds, room],
  );
  // Layouts that only ever were a default, the old two column ones too, so
  // nobody who never arranged their dashboard keeps an old default.
  const defaults = useMemo(
    () => [
      defaultGrid([]),
      defaultGrid(registeredIds.split(",")),
      gridFromColumns(DEFAULT_SLOTS),
      gridFromColumns(autoSlots(DEFAULT_SLOTS, registeredIds.split(","))),
      gridFromColumns(autoSlots(DEFAULT_SLOTS, AUTO_FIRST_CARDS)),
    ],
    [registeredIds],
  );
  const isDefault = (grid: GridCard[]) =>
    defaults.some((entry) => sameGrid(grid, entry));
  const { t, language } = useTranslation();
  const confirm = useConfirm();
  const { initialLoadComplete } = useServerStatusMeta();
  const statusLoading = !initialLoadComplete;

  const [cards, setCards] = useState<GridCard[]>(() => {
    const cached = readCachedGrid();
    if (cached) return cached;
    const old = readOldSlots();
    return old ? gridFromColumns(old) : defaultGrid([]);
  });
  // Until someone moves, resizes or adds a card the dashboard is the default,
  // worked out for the current view each time, and nothing is saved.
  const [arranged, setArranged] = useState(
    () => !!readCachedGrid() || !!readOldSlots(),
  );
  const shown = arranged ? cards : auto;
  const change = (next: (current: GridCard[]) => GridCard[]) => {
    setCards(next(shown));
    setArranged(true);
  };

  // Picking an interface preset writes an old style layout, so convert it
  // without waiting for a remount.
  useEffect(() => {
    const handler = () => {
      const old = readOldSlots();
      if (!old) return;
      setCards(gridFromColumns(old));
      setArranged(true);
    };
    window.addEventListener("dashboardSlotsChanged", handler);
    return () => window.removeEventListener("dashboardSlotsChanged", handler);
  }, []);

  // A plugin's own view next to the dashboard, e.g. the homepage canvas.
  const secondaryViews = useActionSlot("dashboard.secondaryView");
  const secondaryView = secondaryViews[0];
  const { settled: pluginsSettled } = usePluginStore();

  const [dashboardView, setDashboardView] = useState<string>(() => {
    try {
      return localStorage.getItem("dashboardView") ?? "dashboard";
    } catch {
      return "dashboard";
    }
  });
  // Until plugins settle, a plugin view saved last session has not had a
  // chance to register, so its absence does not mean it is gone.
  const viewPending = !pluginsSettled && dashboardView !== "dashboard";
  const isDashboardView =
    dashboardView === "dashboard" ||
    (!viewPending && !secondaryView) ||
    (!!secondaryView && dashboardView !== secondaryView.actionId);

  useEffect(() => {
    try {
      localStorage.setItem("dashboardView", dashboardView);
    } catch {
      /* ignore */
    }
  }, [dashboardView]);

  const [editMode, setEditMode] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);

  // The saved layout follows the user. An old two column layout, saved in
  // preferences or only in this browser, moves over once, and a dashboard
  // nobody arranged stays automatic, so new plugin cards appear on it.
  const savedGrid = layoutPrefs.values.dashboardGrid;
  const savedLines = layoutPrefs.values.dashboardSlots;
  const savedKey = JSON.stringify([savedGrid ?? null, savedLines ?? null]);
  useEffect(() => {
    if (!prefsLoaded) return;
    const grid = decodeGrid(savedGrid);
    if (grid) {
      setCards((current) => (sameGrid(current, grid) ? current : grid));
      setArranged(!isDefault(grid));
      return;
    }
    const old = decodeSlots(savedLines);
    if (old) {
      const moved = gridFromColumns(old);
      setCards(moved);
      setArranged(!isDefault(moved));
      return;
    }
    // A layout kept only in this browser by an older version that was just
    // a default is not one anybody arranged.
    setArranged((current) => current && !isDefault(cards));
    // savedKey stands in for the saved lines, whose identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, auto, prefsLoaded]);

  useEffect(() => {
    if (!prefsLoaded) return;
    const isAuto = !arranged;
    const lines = isAuto ? null : encodeGrid(cards);
    if (JSON.stringify(lines) !== JSON.stringify(savedGrid ?? null)) {
      layoutPrefs.set("dashboardGrid", lines);
    }
    // The old lines are only read once to move them over.
    if (lines && savedLines) layoutPrefs.set("dashboardSlots", null);
    try {
      if (isAuto) localStorage.removeItem(GRID_KEY);
      else localStorage.setItem(GRID_KEY, JSON.stringify(cards));
      localStorage.removeItem(OLD_KEY);
    } catch {
      /* ignore */
    }
    // layoutPrefs is a new object each render; savedKey covers what it holds.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards, arranged, savedKey, prefsLoaded]);

  const [configHosts, setHosts] = useState<Host[]>([]);
  const { statuses, getStatus } = useServerStatus();
  const hosts = useMemo(
    () => withLiveHostStatus(configHosts, getStatus),
    // statuses changes identity whenever a host's status changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [configHosts, statuses, getStatus],
  );
  const [isAdmin, setIsAdmin] = useState(false);
  const [uptimeFormatted, setUptimeFormatted] = useState("");
  const [versionText, setVersionText] = useState("");
  const [versionStatus, setVersionStatus] =
    useState<VersionStatus>("up_to_date");
  const [releaseUrl, setReleaseUrl] = useState("");
  const [dbHealth, setDbHealth] = useState<"healthy" | "error">("healthy");
  const [credentialCount, setCredentialCount] = useState(0);
  const [activity, setActivity] = useState<RecentActivityItem[]>([]);
  const [hostStatusSort, setHostStatusSort] = useState<SortKey>(() => {
    try {
      const saved = localStorage.getItem("dashboardTab.hostStatusSort");
      return HOST_STATUS_SORTS.includes(saved as SortKey)
        ? (saved as SortKey)
        : "default";
    } catch {
      return "default";
    }
  });
  const statusCheckHosts = sortHostTree(
    { name: "", children: hosts.filter(isStatusCheckEnabled) },
    hostStatusSort,
  ).children as Host[];

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const raw = await getSSHHosts().catch(() => []);
      if (mounted) setHosts(raw.map(sshHostToHost));
    };
    load();

    getUserInfo()
      .then((info) => {
        // A desktop on its own has one implicit user and nothing to
        // administer; linked, it is an admin when the server account is.
        setIsAdmin(isElectron() ? !!info.linked?.isAdmin : !!info.is_admin);
      })
      .catch(() => {});
    getUptime()
      .then((u) => setUptimeFormatted(u.formatted))
      .catch(() => {});
    getVersionInfo()
      .then((info) => {
        setVersionText(info.localVersion ?? "");
        setVersionStatus(info.status ?? "unknown");
        setReleaseUrl(releaseUrlFrom(info));
      })
      .catch(() => {});
    getDatabaseHealth()
      .then((health) => {
        setDbHealth(
          health.status === "ok" || health.status === "healthy"
            ? "healthy"
            : "error",
        );
      })
      .catch(() => {
        setDbHealth("error");
      });
    getRecentActivity(50)
      .then(setActivity)
      .catch(() => {});
    getCredentials()
      .then((res) =>
        setCredentialCount(
          Array.isArray(res)
            ? res.length
            : Array.isArray(res?.credentials)
              ? res.credentials.length
              : 0,
        ),
      )
      .catch(() => {});

    if (!isVisible) {
      return () => {
        mounted = false;
      };
    }

    const hostsInterval = setInterval(async () => {
      if (document.visibilityState === "hidden") return;
      const raw = await getSSHHosts().catch(() => []);
      if (mounted) setHosts(raw.map(sshHostToHost));
    }, 30000);

    return () => {
      mounted = false;
      clearInterval(hostsInterval);
    };
  }, [isVisible]);

  const handleClearActivity = async () => {
    const ok = await confirm({
      title: t("dashboardTab.clearActivityConfirm"),
      confirmLabel: t("dashboardTab.clear"),
    });
    if (!ok) return;
    try {
      await resetRecentActivity();
      setActivity([]);
    } catch {
      /* ignore */
    }
  };

  const todayLabel = new Date().toLocaleDateString(language, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const isMobile = useIsMobile();

  const labels: Record<string, string> = {
    stats_bar: t("dashboard.serverOverview"),
    counters_bar: t("dashboard.serverStats"),
    quick_actions: t("dashboard.quickActions"),
    host_status: t("dashboardTab.hostStatus"),
    recent_activity: t("dashboard.recentActivity"),
    ...Object.fromEntries(
      registeredCards.map((card) => [card.id, t(card.titleKey)]),
    ),
  };

  const metaFor = (id: string): CardMeta => {
    const core = CORE_CARD_META[id];
    if (core)
      return {
        label: labels[id] ?? id,
        icon: core.icon,
        frame: core.frame,
        action:
          id === "host_status" && statusCheckHosts.length > 1 ? (
            <Select2
              value={hostStatusSort}
              aria-label={t("hosts.sortHosts")}
              onChange={(e) => {
                const key = e.target.value as SortKey;
                setHostStatusSort(key);
                try {
                  localStorage.setItem("dashboardTab.hostStatusSort", key);
                } catch {
                  /* ignore */
                }
              }}
              className="h-6 border border-border bg-background px-1.5 text-[10px] outline-none focus:ring-1 focus:ring-ring"
            >
              {HOST_STATUS_SORTS.map((key) => (
                <option key={key} value={key}>
                  {t(HOST_STATUS_SORT_LABELS[key]!)}
                </option>
              ))}
            </Select2>
          ) : id === "recent_activity" && activity.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleClearActivity()}
              className="text-[10px] font-medium text-accent-brand hover:underline"
            >
              {t("dashboardTab.clear")}
            </button>
          ) : undefined,
      };
    const registered = getRegisteredDashboardCard(id);
    return {
      label: labels[id] ?? id,
      icon: LayoutGrid,
      frame: registered?.frame ?? "bare",
    };
  };

  const renderCard = (card: GridCard) => {
    switch (card.id) {
      case "stats_bar":
        return (
          <StatsStrip
            hosts={hosts}
            uptimeFormatted={uptimeFormatted}
            versionText={versionText}
            versionStatus={versionStatus}
            releaseUrl={releaseUrl}
            dbHealth={dbHealth}
          />
        );
      case "counters_bar":
        return (
          <CountersStrip
            hosts={hosts}
            credentialCount={credentialCount}
            onOpenSingletonTab={onOpenSingletonTab}
          />
        );
      case "quick_actions":
        return (
          <QuickActions
            onOpenSingletonTab={onOpenSingletonTab}
            hosts={hosts}
            onOpenTab={onOpenTab}
            isAdmin={isAdmin}
          />
        );
      case "host_status":
        return (
          <HostStatusList
            hosts={statusCheckHosts}
            onOpenTab={onOpenTab}
            statusLoading={statusLoading}
          />
        );
      case "recent_activity":
        return (
          <RecentActivityList
            activity={activity}
            hosts={hosts}
            onOpenTab={onOpenTab}
            statusLoading={statusLoading}
          />
        );
      default:
        return (
          <PluginCardSlot
            id={card.id}
            isVisible={isVisible}
            onOpenSingletonTab={onOpenSingletonTab}
            config={card.config}
            setConfig={(config) =>
              change((prev) =>
                prev.map((entry) =>
                  entry.key === card.key ? { ...entry, config } : entry,
                ),
              )
            }
            editMode={editMode}
          />
        );
    }
  };

  // Entries of cards that can be placed many times, read while editing.
  const [entries, setEntries] = useState<
    Record<
      string,
      Awaited<
        ReturnType<NonNullable<(typeof registeredCards)[number]["entries"]>>
      >
    >
  >({});
  useEffect(() => {
    if (!editMode) return;
    let stop = false;
    void Promise.all(
      registeredCards
        .filter((card) => card.entries)
        .map(
          async (card) =>
            [card.id, await card.entries!(language).catch(() => [])] as const,
        ),
    ).then((list) => {
      if (!stop) setEntries(Object.fromEntries(list));
    });
    return () => {
      stop = true;
    };
  }, [editMode, registeredIds, language]);

  const byKey = useMemo(
    () => new Map(shown.map((card) => [card.key, card])),
    [shown],
  );
  const slots: TileSlot[] = shown.map((card) => ({
    id: card.key,
    x: card.x,
    y: card.y,
    w: card.w,
    h: card.h,
  }));
  const onGridChange = (next: TileSlot[]) =>
    change((prev) => {
      const old = new Map(prev.map((card) => [card.key, card]));
      return next
        .map((slot) => {
          const card = old.get(slot.id);
          return card
            ? { ...card, x: slot.x, y: slot.y, w: slot.w, h: slot.h ?? null }
            : null;
        })
        .filter((card): card is GridCard => !!card);
    });

  const pickerEntries = useMemo((): TilePickerEntry[] => {
    const placedIds = new Set(shown.map((card) => card.id));
    const fromPlugins = t("dashboardTab.fromPlugins");
    const builtin = t("dashboard.title");
    const out: TilePickerEntry[] = DASHBOARD_CARDS.map((card) => ({
      id: card.id as string,
      title: labels[card.id] ?? card.id,
      group: builtin,
      kind: "card",
      placed: placedIds.has(card.id),
    }));
    for (const card of registeredCards) {
      if (card.entries) {
        for (const entry of entries[card.id] ?? []) {
          const config = JSON.stringify(entry.config);
          out.push({
            id: `${card.id}${ENTRY_SEP}${entry.key}`,
            title: entry.title,
            description: entry.description,
            group: entry.group ?? t(card.titleKey),
            kind: entry.kind ?? "card",
            placed: shown.some(
              (placed) =>
                placed.id === card.id &&
                JSON.stringify(placed.config ?? {}) === config,
            ),
          });
        }
        continue;
      }
      out.push({
        id: card.id,
        title: t(card.titleKey),
        group: fromPlugins,
        kind: "card",
        placed: placedIds.has(card.id),
      });
    }
    return out;
    // labels is rebuilt each render from the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, entries, registeredCards, t]);

  const handleAdd = (picked: TilePickerEntry) => {
    const [cardId, entryKey] = picked.id.split(ENTRY_SEP);
    const registered = getRegisteredDashboardCard(cardId);
    const entry = entryKey
      ? entries[cardId]?.find((item) => item.key === entryKey)
      : undefined;
    const size = entry?.defaultSize ?? registered?.defaultSize;
    const w = size?.w ?? (registered?.defaultPanel === "side" ? 4 : 8);
    const h =
      size?.h ??
      registered?.defaultHeight ??
      (cardId === "host_status" || cardId === "recent_activity" ? 360 : 200);
    const key = `${cardId}_${Date.now()}`;
    const next = appendTile(slots, { id: key, w, h });
    const placed = next[next.length - 1];
    change((prev) => [
      ...prev,
      {
        key,
        id: cardId,
        x: placed.x,
        y: placed.y,
        w: placed.w,
        h: placed.h ?? null,
        ...(entry ? { title: entry.title, config: entry.config } : {}),
      },
    ]);
  };

  const handleReset = async () => {
    const ok = await confirm({
      title: t("dashboardTab.resetConfirm"),
      confirmLabel: t("dashboard.reset"),
    });
    if (!ok) return;
    setArranged(false);
    layoutPrefs.set("dashboardGrid", null);
    layoutPrefs.set("dashboardSlots", null);
    setEditMode(false);
    try {
      localStorage.removeItem(GRID_KEY);
      localStorage.removeItem(OLD_KEY);
      localStorage.removeItem("dashboardTab.mainWidthPct");
    } catch {
      /* ignore */
    }
  };

  const tileLabel = (key: string) => {
    const card = byKey.get(key);
    if (!card) return key;
    return card.title ?? labels[card.id] ?? card.id;
  };
  const renderTile = (key: string) => {
    const card = byKey.get(key);
    if (!card) return null;
    const meta = metaFor(card.id);
    const Icon = meta.icon;
    return (
      <TileFrame
        // Cards on the right, where the side column was, keep its tint.
        className={
          card.x > 0 && card.x + card.w === 12 ? "bg-surface-dim/40" : undefined
        }
        title={card.title ?? meta.label}
        icon={<Icon />}
        bare={meta.frame === "bare" && !editMode}
        actions={editMode ? undefined : meta.action}
      >
        {renderCard(card)}
      </TileFrame>
    );
  };

  const online = hosts.filter((h) => h.status === "online").length;
  const links = [
    {
      href: "https://github.com/Termix-SSH/Termix",
      label: t("dashboard.github"),
    },
    {
      href: reportCoreIssueUrl(APP_VERSION),
      label: t("dashboard.reportBug"),
    },
    {
      href: "https://discord.com/invite/jVQGdvHDrf",
      label: t("dashboard.discord"),
    },
    { href: docsUrl(), label: t("dashboard.docs") },
    { href: "https://donate.termix.site/", label: t("dashboard.donate") },
  ];

  const title =
    secondaryView && !viewPending ? (
      <Segmented
        value={isDashboardView ? "dashboard" : secondaryView.actionId}
        onChange={setDashboardView}
        options={[
          { value: "dashboard", label: t("dashboard.title") },
          { value: secondaryView.actionId, label: t(secondaryView.titleKey) },
        ]}
      />
    ) : (
      t("dashboard.title")
    );

  return (
    <PanelShell
      icon={<LayoutGrid className="size-4" />}
      title={title}
      status={isDashboardView ? todayLabel : undefined}
      scroll={false}
      docs={docsUrl("dashboard")}
      actions={
        <>
          {isDashboardView && !viewPending && (
            <>
              {editMode ? (
                <>
                  <span className="hidden text-[11px] text-muted-foreground lg:inline">
                    {t("dashboardTab.dragToReorder")}
                  </span>
                  {!pickerOpen && (
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setPickerOpen(true)}
                    >
                      {t("dashboardTab.addSection")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    className="gap-1"
                    onClick={() => void handleReset()}
                  >
                    <RotateCcw className="size-3" />
                    {t("dashboard.reset")}
                  </Button>
                </>
              ) : (
                <Facts className="hidden px-1.5 text-[11px] text-muted-foreground md:flex">
                  <span>
                    {t("dashboardTab.onlineCount", { count: online })}
                  </span>
                  <span>
                    {t("dashboardTab.hostCount", { count: hosts.length })}
                  </span>
                  <span className="flex items-center gap-1">
                    {t("dashboardTab.commandPalette")}
                    <Kbd className="h-4">⇧⇧</Kbd>
                  </span>
                </Facts>
              )}
              <span
                aria-hidden
                className="hidden h-4 w-px bg-border xl:block"
              />
            </>
          )}
          <span className="hidden items-center gap-0.5 xl:flex">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </span>
          {isDashboardView && (
            <Button
              variant="ghost"
              size="icon-sm"
              title={
                editMode
                  ? t("dashboardTab.done")
                  : t("dashboard.customizeLayout")
              }
              aria-label={
                editMode
                  ? t("dashboardTab.done")
                  : t("dashboard.customizeLayout")
              }
              className={editMode ? "text-accent-brand" : ""}
              onClick={() => setEditMode((v) => !v)}
            >
              {editMode ? (
                <Check className="size-4" />
              ) : (
                <Pencil className="size-4" />
              )}
            </Button>
          )}
        </>
      }
    >
      {viewPending ? (
        <div className="flex flex-1 flex-col gap-2 p-2.5">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="w-full flex-1" />
        </div>
      ) : !isDashboardView && secondaryView?.component ? (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <secondaryView.component onOpenSingletonTab={onOpenSingletonTab} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          <div
            ref={viewRef}
            className="min-h-0 min-w-0 flex-1 overflow-y-auto thin-scrollbar"
          >
            <TileGrid
              slots={slots}
              editMode={editMode}
              renderTile={renderTile}
              tileLabel={tileLabel}
              onChange={onGridChange}
              empty={t("dashboardTab.dropHere")}
            />
          </div>
          {editMode && pickerOpen && !isMobile && (
            <TilePicker
              entries={pickerEntries}
              onAdd={handleAdd}
              onClose={() => setPickerOpen(false)}
            />
          )}
        </div>
      )}
    </PanelShell>
  );
}
