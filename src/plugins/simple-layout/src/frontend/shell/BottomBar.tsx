import { useState } from "react";
import { Layers, MoreHorizontal, X } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  railItemLabel,
  tabIcon,
  useShellController,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { NAV_BUTTONS, tabTitle, useMoreItems } from "./nav";

/** The phone navigation: four buttons, and a sheet for open tabs and plugin tools. */
export function BottomBar() {
  const { t } = useTranslation();
  const shell = useShellController();
  const more = useMoreItems();
  const [open, setOpen] = useState(false);
  const { tabs } = shell;

  const go = (id: (typeof NAV_BUTTONS)[number]["id"]) => {
    if (id === "home") tabs.openSingleton("dashboard");
    else if (id === "hosts") tabs.openSingleton("host-manager");
    else if (id === "settings") tabs.openSingleton("settings");
    else shell.palette.open();
  };

  const activeType = tabs.active?.type;
  const isActive = (id: string) =>
    (id === "home" && activeType === "dashboard") ||
    (id === "hosts" && activeType === "host-manager") ||
    (id === "settings" && activeType === "settings");

  const button =
    "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px]";

  return (
    <>
      <nav className="flex shrink-0 border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
        {NAV_BUTTONS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`${button} ${isActive(item.id) ? "text-accent-brand" : "text-muted-foreground"}`}
            onClick={() => go(item.id)}
          >
            <item.icon className="size-5" />
            {t(item.labelKey)}
          </button>
        ))}
        <button
          type="button"
          className={`${button} text-muted-foreground`}
          onClick={() => setOpen(true)}
        >
          <Layers className="size-5" />
          {t("nav.tabs")}
        </button>
      </nav>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="max-h-[80dvh] gap-0 p-0">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{t("nav.tabs")}</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col overflow-y-auto">
            {tabs.topLevel.map((tab) => (
              <div
                key={tab.id}
                className={`flex items-center border-b border-border ${tab.id === tabs.activeId ? "bg-muted/50" : ""}`}
              >
                <button
                  type="button"
                  className="flex flex-1 items-center gap-2 px-4 py-3 text-sm text-left min-w-0"
                  onClick={() => {
                    tabs.setActive(tab.id);
                    setOpen(false);
                  }}
                >
                  {tabIcon(tab.type)}
                  <span className="truncate">{tabTitle(tab, t)}</span>
                </button>
                {tab.type !== "dashboard" && (
                  <button
                    type="button"
                    className="p-3 text-muted-foreground"
                    aria-label={t("nav.closeTab")}
                    onClick={() => void tabs.close(tab.id)}
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            ))}
            {more.length > 0 && (
              <div className="px-4 pt-3 pb-1 text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MoreHorizontal className="size-3.5" />
                {t("nav.more")}
              </div>
            )}
            {more.map((item) => (
              <button
                key={item.id}
                type="button"
                className="flex items-center gap-2 px-4 py-3 text-sm text-left border-b border-border"
                onClick={() => {
                  tabs.openSingleton(item.id);
                  setOpen(false);
                }}
              >
                <item.icon className="size-4" />
                {railItemLabel(item.id, t)}
              </button>
            ))}
            <button
              type="button"
              className="px-4 py-3 text-sm text-left text-muted-foreground"
              onClick={() => shell.logout({ manual: true })}
            >
              {t("nav.logout")}
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
