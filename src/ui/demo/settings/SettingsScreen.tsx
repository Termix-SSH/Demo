import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { LucideIcon } from "lucide-react";
import {
  Bell,
  ChevronDown,
  Database,
  KeyRound,
  Monitor,
  Palette,
  PanelLeft,
  Puzzle,
  Server,
  Terminal as TerminalIcon,
  Settings as SettingsIcon,
  Shield,
  SlidersHorizontal,
  User,
} from "lucide-react";
import { Button } from "@/components/button";
import { Separator } from "@/components/separator";
import { SectionCard, SettingRow, FakeSwitch } from "@/components/section-card";
import { GroupHeading, PANEL } from "@/components/panel-layout";
import { DemoPanel } from "@/demo/DemoPanel";
import { PluginsScreen } from "@/demo/plugins/PluginsScreen";
import { getPlugins, subscribePlugins } from "@/demo/plugins/plugin-store";
import { pluginIcon } from "@/demo/plugins/plugin-icons";
import type { DemoPlugin } from "@/demo/plugins/plugin-data";
import { useUiPreferencesContext } from "@/contexts/UiPreferencesContext";
import {
  readRailPreference,
  setRailPreference,
} from "@/sidebar/rail-preferences";
import { effectivePresetLabel } from "@/types/ui-preferences";
import type { UiPreset } from "@/types/ui-preferences";

/**
 * Everything that configures the app rather than operating a server.
 *
 * Profile and admin used to be rail entries opening a 291px sidebar panel,
 * which is the wrong shape for 7 profile sections and 13 admin ones. This is
 * the same full-window pattern PluginsScreen already uses: you go there and
 * come back, rather than keeping it docked beside your work.
 */

/** Built-in sections, plus "plugin:<id>" for a plugin's own settings page. */
type SectionId =
  | "account"
  | "interface"
  | "appearance"
  | "security"
  | "data"
  | "plugins"
  | "alerts"
  | "admin"
  | `plugin:${string}`;

const PRESET_IDS: Exclude<UiPreset, "custom">[] = [
  "simple",
  "balanced",
  "advanced",
];

export function SettingsScreen({
  isAdmin = true,
  username = "demo",
  initialSection = "account",
}: {
  isAdmin?: boolean;
  username?: string;
  /** Which page to land on. Profile and admin are entries into this screen. */
  initialSection?: SectionId;
}) {
  const { t } = useTranslation();
  const [section, setSection] = useState<SectionId>(initialSection);
  const [navOpen, setNavOpen] = useState(false);
  const [plugins, setPlugins] = useState(getPlugins);

  useEffect(() => subscribePlugins(() => setPlugins([...getPlugins()])), []);

  // A plugin that declares settings and is installed gets its own page. It
  // goes when the plugin does, which is what makes the contribution real
  // rather than a line of prose in the plugin list.
  const pluginPages = plugins.filter(
    (plugin) => plugin.installed && plugin.contributions?.settings,
  );

  // Grouped the way the rail is: your account, then how the app looks and
  // behaves, then the instance. A flat list of eight read as a pile.
  const bands: {
    heading: string;
    items: {
      id: SectionId;
      label: string;
      icon: React.ElementType;
    }[];
  }[] = [
    {
      heading: t("settings.bandYou"),
      items: [
        {
          id: "account",
          label: t("settings.account"),
          icon: User,
        },
        {
          id: "security",
          label: t("settings.security"),
          icon: Shield,
        },
        {
          id: "data",
          label: t("settings.data"),
          icon: Database,
        },
      ],
    },
    {
      heading: t("settings.bandApp"),
      items: [
        {
          id: "interface",
          label: t("settings.interface"),
          icon: SlidersHorizontal,
        },
        {
          id: "appearance",
          label: t("settings.appearance"),
          icon: Palette,
        },
        {
          id: "plugins",
          label: t("nav.plugins"),
          icon: Puzzle,
        },
        {
          id: "alerts",
          label: t("nav.alerts"),
          icon: Bell,
        },
      ],
    },
    ...(pluginPages.length > 0
      ? [
          {
            heading: t("settings.bandPlugins"),
            items: pluginPages.map((plugin) => ({
              id: `plugin:${plugin.id}` as SectionId,
              label: plugin.name,
              icon: pluginIcon(
                plugin.contributions?.settings?.icon,
              ) as React.ElementType,
            })),
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            heading: t("settings.bandInstance"),
            items: [
              {
                id: "admin" as SectionId,
                label: t("nav.admin"),
                icon: SettingsIcon as React.ElementType,
              },
            ],
          },
        ]
      : []),
  ];

  const sections = bands.flatMap((band) => band.items);
  const active = sections.find((s) => s.id === section) ?? sections[0];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      <header
        className={`flex ${PANEL.header} shrink-0 flex-row items-center border-b border-border`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2 px-3">
          <SettingsIcon className="size-4 shrink-0 text-accent-brand" />
          <span className="truncate text-base font-bold tracking-tight">
            {t("settings.title")}
          </span>
          <Separator orientation="vertical" className="h-4" />
          <span className="hidden truncate text-[10px] font-semibold uppercase tracking-widest text-muted-foreground md:inline">
            {active.label}
          </span>
          {/* The nav column does not fit beside the content on a phone, so
              there it collapses behind the section name. */}
          <button
            onClick={() => setNavOpen((v) => !v)}
            aria-expanded={navOpen}
            className="flex min-w-0 items-center gap-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground md:hidden"
          >
            <span className="truncate">{active.label}</span>
            <ChevronDown
              className={`size-3 shrink-0 transition-transform ${navOpen ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Same shape as the file manager's sidebar, which is the app's
            existing nav list: a left marker rather than a filled row, hairline
            group headings. */}
        <nav
          className={`${navOpen ? "flex" : "hidden"} w-full shrink-0 flex-col gap-3 overflow-y-auto border-r border-border py-2.5 md:flex md:w-60`}
        >
          {bands.map((band) => (
            <div key={band.heading} className="flex flex-col">
              <GroupHeading title={band.heading} className="px-2.5 pb-1.5" />
              {band.items.map((item) => {
                const Icon = item.icon;
                const on = item.id === section;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setSection(item.id);
                      setNavOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 border-l-2 py-2.5 pl-2 pr-2 text-left transition-colors md:py-1.5 ${
                      on
                        ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                        : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="size-3.5 shrink-0" />
                    <span className="truncate text-xs font-medium">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </nav>

        <div
          className={`${navOpen ? "hidden" : ""} min-h-0 flex-1 overflow-y-auto md:block`}
        >
          {section === "account" ? (
            <AccountSection username={username} />
          ) : section === "plugins" ? (
            <PluginsScreen chrome={false} />
          ) : section === "interface" ? (
            <InterfaceSection />
          ) : section === "appearance" ? (
            <AppearanceSection />
          ) : section === "admin" ? (
            <AdminSection />
          ) : section.startsWith("plugin:") ? (
            <PluginSettingsPage
              plugin={plugins.find((x) => `plugin:${x.id}` === section) ?? null}
            />
          ) : (
            <PlaceholderSection id={section} />
          )}
        </div>
      </div>
    </div>
  );
}

/** The account summary the real profile opens with. */
function AccountSection({ username }: { username: string }) {
  const { t } = useTranslation();
  const p = (key: string) => t(`newUi.sidebar.userProfile.${key}`);

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <SectionCard
        title={p("sectionAccount")}
        icon={<User className="size-3.5" />}
      >
        <SettingRow label={p("usernameLabel")}>
          <span className="text-xs text-muted-foreground">{username}</span>
        </SettingRow>
        <SettingRow label={p("roleLabel")}>
          <span className="text-xs text-muted-foreground">
            {p("roleAdministrator")}
          </span>
        </SettingRow>
        <SettingRow label={p("authMethodLabel")}>
          <span className="text-xs text-muted-foreground">
            {p("authMethodLocal")}
          </span>
        </SettingRow>
        <SettingRow label={p("twoFaLabel")}>
          <span className="border border-border px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            {p("twoFaOff")}
          </span>
        </SettingRow>
        <SettingRow label={p("versionLabel")}>
          <span className="font-mono text-xs text-muted-foreground">2.7.1</span>
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={p("storageModeSwitch")}
        icon={<Database className="size-3.5" />}
      >
        <SettingRow
          description={p("storageModeDescription")}
          label={p("storageModeSwitch")}
        >
          <ReadonlySelect value={p("storageModeCloud")} />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={p("deleteAccount")}
        icon={<Shield className="size-3.5" />}
      >
        <SettingRow
          label={p("deleteAccount")}
          description={p("deleteAccountDescription")}
        >
          <Button variant="destructive" size="sm" className="h-7">
            {p("deleteButton")}
          </Button>
        </SettingRow>
      </SectionCard>
    </div>
  );
}

/** The preset picker. The system already existed; nothing ever showed it. */
function InterfaceSection() {
  const { t } = useTranslation();
  const p = (key: string) => t(`newUi.sidebar.userProfile.${key}`);
  const ctx = useUiPreferencesContext();
  const [pinRail, setPinRail] = useState(() =>
    readRailPreference("pinAppRail"),
  );
  const [hoverRail, setHoverRail] = useState(() =>
    readRailPreference("expandAppRailOnHover"),
  );
  const current = ctx ? effectivePresetLabel(ctx.preferences) : "balanced";

  const hints: Record<Exclude<UiPreset, "custom">, string> = {
    simple: t("newUi.sidebar.userProfile.preset_simple_desc"),
    balanced: t("newUi.sidebar.userProfile.preset_balanced_desc"),
    advanced: t("newUi.sidebar.userProfile.preset_advanced_desc"),
  };
  const labels: Record<Exclude<UiPreset, "custom">, string> = {
    simple: t("newUi.sidebar.userProfile.preset_simple"),
    balanced: t("newUi.sidebar.userProfile.preset_balanced"),
    advanced: t("newUi.sidebar.userProfile.preset_advanced"),
  };

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <SectionCard
        title={t("newUi.sidebar.userProfile.sectionInterface")}
        icon={<SlidersHorizontal className="size-3.5" />}
      >
        <p className="py-2 text-xs leading-snug text-muted-foreground">
          {t("newUi.sidebar.userProfile.interfacePresetDesc")}
        </p>
        <div className="flex flex-col gap-1.5 pb-3">
          {PRESET_IDS.map((id) => {
            const on = current === id;
            return (
              <button
                key={id}
                onClick={() => ctx?.setPreset(id)}
                className={`flex items-start gap-2.5 border px-3 py-2.5 text-left transition-colors ${
                  on
                    ? "border-accent-brand bg-accent-brand/10"
                    : "border-border hover:border-accent-brand/40"
                }`}
              >
                <span
                  className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                    on ? "border-accent-brand" : "border-border"
                  }`}
                >
                  {on && (
                    <span className="size-1.5 rounded-full bg-accent-brand" />
                  )}
                </span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span
                    className={`text-sm font-medium leading-snug ${on ? "text-accent-brand" : ""}`}
                  >
                    {labels[id]}
                  </span>
                  <span className="text-xs leading-snug text-muted-foreground">
                    {hints[id]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        {current === "custom" && (
          <div className="border-t border-border py-2.5 text-xs text-muted-foreground">
            {t("settings.presetCustomNote")}
          </div>
        )}
      </SectionCard>

      {/* Every row below is a real toggle from the app's own user profile,
          with its own copy. Nothing here is invented for the demo. */}
      <SectionCard
        title={t("newUi.sidebar.userProfile.settingsAppRail")}
        icon={<PanelLeft className="size-3.5" />}
      >
        <SettingRow label={p("pinAppRail")} description={p("pinAppRailDesc")}>
          <FakeSwitch
            checked={pinRail}
            onChange={(v) => {
              setRailPreference("pinAppRail", v);
              setPinRail(v);
            }}
          />
        </SettingRow>
        <SettingRow
          label={p("expandAppRailOnHover")}
          description={p("expandAppRailOnHoverDesc")}
        >
          <FakeSwitch
            checked={hoverRail}
            onChange={(v) => {
              setRailPreference("expandAppRailOnHover", v);
              setHoverRail(v);
            }}
          />
        </SettingRow>
        <SettingRow
          label={p("commandPalette")}
          description={p("commandPaletteDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={t("newUi.sidebar.userProfile.uiArea_chrome")}
        icon={<Monitor className="size-3.5" />}
      >
        <SettingRow
          label={p("reopenTabsOnLogin")}
          description={p("reopenTabsOnLoginDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow
          label={p("confirmTabClose")}
          description={p("confirmTabCloseDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={t("newUi.sidebar.userProfile.uiArea_hostList")}
        icon={<Server className="size-3.5" />}
      >
        <SettingRow
          label={p("showHostTags")}
          description={p("showHostTagsDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow
          label={p("compactHostView")}
          description={p("compactHostViewDesc")}
        >
          <FakeSwitch />
        </SettingRow>
        <SettingRow
          label={p("statusColors")}
          description={p("statusColorsDesc")}
        >
          <FakeSwitch />
        </SettingRow>
        <SettingRow
          label={p("hostTrayOnClick")}
          description={p("hostTrayOnClickDesc")}
        >
          <FakeSwitch />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={t("newUi.sidebar.userProfile.uiArea_terminal")}
        icon={<TerminalIcon className="size-3.5" />}
      >
        <SettingRow
          label={p("commandAutocomplete")}
          description={p("commandAutocompleteDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow label={p("localEcho")} description={p("localEchoDesc")}>
          <FakeSwitch />
        </SettingRow>
        <SettingRow
          label={p("historyTracking")}
          description={p("historyTrackingDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow
          label={p("keyboardShortcuts")}
          description={p("keyboardShortcutsDescription")}
        >
          <Button variant="outline" size="sm" className="h-7">
            {p("manageShortcuts")}
          </Button>
        </SettingRow>
      </SectionCard>
    </div>
  );
}

/** Lucide names a plugin may ask for on its settings entry. */

/**
 * A plugin's own settings page, drawn from its manifest.
 *
 * The plugin declares groups and fields; Termix renders them with the same
 * SectionCard and SettingRow everything else uses. That way a plugin cannot
 * ship its own form styling and drift from the rest of the app, and a page
 * disappears cleanly when the plugin is uninstalled.
 */
function PluginSettingsPage({ plugin }: { plugin: DemoPlugin | null }) {
  const { t } = useTranslation();
  const settings = plugin?.contributions?.settings;
  if (!plugin || !settings) return null;

  const running = plugin.state === "enabled";
  const Icon = pluginIcon(settings.icon);

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      {!running && (
        <div className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {t("settings.pluginStoppedNotice", { name: plugin.name })}
        </div>
      )}

      {settings.groups.map((group) => (
        <SectionCard
          key={group.title}
          title={group.title}
          icon={<Icon className="size-3.5" />}
        >
          {group.fields.map((field) => (
            <SettingRow
              key={field.key}
              label={field.label}
              description={field.description}
            >
              {field.type === "switch" ? (
                <FakeSwitch defaultChecked={field.value === true} />
              ) : field.type === "select" ? (
                <ReadonlySelect value={String(field.value ?? "")} />
              ) : field.type === "action" ? (
                <Button variant="outline" size="sm" className="h-7">
                  {field.options?.[0] ??
                    t("newUi.sidebar.connectionDefaults.manage")}
                </Button>
              ) : (
                <span className="flex h-7 w-52 items-center truncate border border-border px-2 font-mono text-[11px] text-muted-foreground">
                  {String(field.value ?? field.placeholder ?? "")}
                </span>
              )}
            </SettingRow>
          ))}
        </SectionCard>
      ))}
    </div>
  );
}

/** Theme, font and language, as the real profile lays them out. */
function AppearanceSection() {
  const { t } = useTranslation();
  const p = (key: string) => t(`newUi.sidebar.userProfile.${key}`);

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <SectionCard
        title={t("newUi.sidebar.userProfile.sectionAppearance")}
        icon={<Palette className="size-3.5" />}
      >
        <SettingRow label={p("themeLabel")}>
          <ReadonlySelect value="Dark" />
        </SettingRow>
        <SettingRow label={p("accentColorLabel")}>
          <span className="flex items-center gap-1.5">
            <span className="size-4 border border-border bg-accent-brand" />
            <span className="font-mono text-[11px] text-muted-foreground">
              #f59145
            </span>
          </span>
        </SettingRow>
        <SettingRow label={p("fontSizeLabel")}>
          <ReadonlySelect value="Medium" />
        </SettingRow>
        <SettingRow
          label={p("interfaceFontLabel")}
          description={p("interfaceFontDescription")}
        >
          <ReadonlySelect value="JetBrains Mono" />
        </SettingRow>
        <SettingRow label={p("languageLabel")}>
          <ReadonlySelect value="English" />
        </SettingRow>
      </SectionCard>
    </div>
  );
}

/** The admin General section, with the instance-wide toggles it really has. */
function AdminSection() {
  const { t } = useTranslation();
  const a = (key: string) => t(`admin.${key}`);

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <SectionCard
        title={a("signInTitle")}
        icon={<Shield className="size-3.5" />}
      >
        <SettingRow
          label={a("allowRegistration")}
          description={a("allowRegistrationDesc")}
        >
          <FakeSwitch />
        </SettingRow>
        <SettingRow
          label={a("allowPasswordLogin")}
          description={a("allowPasswordLoginDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow
          label={a("sessionTimeout")}
          description={a("sessionTimeoutRange")}
        >
          <span className="flex h-7 items-center border border-border px-2 font-mono text-xs text-muted-foreground">
            24h
          </span>
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={a("sessionsAndHistory")}
        icon={<TerminalIcon className="size-3.5" />}
      >
        <SettingRow
          label={a("commandHistoryEnabled")}
          description={a("commandHistoryEnabledDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow
          label={a("sessionSharingGloballyEnabled")}
          description={a("sessionSharingGloballyEnabledDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
      </SectionCard>

      <SectionCard
        title={a("instanceTitle")}
        icon={<SettingsIcon className="size-3.5" />}
      >
        <SettingRow
          label={a("analyticsEnabled")}
          description={a("analyticsEnabledDesc")}
        >
          <FakeSwitch defaultChecked />
        </SettingRow>
        <SettingRow label={a("logLevel")}>
          <ReadonlySelect value="info" />
        </SettingRow>
      </SectionCard>
    </div>
  );
}

/** A select that shows the current value without the demo pretending to save. */
function ReadonlySelect({ value }: { value: string }) {
  return (
    <span className="flex h-7 items-center gap-2 border border-border px-2 text-xs text-muted-foreground">
      {value}
      <ChevronDown className="size-3 opacity-50" />
    </span>
  );
}

const PLACEHOLDER: Record<
  string,
  { icon: LucideIcon; title: string; hint: string }
> = {
  account: {
    icon: User,
    title: "Account",
    hint: "Username, role, sign-in method and password.",
  },
  appearance: {
    icon: Palette,
    title: "Appearance",
    hint: "Theme, accent color, interface font and language.",
  },
  security: {
    icon: KeyRound,
    title: "Security",
    hint: "Two-factor, passkeys, active sessions and API keys.",
  },
  data: {
    icon: Database,
    title: "Data",
    hint: "Export and import your hosts, credentials and layouts.",
  },
  alerts: {
    icon: Bell,
    title: "Alerts",
    hint: "Rules, notification channels and what has fired recently.",
  },
  admin: {
    icon: SettingsIcon,
    title: "Admin",
    hint: "Users, roles, single sign-on, audit log, SSL and branding.",
  },
};

function PlaceholderSection({ id }: { id: string }) {
  const meta = PLACEHOLDER[id];
  if (!meta) return null;
  return (
    <div className={`flex min-h-full flex-col ${PANEL.body}`}>
      <GroupHeading title={meta.title} className="mb-2" />
      <DemoPanel
        icon={meta.icon}
        emptyTitle={meta.title}
        emptyHint={meta.hint}
      />
    </div>
  );
}
