import {
  ChevronUp,
  LogOut,
  Palette,
  Puzzle,
  Search,
  Settings,
  ShieldCheck,
  User2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
  Kbd,
  useChooseTheme,
  useShellController,
  useTheme,
  useThemeOptions,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

/** The sidebar footer: who is signed in, and where their pages are. */
export function UserMenu() {
  const { t } = useTranslation();
  const shell = useShellController();
  const { tabs } = shell;
  const { theme } = useTheme();
  const chooseTheme = useChooseTheme();
  const themes = useThemeOptions();
  const openSettings = (section?: string) =>
    tabs.openSingleton(
      "settings",
      undefined,
      undefined,
      section ? { section } : undefined,
    );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center gap-2 rounded-[0.5rem] px-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted"
        >
          <User2 className="size-4 shrink-0" />
          <span className="min-w-0 flex-1 truncate text-left">
            {shell.username || t("original.account")}
          </span>
          <ChevronUp className="size-4 shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="start"
        sideOffset={6}
        className="min-w-[var(--radix-popper-anchor-width)]"
      >
        <DropdownMenuItem onSelect={() => openSettings("account")}>
          <User2 className="size-3.5" />
          {t("original.profile")}
        </DropdownMenuItem>
        {shell.isAdmin && (
          <DropdownMenuItem onSelect={() => openSettings("admin-general")}>
            <ShieldCheck className="size-3.5" />
            {t("original.adminSettings")}
          </DropdownMenuItem>
        )}
        {shell.isAdmin && (
          <DropdownMenuItem onSelect={() => tabs.openSingleton("plugins")}>
            <Puzzle className="size-3.5" />
            {t("original.plugins")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={() => openSettings()}>
          <Settings className="size-3.5" />
          {t("original.settings")}
        </DropdownMenuItem>
        {themes.length > 1 && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette className="size-3.5" />
              {t("nav.theme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48">
              <DropdownMenuRadioGroup
                value={theme}
                onValueChange={(id) => chooseTheme(id as typeof theme)}
              >
                {themes.map((option) => (
                  <DropdownMenuRadioItem key={option.id} value={option.id}>
                    {option.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        <DropdownMenuItem onSelect={shell.palette.open}>
          <Search className="size-3.5" />
          {t("original.commandPalette")}
          <Kbd className="ml-auto">Ctrl K</Kbd>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => shell.logout({ manual: true })}>
          <LogOut className="size-3.5" />
          {t("original.logout")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
