import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  appendTile,
  Button,
  EmptyState,
  LoadingState,
  PanelShell,
  PluginViewPlaceholder,
  TileEditBar,
  TileFrame,
  TileGrid,
  TilePicker,
  useConfirm,
  type TilePickerEntry,
  type TileSlot,
} from "@termix-ssh/plugin-sdk/ui";
import { Check, LayoutGrid, Pencil } from "lucide-react";
import type {
  CanvasWidget,
  WidgetTypeDefinition,
  WidgetTypeId,
} from "./types.js";
import { GRID_SIZE } from "./types.js";
import {
  createHomepageItem,
  deleteHomepageItem,
  getHomepageItems,
  getHomepageLayout,
  saveHomepageLayout,
  updateHomepageItem,
} from "./api.js";
import {
  columnsFor,
  isGridLayout,
  layoutFromSlots,
  slotsForItems,
} from "./grid-layout";
import { WidgetEditDialog } from "./dialogs/WidgetEditDialog";
import { getWidgetType, useWidgetTypes } from "./widgets/WidgetRegistry";

// Side-effect imports so widgets register themselves
import "./widgets/ServiceLinkWidget";
import "./widgets/ClockWidget";
import "./widgets/NotesWidget";
import "./widgets/BookmarkListWidget";
import "./widgets/HostStatusWidget";
import "./widgets/FolderWidget";
import "./widgets/WeatherWidget";
import "./widgets/IframeWidget";
import "./widgets/RssFeedWidget";
import "./widgets/HostGridWidget";
import "./widgets/PingStatusWidget";
import "./widgets/RecentActivityWidget";
import "./widgets/TermixUptimeWidget";
import "./widgets/SystemOverviewWidget";
import "./widgets/SshTerminalWidget";
import "./widgets/QuickConnectWidget";
import "./widgets/CalendarWidget";
import "./widgets/CountdownWidget";
import "./widgets/SearchBarWidget";
import "./widgets/TextBannerWidget";
import "./widgets/ImageWidget";
import "./widgets/MarkdownNotesWidget";
import "./widgets/CustomApiWidget";
import "./widgets/ServiceGridWidget";
import "./widgets/DashboardLinksWidget";
import "./widgets/SearchLinksWidget";
import "./widgets/LinkTreeWidget";

const CATEGORIES = ["links", "info", "system", "monitoring"] as const;
const CATEGORY_LABEL = {
  links: "homepage.categoryLinks",
  info: "homepage.categoryInfo",
  system: "homepage.categorySystem",
  monitoring: "homepage.categoryMonitoring",
} as const;
const SAVE_DELAY = 500;

interface HomepageGridProps {
  isReadOnly?: boolean;
  /** False when the host view draws its own header. */
  chrome?: boolean;
  editMode?: boolean;
  onEditMode?: (on: boolean) => void;
}

const defaultSize = (typeId: WidgetTypeId) =>
  getWidgetType(typeId)?.defaultSize ?? {
    w: GRID_SIZE * 8,
    h: GRID_SIZE * 6,
  };

function WidgetTile({
  widget,
  isReadOnly,
  onConfigUpdate,
}: {
  widget: CanvasWidget;
  isReadOnly: boolean;
  onConfigUpdate: (config: Record<string, unknown>) => void;
}) {
  // A plugin widget appears once its plugin starts.
  useWidgetTypes();
  const Widget = getWidgetType(widget.typeId)?.component;
  return (
    <TileFrame bare bodyClassName="overflow-hidden">
      {Widget ? (
        <Widget
          widget={widget}
          config={widget.config as Record<string, unknown>}
          isReadOnly={isReadOnly}
          onConfigUpdate={onConfigUpdate}
        />
      ) : (
        <PluginViewPlaceholder kind="card" viewId={widget.typeId} compact />
      )}
    </TileFrame>
  );
}

/** The widget page: tiles on the shared grid, saved per user. */
export function HomepageGrid({
  isReadOnly = false,
  chrome = true,
  editMode: editProp,
  onEditMode,
}: HomepageGridProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const types = useWidgetTypes();
  const [widgets, setWidgets] = useState<CanvasWidget[]>([]);
  const [slots, setSlots] = useState<TileSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownEdit, setOwnEdit] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [editing, setEditing] = useState<CanvasWidget | null>(null);
  const [dialogKey, setDialogKey] = useState(0);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const editMode = !isReadOnly && (editProp ?? ownEdit);
  const setEditMode = onEditMode ?? setOwnEdit;

  const save = useCallback((next: TileSlot[]) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveHomepageLayout(layoutFromSlots(next)).catch(() => {});
    }, SAVE_DELAY);
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getHomepageItems(), getHomepageLayout()])
      .then(([items, row]) => {
        if (cancelled) return;
        const loaded: CanvasWidget[] = items.map((item) => ({
          id: item.id,
          typeId: item.typeId as WidgetTypeId,
          title: item.title,
          config: JSON.parse(item.config || "{}"),
        }));
        const typeOf = new Map(loaded.map((w) => [w.id, w.typeId]));
        const next = slotsForItems(
          row?.layout,
          loaded.map((w) => w.id),
          (id) => defaultSize(typeOf.get(id)!),
          (id) => typeOf.get(id) === "folder",
        );
        setWidgets(loaded);
        setSlots(next);
        // An old canvas layout moves over once.
        if (
          !isReadOnly &&
          row?.layout?.entries?.length &&
          !isGridLayout(row.layout)
        ) {
          saveHomepageLayout(layoutFromSlots(next)).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isReadOnly]);

  const byId = useMemo(
    () => new Map(widgets.map((w) => [String(w.id), w])),
    [widgets],
  );

  const handleSaveEdit = useCallback(
    async (
      id: number,
      title: string | null,
      config: Record<string, unknown>,
    ) => {
      try {
        await updateHomepageItem(id, { title, config });
        setWidgets((prev) =>
          prev.map((w) => (w.id === id ? { ...w, title, config } : w)),
        );
      } catch {
        // A failed write is dropped; the page keeps what it shows.
      }
    },
    [],
  );

  const handleChange = async (next: TileSlot[]) => {
    const ids = new Set(next.map((slot) => slot.id));
    const removed = slots.filter((slot) => !ids.has(slot.id));
    if (removed.length > 0) {
      const ok = await confirm({
        title: t("homepage.deleteWidgetConfirm"),
        confirmLabel: t("common.delete"),
      });
      if (!ok) return;
      await Promise.all(
        removed.map((slot) =>
          deleteHomepageItem(Number(slot.id)).catch(() => {}),
        ),
      );
      setWidgets((prev) => prev.filter((w) => ids.has(String(w.id))));
    }
    setSlots(next);
    save(next);
  };

  const handleAdd = async (entry: TilePickerEntry) => {
    const typeId = entry.id as WidgetTypeId;
    const typeDef = getWidgetType(typeId);
    if (!typeDef) return;
    try {
      const item = await createHomepageItem({
        typeId,
        config: typeDef.defaultConfig as Record<string, unknown>,
      });
      setWidgets((prev) => [
        ...prev,
        {
          id: item.id,
          typeId,
          title: item.title,
          config: typeDef.defaultConfig as Record<string, unknown>,
        },
      ]);
      const next = appendTile(slots, {
        id: String(item.id),
        w: columnsFor(typeDef.defaultSize.w),
        h: typeDef.defaultSize.h,
      });
      setSlots(next);
      save(next);
    } catch {
      // A failed write is dropped; the page keeps what it shows.
    }
  };

  const labelOf = useCallback(
    (type: WidgetTypeDefinition | undefined, id: string) =>
      type
        ? t(`homepage.widgets.${type.id}.name`, { defaultValue: type.name })
        : id,
    [t],
  );

  const pickerEntries: TilePickerEntry[] = CATEGORIES.flatMap((category) =>
    types
      .filter((type) => type.category === category)
      .map((type) => ({
        id: type.id,
        title: labelOf(type, type.id),
        description: t(`homepage.widgets.${type.id}.description`, {
          defaultValue: type.description,
        }),
        group: t(CATEGORY_LABEL[category]),
        kind: "card" as const,
        icon: type.icon,
      })),
  );

  const tileLabel = (id: string) => {
    const widget = byId.get(id);
    return widget?.title || labelOf(widget && getWidgetType(widget.typeId), id);
  };

  const renderTile = (id: string) => {
    const widget = byId.get(id);
    if (!widget) return null;
    return (
      <WidgetTile
        widget={widget}
        isReadOnly={isReadOnly || editMode}
        onConfigUpdate={(config) =>
          void handleSaveEdit(widget.id, widget.title, config)
        }
      />
    );
  };

  const body = loading ? (
    <LoadingState />
  ) : (
    <>
      {editMode && (
        <TileEditBar
          onAdd={pickerOpen ? undefined : () => setPickerOpen(true)}
          onDone={() => setEditMode(false)}
        />
      )}
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto thin-scrollbar">
          {widgets.length === 0 && !editMode ? (
            <EmptyState icon={LayoutGrid} title={t("homepage.noWidgets")} />
          ) : (
            <TileGrid
              slots={slots}
              editMode={editMode}
              renderTile={renderTile}
              tileLabel={tileLabel}
              onChange={(next) => void handleChange(next)}
              onSettings={(id) => {
                const widget = byId.get(id);
                if (!widget) return;
                setEditing(widget);
                setDialogKey((key) => key + 1);
              }}
              empty={t("homepage.noWidgets")}
            />
          )}
        </div>
        {editMode && pickerOpen && (
          <TilePicker
            entries={pickerEntries}
            onAdd={(entry) => void handleAdd(entry)}
            onClose={() => setPickerOpen(false)}
          />
        )}
      </div>
      <WidgetEditDialog
        key={dialogKey}
        widget={editing}
        onSave={handleSaveEdit}
        onClose={() => setEditing(null)}
      />
    </>
  );

  if (!chrome) {
    return <div className="flex h-full min-h-0 flex-col">{body}</div>;
  }

  return (
    <PanelShell
      icon={<LayoutGrid className="size-4" />}
      title={t("nav.homepage")}
      scroll={false}
      actions={
        !isReadOnly && (
          <Button
            variant="ghost"
            size="icon-sm"
            title={t("homepage.customize")}
            aria-label={t("homepage.customize")}
            className={editMode ? "text-accent-brand" : ""}
            onClick={() => setEditMode(!editMode)}
          >
            {editMode ? (
              <Check className="size-4" />
            ) : (
              <Pencil className="size-4" />
            )}
          </Button>
        )
      }
    >
      {body}
    </PanelShell>
  );
}
