import { useEffect, useMemo, useState } from "react";
import { Palette, Puzzle, UserRound } from "lucide-react";
import {
  AuthEnrollmentSections,
  Button,
  LookSettings,
  PluginIcon,
  hasVisibleFields,
  pluginName,
  useInstalledPlugins,
  useShellController,
  type PluginSummary,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { PluginSettingsForm } from "./PluginSettingsForm";

interface Page {
  id: string;
  label: string;
  icon: React.ReactNode;
}

/** Plugins with settings this user can change, by name. */
function usePluginPages(isAdmin: boolean): PluginSummary[] {
  const plugins = useInstalledPlugins();
  return useMemo(
    () =>
      plugins
        .filter((plugin) => {
          if (!plugin.enabled) return false;
          const settings = plugin.contributes?.settings;
          return (
            hasVisibleFields(settings?.user ?? []) ||
            (isAdmin && hasVisibleFields(settings?.admin ?? []))
          );
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
    [plugins, isAdmin],
  );
}

/** Settings with only what most people need: look, account, and plugin settings. */
export function SettingsTab({ section }: { section?: string }) {
  const { t } = useTranslation();
  const shell = useShellController();
  const pluginPages = usePluginPages(shell.isAdmin);

  const pages: Page[] = [
    {
      id: "appearance",
      label: t("settings.appearance"),
      icon: <Palette className="size-3.5" />,
    },
    {
      id: "account",
      label: t("settings.account"),
      icon: <UserRound className="size-3.5" />,
    },
    ...pluginPages.map((plugin) => ({
      id: `feature:${plugin.id}`,
      label: pluginName(t, plugin),
      icon: <PluginIcon name={plugin.icon} className="size-3.5" />,
    })),
  ];

  const [active, setActive] = useState(section ?? "appearance");
  useEffect(() => {
    if (section) setActive(section);
  }, [section]);

  // A link to a page this layout does not have lands on Appearance.
  const current = pages.find((page) => page.id === active) ?? pages[0];
  const plugin = current.id.startsWith("feature:")
    ? pluginPages.find((p) => `feature:${p.id}` === current.id)
    : undefined;

  return (
    <div className="flex flex-1 min-h-0 flex-col md:flex-row">
      <nav
        className="flex md:flex-col gap-0.5 overflow-x-auto md:overflow-y-auto border-b md:border-b-0 md:border-r border-border p-2 md:w-52 shrink-0"
        aria-label={t("settings.title")}
      >
        {pages.map((page) => (
          <button
            key={page.id}
            type="button"
            onClick={() => setActive(page.id)}
            className={`flex items-center gap-2 px-3 py-2 text-sm text-left whitespace-nowrap ${
              page.id === current.id
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {page.icon}
            {page.label}
          </button>
        ))}
        {shell.isAdmin && (
          <button
            type="button"
            onClick={() => shell.tabs.openSingleton("plugins")}
            className="flex items-center gap-2 px-3 py-2 text-sm text-left whitespace-nowrap text-muted-foreground hover:bg-muted/50 hover:text-foreground md:mt-2 md:border-t md:border-border"
          >
            <Puzzle className="size-3.5" />
            {t("settings.managePlugins")}
          </button>
        )}
      </nav>

      <div className="flex-1 min-w-0 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 md:p-6">
          <h1 className="text-base font-semibold">{current.label}</h1>

          {current.id === "appearance" && (
            <LookSettings isAdmin={shell.isAdmin} />
          )}

          {current.id === "account" && (
            <>
              <div className="flex items-center justify-between border border-border p-3">
                <div className="text-sm">
                  <div className="font-medium">{shell.username}</div>
                  <div className="text-xs text-muted-foreground">
                    {shell.isAdmin
                      ? t("settings.roleAdmin")
                      : t("settings.roleUser")}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => shell.logout({ manual: true })}
                >
                  {t("nav.logout")}
                </Button>
              </div>
              <AuthEnrollmentSections />
            </>
          )}

          {plugin && (
            <>
              {hasVisibleFields(plugin.contributes?.settings?.user ?? []) && (
                <PluginSettingsForm
                  plugin={plugin}
                  scope="user"
                  fields={plugin.contributes?.settings?.user ?? []}
                />
              )}
              {shell.isAdmin &&
                hasVisibleFields(plugin.contributes?.settings?.admin ?? []) && (
                  <>
                    <h2 className="pt-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("settings.forAdmins")}
                    </h2>
                    <PluginSettingsForm
                      plugin={plugin}
                      scope="admin"
                      fields={plugin.contributes?.settings?.admin ?? []}
                    />
                  </>
                )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
