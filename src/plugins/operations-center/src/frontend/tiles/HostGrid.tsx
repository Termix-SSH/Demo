import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  useSettings,
  useSlotContributions,
  useTranslation,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Switch,
  TileFrame,
  TileGrid,
  TilePicker,
  appendTile,
  sanitizeTiles,
  useConfirm,
  type HostSectionDef,
  type TilePickerEntry,
  type TileSlot,
  useHostActions,
} from "@termix-ssh/plugin-sdk/ui";
import {
  Activity,
  Boxes,
  ExternalLink,
  History,
  LayoutGrid,
  List,
  Maximize2,
  RotateCcw,
  Zap,
} from "lucide-react";
import {
  getResources,
  getSignals,
  type Catalog,
  type CatalogAction,
  type SignalRead,
} from "../api";
import { ActionGroupTile, ActionTile, useRunner } from "./ActionTile";
import { EmbedSlot, type EmbedNodes } from "./embeds";
import { ActionsListTile, RunsTile } from "./ListTiles";
import {
  defaultHostTiles,
  mergeHostTiles,
  parseTile,
  quickActions,
  resourcesFor,
  tilesForHost,
  type HostTileSources,
} from "./model";
import { ResourceTile } from "./ResourceTile";
import { SignalView, statusOf } from "./SignalView";

type HostAction = ReturnType<typeof useHostActions>[number];
type Icon = ComponentType<{ className?: string }>;

/** Slot other plugins fill with their own host page tiles, given `{hostId, host}`. */
export const HOST_TILES_SLOT = "host-page.tiles";

/** A json setting, whether it comes back parsed or as text. */
function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const TILE_BORDER: Record<string, string> = {
  warn: "border-l-2 border-l-amber-500",
  fail: "border-l-2 border-l-destructive",
};

/** One host's page as tiles the user can arrange, add to and remove. */
export function HostGrid({
  host,
  shell,
  catalog,
  actions,
  sessions,
  sections,
  isVisible,
  editMode,
  onEditMode,
  onOpenTool,
  embed,
}: {
  host: PluginHostRecord;
  shell: ShellApi;
  catalog: Catalog | null;
  /** Catalog actions that apply to this host. */
  actions: CatalogAction[];
  sessions: HostAction[];
  sections: HostSectionDef[];
  isVisible: boolean;
  editMode: boolean;
  onEditMode: (on: boolean) => void;
  onOpenTool: (type: string) => void;
  embed: EmbedNodes;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const hostId = Number(host.id);
  const settings = useSettings("user");
  const contributions = useSlotContributions(HOST_TILES_SLOT, {
    hostId,
    host,
  }).filter((entry) => !!entry.component);
  const [signals, setSignals] = useState<SignalRead[]>([]);
  const [signalsLoaded, setSignalsLoaded] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [picked, setPicked] = useState<CatalogAction | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(true);
  const bump = useCallback(() => setRefresh((n) => n + 1), []);
  const { run } = useRunner(bump);

  useEffect(() => {
    setPicked(null);
    setSignalsLoaded(false);
  }, [hostId]);

  const loadSignals = useCallback(async () => {
    const list = await getSignals([hostId]).catch(() => null);
    if (list) setSignals(list);
    setSignalsLoaded(true);
  }, [hostId]);
  useEffect(() => {
    if (!isVisible) return;
    void loadSignals();
    const timer = setInterval(() => void loadSignals(), 15000);
    return () => clearInterval(timer);
  }, [isVisible, loadSignals, refresh]);

  const readFor = (id: string) =>
    signals
      .find((entry) => entry.id === id)
      ?.hosts.find((entry) => entry.hostId === hostId);

  const sources: HostTileSources = useMemo(
    () => ({
      catalog,
      actions,
      signals: (catalog?.signals ?? [])
        .filter((signal) => signal.scope === "host")
        .filter((signal) =>
          signals.some(
            (entry) =>
              entry.id === signal.id &&
              entry.hosts.some((read) => read.hostId === hostId),
          ),
        )
        .map((signal) => signal.id),
      sessions: sessions.map((session) => session.tabType!),
      sections: sections.map((section) => section.id),
      plugins: contributions.map((entry) => entry.actionId),
    }),
    // contributions changes identity each render; its ids are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      catalog,
      actions,
      signals,
      hostId,
      sessions,
      sections,
      contributions.map((entry) => entry.actionId).join(","),
    ],
  );

  // Resource counts for the "On this host" tile.
  const countable = useMemo(() => resourcesFor(sources), [sources]);
  useEffect(() => {
    if (!isVisible || countable.length === 0) return;
    let stop = false;
    const tick = async (attempt: number) => {
      const next: Record<string, number> = {};
      let pending = false;
      for (const resource of countable) {
        const result = await getResources(resource.id, {
          hostIds: [hostId],
        }).catch(() => null);
        if (!result) continue;
        if (result.hosts[0]?.state === "loading") pending = true;
        else if (result.hosts[0]?.state === "ok")
          next[resource.id] = result.rows.length;
      }
      if (stop) return;
      setCounts(next);
      if (pending && attempt < 8)
        setTimeout(() => void tick(attempt + 1), 2000);
    };
    void tick(0);
    return () => {
      stop = true;
    };
  }, [countable, hostId, isVisible]);

  // Saved layouts: one shared by every host, and some hosts' own.
  const shared = useMemo(() => {
    const value = jsonValue(settings.values.hostPageLayout);
    return Array.isArray(value) ? sanitizeTiles(value) : null;
  }, [settings.values.hostPageLayout]);
  const perHostValue = jsonValue(settings.values.hostPageLayouts);
  const perHost = (
    perHostValue && typeof perHostValue === "object" ? perHostValue : {}
  ) as Record<string, unknown>;
  const own = Array.isArray(perHost[String(hostId)])
    ? sanitizeTiles(perHost[String(hostId)])
    : null;
  // Until signals answer, a generated page would miss its status tiles.
  const ready = !!catalog && signalsLoaded;
  const generated = useMemo(() => defaultHostTiles(sources), [sources]);
  const slots = useMemo(
    () => tilesForHost(own ?? shared ?? generated, sources),
    [own, shared, generated, sources],
  );

  const save = (next: TileSlot[]) => {
    if (own) {
      void settings.save({
        hostPageLayouts: { ...perHost, [String(hostId)]: next },
      });
    } else {
      void settings.save({
        hostPageLayout: mergeHostTiles(shared ?? generated, next, sources),
      });
    }
  };
  const setOnlyThisHost = (on: boolean) => {
    const rest = { ...perHost };
    if (on) rest[String(hostId)] = slots;
    else delete rest[String(hostId)];
    void settings.save({ hostPageLayouts: rest });
  };
  const reset = async () => {
    const ok = await confirm({
      title: t("tiles.resetConfirm"),
      confirmLabel: t("tiles.reset"),
    });
    if (!ok) return;
    if (own) {
      const rest = { ...perHost };
      delete rest[String(hostId)];
      void settings.save({ hostPageLayouts: rest });
    } else void settings.save({ hostPageLayout: null });
  };

  const pluginNames = useMemo(() => {
    const names = new Map<string, string>();
    for (const action of catalog?.actions ?? [])
      names.set(action.pluginId, action.pluginName);
    return names;
  }, [catalog]);
  const nameOf = (pluginId: string) => pluginNames.get(pluginId) ?? pluginId;
  const general = t("tiles.groupGeneral");

  const labelOf = (id: string): string => {
    const ref = parseTile(id);
    if (!ref) return id;
    switch (ref.kind) {
      case "runs":
        return t("host.recent");
      case "actions":
        return t("host.actions");
      case "counts":
        return t("host.things");
      case "signal":
        return catalog?.signals.find((s) => s.id === ref.id)?.title ?? ref.id;
      case "action":
        return actions.find((a) => a.id === ref.id)?.title ?? ref.id;
      case "group":
        return t("tiles.allActionsOf", { plugin: nameOf(ref.id) });
      case "resource":
        return catalog?.resources.find((r) => r.id === ref.id)?.title ?? ref.id;
      case "session": {
        const session = sessions.find((s) => s.tabType === ref.id);
        return session
          ? (session.label?.(host as never) ?? t(session.titleKey))
          : ref.id;
      }
      case "section": {
        const section = sections.find((s) => s.id === ref.id);
        return section ? t(section.titleKey) : ref.id;
      }
      case "plugin": {
        const entry = contributions.find((c) => c.actionId === ref.id);
        return entry ? t(entry.titleKey) : ref.id;
      }
    }
  };

  const entries = useMemo((): TilePickerEntry[] => {
    const placed = new Set(slots.map((slot) => slot.id));
    const out: TilePickerEntry[] = [];
    const add = (entry: Omit<TilePickerEntry, "placed">) =>
      out.push({ ...entry, placed: placed.has(entry.id) });
    add({
      id: "runs",
      title: t("host.recent"),
      group: general,
      kind: "card",
      icon: <History />,
    });
    add({
      id: "actions",
      title: t("host.actions"),
      group: general,
      kind: "card",
      icon: <List />,
    });
    if (countable.length > 0)
      add({
        id: "counts",
        title: t("host.things"),
        group: general,
        kind: "card",
        icon: <Boxes />,
      });
    for (const session of sessions)
      add({
        id: `session:${session.tabType}`,
        title: labelOf(`session:${session.tabType}`),
        group: t("tiles.groupSessions"),
        kind: "session",
        icon: session.icon ? <session.icon /> : undefined,
      });
    for (const id of sources.signals) {
      const signal = catalog?.signals.find((s) => s.id === id);
      if (signal)
        add({
          id: `signal:${id}`,
          title: signal.title,
          group: nameOf(signal.pluginId),
          kind: "signal",
          icon: <Activity />,
        });
    }
    for (const resource of countable)
      add({
        id: `resource:${resource.id}`,
        title: resource.title,
        group: nameOf(resource.pluginId),
        kind: "resource",
        icon: <Boxes />,
      });
    const byPlugin = new Map<string, CatalogAction[]>();
    for (const action of actions) {
      if (action.scope === "server") continue;
      byPlugin.set(action.pluginId, [
        ...(byPlugin.get(action.pluginId) ?? []),
        action,
      ]);
      add({
        id: `action:${action.id}`,
        title: action.title,
        description: action.description,
        group: action.pluginName,
        kind: "action",
        icon: <Zap />,
      });
    }
    for (const [pluginId, list] of byPlugin)
      if (list.length > 1)
        add({
          id: `group:${pluginId}`,
          title: t("tiles.allActionsOf", { plugin: nameOf(pluginId) }),
          group: nameOf(pluginId),
          kind: "action",
          icon: <LayoutGrid />,
        });
    for (const section of sections)
      add({
        id: `section:${section.id}`,
        title: t(section.titleKey),
        group: t("tiles.groupSections"),
        kind: "card",
      });
    for (const entry of contributions)
      add({
        id: `plugin:${entry.actionId}`,
        title: t(entry.titleKey),
        group: t("tiles.groupPlugins"),
        kind: "chart",
        icon: entry.icon ? <entry.icon /> : undefined,
      });
    return out;
    // labelOf and nameOf read the same inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slots, sources, countable, sessions, sections, actions, catalog, t]);

  const addTile = (entry: TilePickerEntry) => {
    const ref = parseTile(entry.id);
    const size =
      ref?.kind === "session"
        ? { w: 8, h: 380 }
        : ref?.kind === "signal"
          ? { w: 2, h: 110 }
          : ref?.kind === "action"
            ? { w: 3, h: 170 }
            : { w: 6, h: 260 };
    save(appendTile(slots, { id: entry.id, ...size }));
  };

  const fix = (action: CatalogAction) => {
    if (quickActions([action]).length > 0) void run(action, { hostId });
    else
      shell.openSingletonTab("operations", {
        data: { view: "run", actionId: action.id, hostId },
      });
  };

  const renderTile = (id: string): ReactNode => {
    const ref = parseTile(id);
    if (!ref) return null;
    const title = labelOf(id);
    switch (ref.kind) {
      case "signal": {
        const signal = catalog?.signals.find((s) => s.id === ref.id);
        const read = readFor(ref.id);
        const status = statusOf(read?.value);
        const fixAction =
          signal?.fix && status !== "ok"
            ? actions.find((action) => action.id === signal.fix)
            : undefined;
        const link = read?.value?.link;
        return (
          <TileFrame
            title={title}
            className={TILE_BORDER[status]}
            onTitleClick={
              link
                ? () =>
                    sessions.some((s) => s.tabType === link.tab)
                      ? onOpenTool(link.tab)
                      : shell.openSingletonTab(link.tab, { data: link.data })
                : undefined
            }
          >
            <SignalView
              kind={signal?.kind ?? "status"}
              result={read?.value}
              state={read?.state ?? "loading"}
              footer={
                fixAction && read?.state === "ok" ? (
                  <Button
                    size="xs"
                    variant="outline"
                    className="self-start"
                    onClick={() => fix(fixAction)}
                  >
                    {fixAction.title}
                  </Button>
                ) : undefined
              }
            />
          </TileFrame>
        );
      }
      case "action": {
        const action = actions.find((a) => a.id === ref.id);
        if (!action) return null;
        return (
          <TileFrame title={title} icon={<Zap />}>
            <ActionTile action={action} hostId={hostId} onDone={bump} />
          </TileFrame>
        );
      }
      case "group": {
        const list = actions.filter(
          (a) => a.pluginId === ref.id && a.scope !== "server",
        );
        return (
          <TileFrame title={title} icon={<LayoutGrid />}>
            <ActionGroupTile
              actions={list}
              hostId={hostId}
              onDone={bump}
              onPick={setPicked}
            />
          </TileFrame>
        );
      }
      case "resource": {
        const resource = catalog?.resources.find((r) => r.id === ref.id);
        if (!resource) return null;
        return (
          <TileFrame
            title={title}
            icon={<Boxes />}
            onTitleClick={
              resource.tab ? () => onOpenTool(resource.tab!) : undefined
            }
          >
            <ResourceTile
              resource={resource}
              actions={actions}
              hostId={hostId}
              isVisible={isVisible}
            />
          </TileFrame>
        );
      }
      case "session": {
        const session = sessions.find((s) => s.tabType === ref.id);
        const SessionIcon = session?.icon as Icon | undefined;
        return (
          <TileFrame
            title={title}
            icon={SessionIcon ? <SessionIcon /> : undefined}
            bodyClassName="overflow-hidden"
            actions={
              <>
                <TileButton
                  label={t("tiles.maximize")}
                  onClick={() => onOpenTool(ref.id)}
                >
                  <Maximize2 className="size-3" />
                </TileButton>
                <TileButton
                  label={t("host.popOut")}
                  onClick={() =>
                    shell.openTab(host as never, ref.id, { forceNewTab: true })
                  }
                >
                  <ExternalLink className="size-3" />
                </TileButton>
              </>
            }
          >
            {editMode ? (
              <div className="flex flex-1 items-center justify-center text-xs text-muted-foreground">
                {title}
              </div>
            ) : (
              <EmbedSlot type={ref.id} embed={embed} />
            )}
          </TileFrame>
        );
      }
      case "section": {
        const section = sections.find((s) => s.id === ref.id);
        if (!section) return null;
        const Card = section.component;
        return (
          <TileFrame title={title}>
            <div className="p-3">
              <Card
                host={host as never}
                isVisible={isVisible}
                shell={shell as never}
              />
            </div>
          </TileFrame>
        );
      }
      case "plugin": {
        const entry = contributions.find((c) => c.actionId === ref.id);
        const Tile = entry?.component;
        if (!Tile) return null;
        return <Tile hostId={hostId} host={host} isVisible={isVisible} />;
      }
      case "counts":
        return (
          <TileFrame title={title} icon={<Boxes />}>
            <div className="flex flex-wrap gap-2 p-3">
              {countable
                .filter((resource) => counts[resource.id] !== undefined)
                .map((resource) => (
                  <button
                    key={resource.id}
                    type="button"
                    className="border border-border px-3 py-2 text-left text-xs hover:bg-muted"
                    onClick={() => resource.tab && onOpenTool(resource.tab)}
                  >
                    <div className="text-lg font-semibold tabular-nums">
                      {counts[resource.id]}
                    </div>
                    <div className="text-muted-foreground">
                      {resource.title}
                    </div>
                  </button>
                ))}
            </div>
          </TileFrame>
        );
      case "runs":
        return (
          <TileFrame title={title} icon={<History />}>
            <RunsTile
              hostId={hostId}
              catalog={catalog}
              isVisible={isVisible}
              refresh={refresh}
            />
          </TileFrame>
        );
      case "actions":
        return (
          <TileFrame title={title} icon={<List />}>
            <ActionsListTile
              hostId={hostId}
              actions={actions}
              picked={picked}
              onPick={setPicked}
              onDone={bump}
            />
          </TileFrame>
        );
    }
  };

  if (!ready) {
    return (
      <p className="p-4 text-xs text-muted-foreground">{t("state.loading")}</p>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {editMode && (
          <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-3 py-1.5 text-xs">
            <label className="flex items-center gap-2">
              <Switch checked={!!own} onCheckedChange={setOnlyThisHost} />
              {t("tiles.onlyThisHost")}
            </label>
            <Button
              size="xs"
              variant="ghost"
              className="gap-1"
              onClick={() => void reset()}
            >
              <RotateCcw className="size-3" />
              {t("tiles.reset")}
            </Button>
            {!pickerOpen && (
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setPickerOpen(true)}
              >
                {t("tiles.addTiles")}
              </Button>
            )}
            <Button
              size="xs"
              className="ml-auto"
              onClick={() => onEditMode(false)}
            >
              {t("tiles.done")}
            </Button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
          <TileGrid
            slots={slots}
            editMode={editMode}
            renderTile={renderTile}
            tileLabel={labelOf}
            onChange={save}
          />
        </div>
      </div>
      {editMode && pickerOpen && (
        <TilePicker
          entries={entries}
          onAdd={addTile}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function TileButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className="flex size-5 items-center justify-center text-muted-foreground hover:text-foreground"
    >
      {children}
    </button>
  );
}
