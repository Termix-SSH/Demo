import {
  Select2,
  InlineView,
  actionOrder,
  useHostActions,
  SectionCard,
  SettingRow,
  FakeSwitch,
  type HostClickBehavior,
  type HostDensity,
  type HostRowFields,
  type HostSidebarPreferences,
  type HostTrayTrigger,
} from "@termix-ssh/plugin-sdk/ui";
import {
  usePluginUiPreferences,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListChecks, PanelTop, Rows3, SquareStack } from "lucide-react";
import {
  HOST_PAGE_TAB,
  hostToolsMode,
  showsInBar,
} from "./tree/host-bar-actions";
import { stripedRows } from "./striped-rows";

const ROW_FIELDS: { key: keyof HostRowFields; dependsOnAddress?: boolean }[] = [
  { key: "showAddress" },
  { key: "showUsername", dependsOnAddress: true },
  { key: "showPort", dependsOnAddress: true },
  { key: "showPinIcon" },
  { key: "showSharedBadge" },
  { key: "showBadges" },
];

export function CustomizeSidebarPanel({
  open,
  onOpenChange,
  preferences,
  update,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  preferences: HostSidebarPreferences;
  update: (
    patch:
      | Partial<HostSidebarPreferences>
      | ((prev: HostSidebarPreferences) => HostSidebarPreferences),
  ) => void;
}) {
  const { t } = useTranslation();
  const actions = [...useHostActions()].sort(
    (a, b) => actionOrder(a) - actionOrder(b) || a.id.localeCompare(b.id),
  );
  const hasHostPage = actions.some(
    (action) => action.tabType === HOST_PAGE_TAB,
  );
  const layoutPrefs = usePluginUiPreferences<{
    hostTools?: string;
    clickAction?: string;
  }>();
  // The old Host page click choice now lives in Click opens.
  const clickBehavior =
    preferences.display.hostClickBehavior === "hostPage"
      ? "focusExisting"
      : preferences.display.hostClickBehavior;
  const hostPageAction = actions.find(
    (action) => action.tabType === HOST_PAGE_TAB,
  );
  const clickAction =
    layoutPrefs.values.clickAction ??
    (preferences.display.hostClickBehavior === "hostPage"
      ? (hostPageAction?.id ?? "")
      : "");
  // The page is the only way in, so click and row button choices do nothing.
  const pageOnly =
    hasHostPage && hostToolsMode(layoutPrefs.values.hostTools) === "only";

  return (
    <InlineView
      stacked
      open={open}
      onOpenChange={onOpenChange}
      title={t("hosts.customizeSidebar")}
    >
      <p className="text-xs text-muted-foreground">
        {t("hosts.customizeSidebarDescription")}
      </p>
      <div className="flex flex-col">
        <SectionCard
          title={t("hosts.customizeDensityTitle")}
          icon={<Rows3 className="size-3.5" />}
        >
          <SettingRow
            label={t("hosts.customizeDensityTitle")}
            description={
              preferences.display.density === "comfortable"
                ? t("hosts.densityComfortableDesc")
                : t("hosts.densityCompactDesc")
            }
          >
            <Select2
              value={preferences.display.density}
              onChange={(e) =>
                update((prev) => ({
                  ...prev,
                  display: {
                    ...prev.display,
                    density: e.target.value as HostDensity,
                  },
                }))
              }
              className="h-8 border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="comfortable">
                {t("hosts.displayDensityComfortable")}
              </option>
              <option value="compact">
                {t("hosts.displayDensityCompact")}
              </option>
            </Select2>
          </SettingRow>
        </SectionCard>

        <SectionCard
          title={t("hosts.rowDetailsTitle")}
          icon={<ListChecks className="size-3.5" />}
        >
          <p className="pt-2 text-xs text-muted-foreground">
            {t("hosts.rowDetailsDesc")}
          </p>
          {ROW_FIELDS.map(({ key, dependsOnAddress }) => (
            <SettingRow
              key={key}
              label={t(`hosts.${key}`)}
              description={t(`hosts.${key}Desc`)}
            >
              <FakeSwitch
                checked={preferences.display[key]}
                disabled={dependsOnAddress && !preferences.display.showAddress}
                onChange={(v) =>
                  update((prev) => ({
                    ...prev,
                    display: { ...prev.display, [key]: v },
                  }))
                }
              />
            </SettingRow>
          ))}
        </SectionCard>

        <SectionCard
          title={t("hosts.customizeBehaviorTitle")}
          icon={<SquareStack className="size-3.5" />}
        >
          <SettingRow
            label={t("newUi.sidebar.userProfile.showHostTags")}
            description={t("newUi.sidebar.userProfile.showHostTagsDesc")}
          >
            <FakeSwitch
              checked={preferences.display.showTags}
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: { ...prev.display, showTags: v },
                }))
              }
            />
          </SettingRow>
          <SettingRow
            label={t("hosts.stripedRows")}
            description={t("hosts.stripedRowsDesc")}
          >
            <FakeSwitch
              checked={stripedRows(preferences.display)}
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: { ...prev.display, stripedRows: v },
                }))
              }
            />
          </SettingRow>
          <SettingRow
            label={t("hosts.showFolderPaths")}
            description={t("hosts.showFolderPathsDesc")}
          >
            <FakeSwitch
              checked={preferences.display.showFolderPaths}
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: { ...prev.display, showFolderPaths: v },
                }))
              }
            />
          </SettingRow>
          <div className="flex flex-col gap-1.5 py-3 border-b border-border last:border-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-snug">
                {t("hosts.actionsVisibility")}
              </span>
              <span className="text-xs text-muted-foreground leading-snug">
                {t("hosts.actionsVisibilityDesc")}
              </span>
            </div>
            <Select2
              value={preferences.display.trayTrigger}
              onChange={(e) =>
                update((prev) => ({
                  ...prev,
                  display: {
                    ...prev.display,
                    trayTrigger: e.target.value as HostTrayTrigger,
                  },
                }))
              }
              className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="always">{t("hosts.actionsAlways")}</option>
              <option value="actionsOnly">{t("hosts.actionsOnly")}</option>
              <option value="hover">{t("hosts.actionsHover")}</option>
              <option value="click">{t("hosts.actionsClick")}</option>
            </Select2>
          </div>
          <div className="flex flex-col gap-1.5 py-3 border-b border-border last:border-0">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium leading-snug">
                {t("hosts.hostClickBehavior")}
              </span>
              <span className="text-xs text-muted-foreground leading-snug">
                {t("hosts.hostClickBehaviorDesc")}
              </span>
            </div>
            <Select2
              value={clickBehavior}
              disabled={pageOnly}
              onChange={(e) =>
                update((prev) => ({
                  ...prev,
                  display: {
                    ...prev.display,
                    hostClickBehavior: e.target.value as HostClickBehavior,
                  },
                }))
              }
              className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="newTab">{t("hosts.hostClickNewTab")}</option>
              <option value="focusExisting">
                {t("hosts.hostClickFocusExisting")}
              </option>
              <option value="focusExistingDoubleClickNew">
                {t("hosts.hostClickFocusExistingDoubleNew")}
              </option>
            </Select2>
          </div>
          {!pageOnly && actions.length > 1 && (
            <div className="flex flex-col gap-1.5 py-3 border-b border-border last:border-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-snug">
                  {t("hostTools.clickOpens")}
                </span>
                <span className="text-xs text-muted-foreground leading-snug">
                  {t("hostTools.clickOpensDesc")}
                </span>
              </div>
              <Select2
                value={clickAction}
                onChange={(e) => {
                  layoutPrefs.set("clickAction", e.target.value || null);
                  // Moves an old Host page click choice over for good.
                  if (preferences.display.hostClickBehavior === "hostPage") {
                    update((prev) => ({
                      ...prev,
                      display: {
                        ...prev.display,
                        hostClickBehavior: "focusExisting",
                      },
                    }));
                  }
                }}
                className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">{t("hostTools.clickAuto")}</option>
                {actions.map((action) => (
                  <option key={action.id} value={action.id}>
                    {t(action.titleKey)}
                  </option>
                ))}
              </Select2>
            </div>
          )}
          {hasHostPage && (
            <div className="flex flex-col gap-1.5 py-3 border-b border-border last:border-0">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium leading-snug">
                  {t("hostTools.mode")}
                </span>
                <span className="text-xs text-muted-foreground leading-snug">
                  {t("hostTools.modeDesc")}
                </span>
              </div>
              <Select2
                value={hostToolsMode(layoutPrefs.values.hostTools)}
                onChange={(e) => {
                  const mode = hostToolsMode(e.target.value);
                  layoutPrefs.set("hostTools", mode === "tab" ? null : mode);
                }}
                className="h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="tab">{t("hostTools.modeTab")}</option>
                <option value="page">{t("hostTools.modePage")}</option>
                <option value="only">{t("hostTools.modeOnly")}</option>
              </Select2>
            </div>
          )}
          <SettingRow
            label={t("hosts.openOnDoubleClick")}
            description={t("hosts.openOnDoubleClickDesc")}
          >
            <FakeSwitch
              checked={preferences.display.openOnDoubleClick}
              disabled={
                preferences.display.hostClickBehavior ===
                "focusExistingDoubleClickNew"
              }
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: { ...prev.display, openOnDoubleClick: v },
                }))
              }
            />
          </SettingRow>
          <SettingRow
            label={t("hosts.closeOnOpen")}
            description={t("hosts.closeOnOpenDesc")}
          >
            <FakeSwitch
              checked={preferences.display.closeOnOpen}
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: { ...prev.display, closeOnOpen: v },
                }))
              }
            />
          </SettingRow>
          <SettingRow
            label={t("newUi.sidebar.userProfile.statusColors")}
            description={t("newUi.sidebar.userProfile.statusColorsDesc")}
          >
            <FakeSwitch
              checked={preferences.display.statusColorScheme === "status"}
              onChange={(v) =>
                update((prev) => ({
                  ...prev,
                  display: {
                    ...prev.display,
                    statusColorScheme: v ? "status" : "accent",
                  },
                }))
              }
            />
          </SettingRow>
        </SectionCard>

        {actions.length > 0 && !pageOnly && (
          <SectionCard
            title={t("hosts.connectBarTitle")}
            icon={<PanelTop className="size-3.5" />}
          >
            <p className="pt-2 text-xs text-muted-foreground">
              {t("hosts.connectBarDesc")} {t("hostTools.perHostHint")}
            </p>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <SettingRow
                  key={action.id}
                  label={t(action.titleKey)}
                  rowId={`bar-action-${action.id}`}
                >
                  <span className="flex items-center gap-2">
                    <Icon className="size-3.5 text-muted-foreground" />
                    <FakeSwitch
                      checked={showsInBar(
                        preferences.display.barActions,
                        action,
                      )}
                      onChange={(v) =>
                        update((prev) => ({
                          ...prev,
                          display: {
                            ...prev.display,
                            barActions: {
                              ...prev.display.barActions,
                              [action.id]: v,
                            },
                          },
                        }))
                      }
                    />
                  </span>
                </SettingRow>
              );
            })}
          </SectionCard>
        )}

        <p className="text-[11px] text-muted-foreground/70 leading-snug">
          {t("hosts.customizeSortHint")}
        </p>
      </div>
    </InlineView>
  );
}
