import {
  LogOut,
  Palette,
  Plug,
  Puzzle,
  Search,
  Server,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Kbd,
  railItemLabel,
  tabIcon,
  useBranding,
  useShellController,
  type Tab,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { tabTitle, useMoreItems } from "./nav";

/** The desktop bar: brand, open tabs, and the few buttons that matter. */
export function TopBar() {
  const { t } = useTranslation();
  const shell = useShellController();
  const branding = useBranding();
  const more = useMoreItems();
  const { tabs } = shell;
  const hasHome = tabs.topLevel.some((tab) => tab.type === "dashboard");

  // On a phone the bottom bar does the navigation, so this only names the tab.
  if (shell.isMobile && !shell.isElectron) {
    return (
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-border bg-card px-3 text-sm font-medium">
        {branding.logo ? (
          <img src={branding.logo} alt="" className="size-5 object-contain" />
        ) : null}
        <span className="truncate">
          {tabs.active ? tabTitle(tabs.active, t) : branding.appName}
        </span>
      </header>
    );
  }

  return (
    <header className="flex items-stretch h-10 shrink-0 border-b border-border bg-card">
      <button
        type="button"
        className="flex items-center gap-2 px-3 border-r border-border text-sm font-medium"
        onClick={() => tabs.openSingleton("dashboard")}
        title={t("nav.home")}
      >
        {branding.logo ? (
          <img src={branding.logo} alt="" className="size-5 object-contain" />
        ) : null}
        <span className="truncate max-w-40">{branding.appName}</span>
      </button>

      <nav
        className="flex items-stretch flex-1 min-w-0 overflow-x-auto"
        aria-label={t("nav.tabs")}
      >
        {!hasHome && (
          <TabButton
            active={false}
            title={t("nav.home")}
            icon={tabIcon("dashboard")}
            onClick={() => tabs.openSingleton("dashboard")}
          />
        )}
        {tabs.topLevel.map((tab) => (
          <TabButton
            key={tab.id}
            active={tab.id === tabs.activeId}
            title={tabTitle(tab, t)}
            icon={tabIcon(tab.type)}
            onClick={() => tabs.setActive(tab.id)}
            onClose={
              tab.type === "dashboard"
                ? undefined
                : () => void tabs.close(tab.id)
            }
            closeLabel={t("nav.closeTab")}
          />
        ))}
      </nav>

      <div className="flex items-center gap-1 px-2 border-l border-border">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => tabs.openSingleton("host-manager")}
        >
          <Server className="size-3.5" />
          {t("nav.hosts")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-2 text-muted-foreground"
          onClick={shell.palette.open}
        >
          <Search className="size-3.5" />
          {t("nav.search")}
          <Kbd>Ctrl K</Kbd>
        </Button>

        {more.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
                <Plug className="size-3.5" />
                {t("nav.more")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              {more.map((item) => (
                <DropdownMenuItem
                  key={item.id}
                  onSelect={() => tabs.openSingleton(item.id)}
                >
                  <item.icon className="size-3.5" />
                  {railItemLabel(item.id, t)}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="ghost"
          size="icon-sm"
          className="size-7"
          aria-label={t("nav.settings")}
          title={t("nav.settings")}
          onClick={() => tabs.openSingleton("settings")}
        >
          <Settings className="size-4" />
        </Button>

        <AccountMenu />
      </div>
    </header>
  );
}

function TabButton({
  active,
  title,
  icon,
  onClick,
  onClose,
  closeLabel,
}: {
  active: boolean;
  title: string;
  icon: React.ReactNode;
  onClick: () => void;
  onClose?: () => void;
  closeLabel?: string;
}) {
  return (
    <div
      // Middle click closes, like a browser tab. Mousedown is stopped so it does not autoscroll.
      onMouseDown={(e) => {
        if (e.button === 1 && onClose) e.preventDefault();
      }}
      onAuxClick={(e) => {
        if (e.button !== 1 || !onClose) return;
        e.preventDefault();
        onClose();
      }}
      className={`group flex items-center gap-1.5 pl-3 pr-1.5 border-r border-border text-sm shrink-0 max-w-56 ${
        active
          ? "bg-background text-foreground border-b-2 border-b-accent-brand"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
      }`}
    >
      <button
        type="button"
        className="flex items-center gap-1.5 min-w-0 h-full"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
      >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{title}</span>
      </button>
      {onClose ? (
        <button
          type="button"
          className="p-0.5 opacity-60 hover:opacity-100 hover:bg-muted"
          onClick={onClose}
          aria-label={closeLabel}
        >
          <X className="size-3" />
        </button>
      ) : (
        <span className="w-1.5" />
      )}
    </div>
  );
}

function AccountMenu() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs } = shell;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5">
          <UserRound className="size-3.5" />
          {shell.username}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel>{shell.username}</DropdownMenuLabel>
        <DropdownMenuItem
          onSelect={() =>
            tabs.openSingleton("settings", undefined, undefined, {
              section: "appearance",
            })
          }
        >
          <Palette className="size-3.5" />
          {t("nav.appearance")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => tabs.openSingleton("settings")}>
          <Settings className="size-3.5" />
          {t("nav.settings")}
        </DropdownMenuItem>
        {shell.isAdmin && (
          <DropdownMenuItem onSelect={() => tabs.openSingleton("plugins")}>
            <Puzzle className="size-3.5" />
            {t("nav.plugins")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => shell.logout({ manual: true })}>
          <LogOut className="size-3.5" />
          {t("nav.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
