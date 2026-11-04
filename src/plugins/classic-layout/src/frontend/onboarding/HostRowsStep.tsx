import { useMemo, type ComponentType } from "react";
import {
  LayoutDashboard,
  Rows3,
  Server,
  SquareMousePointer,
} from "lucide-react";
import {
  usePluginUiPreferences,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { listHostActions, useHostActions } from "@termix-ssh/plugin-sdk/ui";
import { useHostSidebarPreferences } from "../sidebar/tree/hooks/useHostSidebarPreferences";
import { HOST_PAGE_TAB, hostToolsMode } from "../sidebar/tree/host-bar-actions";

/** The host page's own row button, from Operations Center. */
const HOST_PAGE_ACTION = "host-page";

export type HostRowsChoice = "buttons" | "both" | "page";

const CHOICES: HostRowsChoice[] = ["buttons", "both", "page"];
const ICONS = {
  buttons: Rows3,
  both: SquareMousePointer,
  page: LayoutDashboard,
} as const;

/** Whether some plugin offers a host page, so the choice means something. */
export function hostPageAvailable(): boolean {
  try {
    return listHostActions().some((action) => action.tabType === HOST_PAGE_TAB);
  } catch {
    return false;
  }
}

/** The saved settings each choice stands for. */
export function choiceSettings(choice: HostRowsChoice): {
  hostTools: "page" | "only" | null;
  showPageButton: boolean;
} {
  if (choice === "page") return { hostTools: "only", showPageButton: false };
  if (choice === "both") return { hostTools: "page", showPageButton: true };
  return { hostTools: null, showPageButton: false };
}

/** Which choice the saved settings match. */
export function currentChoice(
  hostTools: unknown,
  barActions: Record<string, boolean>,
): HostRowsChoice {
  const mode = hostToolsMode(hostTools);
  if (mode === "only") return "page";
  if (mode === "page" || barActions[HOST_PAGE_ACTION] === true) return "both";
  return "buttons";
}

type Icon = ComponentType<{ className?: string }>;

/** A drawn host row, with the user's real connect and tool icons. */
function RowPreview({
  icons,
  pageButton,
  clickOpensPage,
}: {
  icons: Icon[];
  pageButton: boolean;
  clickOpensPage: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-1 border border-border/60 bg-background/60 p-1.5">
      {[0, 1].map((row) => (
        <div key={row} className="flex h-6 items-center gap-1.5 px-1">
          <Server className="size-3 shrink-0 text-muted-foreground" />
          <div className="h-[3px] w-10 shrink-0 bg-muted-foreground/40" />
          <div className="ml-auto flex min-w-0 items-center gap-1 overflow-hidden">
            {icons.map((Icon, index) => (
              <Icon
                key={index}
                className="size-3 shrink-0 text-muted-foreground"
              />
            ))}
            {pageButton && (
              <LayoutDashboard className="size-3 shrink-0 text-accent-brand" />
            )}
          </div>
        </div>
      ))}
      {clickOpensPage && (
        <span className="px-1 text-[9px] text-accent-brand">
          {t("onboarding.hostRows.clickOpensPage")}
        </span>
      )}
    </div>
  );
}

export function HostRowsStep() {
  const { t } = useTranslation();
  const layoutPrefs = usePluginUiPreferences<{ hostTools?: string }>();
  const { preferences, update } = useHostSidebarPreferences();
  const all = useHostActions();
  const barActions = preferences.display.barActions ?? {};
  const selected = currentChoice(layoutPrefs.values.hostTools, barActions);

  // What a host row carries today, so the size of a full row is plain to see.
  const icons = useMemo(
    () =>
      all
        .filter(
          (action) =>
            (action.kind === "connect" || action.kind === "open") &&
            action.tabType !== HOST_PAGE_TAB &&
            action.tray !== false,
        )
        .map((action) => action.icon as Icon)
        .filter(Boolean)
        .slice(0, 12),
    [all],
  );

  const pick = (choice: HostRowsChoice) => {
    const next = choiceSettings(choice);
    layoutPrefs.set("hostTools", next.hostTools);
    update((prev) => ({
      ...prev,
      display: {
        ...prev.display,
        barActions: {
          ...prev.display.barActions,
          [HOST_PAGE_ACTION]: next.showPageButton,
        },
      },
    }));
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        {t("onboarding.hostRows.intro")}
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {CHOICES.map((choice) => {
          const Icon = ICONS[choice];
          const active = selected === choice;
          return (
            <button
              key={choice}
              type="button"
              aria-pressed={active}
              onClick={() => pick(choice)}
              className={`flex flex-col gap-2 border p-2.5 text-left transition-colors ${
                active
                  ? "border-accent-brand bg-accent-brand/10"
                  : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Icon
                  className={`size-3.5 ${active ? "text-accent-brand" : "text-muted-foreground"}`}
                />
                {t(`onboarding.hostRows.${choice}`)}
              </span>
              <RowPreview
                icons={choice === "page" ? [] : icons}
                pageButton={choice === "both"}
                clickOpensPage={choice === "page"}
              />
              <span className="text-[10px] leading-snug text-muted-foreground">
                {t(`onboarding.hostRows.${choice}Desc`)}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/70">
        {t("onboarding.hostRows.changeLater")}
      </p>
    </div>
  );
}
