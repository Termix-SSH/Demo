import { LayoutPanelLeft, X } from "lucide-react";
import { Button } from "@/components/button";
import { GroupHeading, PANEL, PanelShell } from "@/components/panel-layout";
import { Kbd } from "@/components/kbd";
import { PANE_COUNTS, SPLIT_MODES } from "@/lib/theme";
import type { SplitMode, Tab } from "@/types/ui-types";

/**
 * Mirrors the real SplitScreenPanel: pick a layout, then say which tab goes in
 * which pane.
 *
 * Unlike the other panels this one drives live state rather than a fixture --
 * the split view is already built in shell/SplitView, it just had no way in
 * from the rail except a placeholder.
 */
export function DemoSplitScreen({
  chrome = true,
  splitMode = "none",
  onSplitMode,
  tabs = [],
  paneTabIds = [],
  onAssignPane,
  onClearPane,
}: {
  chrome?: boolean;
  splitMode?: SplitMode;
  onSplitMode?: (mode: SplitMode) => void;
  tabs?: Tab[];
  paneTabIds?: (string | null)[];
  onAssignPane?: (pane: number, tabId: string) => void;
  onClearPane?: (tabId: string) => void;
}) {
  const paneCount = PANE_COUNTS[splitMode];

  return (
    <PanelShell
      chrome={chrome}
      icon={<LayoutPanelLeft className="size-4" />}
      title="Split screen"
      status={splitMode === "none" ? "Off" : `${paneCount} panes`}
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      <GroupHeading title="Layout" />
      <div className="grid grid-cols-2 gap-1.5">
        {SPLIT_MODES.map((mode) => {
          const active = mode.id === splitMode;
          return (
            <button
              key={mode.id}
              type="button"
              onClick={() => onSplitMode?.(mode.id)}
              className={`border px-2 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                  : "border-border text-muted-foreground hover:bg-muted/40 hover:text-foreground"
              }`}
            >
              {mode.label}
            </button>
          );
        })}
      </div>

      {paneCount > 0 && (
        <>
          <GroupHeading title="Panes" count={paneCount} />
          {Array.from({ length: paneCount }).map((_, pane) => {
            const assignedId = paneTabIds[pane];
            const assigned = tabs.find((tab) => tab.id === assignedId);
            return (
              <div
                key={pane}
                className="flex flex-col gap-1.5 border border-border px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Pane {pane + 1}
                  </span>
                  {assigned && (
                    <>
                      <span className="ml-auto min-w-0 truncate text-xs font-medium">
                        {assigned.customLabel || assigned.label}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        title="Empty this pane"
                        onClick={() => onClearPane?.(assigned.id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <X className="size-3" />
                      </Button>
                    </>
                  )}
                </div>

                {!assigned && (
                  <div className="flex flex-wrap gap-1">
                    {tabs.length === 0 ? (
                      <span className="text-[11px] text-muted-foreground">
                        Open a tab to put something here.
                      </span>
                    ) : (
                      tabs.map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => onAssignPane?.(pane, tab.id)}
                          className="max-w-full truncate border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-accent-brand/40 hover:text-accent-brand"
                        >
                          {tab.customLabel || tab.label}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}

      <GroupHeading title="Shortcuts" />
      <div className="flex flex-col gap-1">
        {[
          { keys: ["Ctrl", "Shift", "\\"], label: "Split right" },
          { keys: ["Ctrl", "Shift", "-"], label: "Split below" },
          { keys: ["Ctrl", "]"], label: "Next tab" },
          { keys: ["Ctrl", "["], label: "Previous tab" },
        ].map(({ keys, label }) => (
          <div key={label} className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">{label}</span>
            <span className="ml-auto flex shrink-0 items-center gap-0.5">
              {keys.map((key) => (
                <Kbd key={key}>{key}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </PanelShell>
  );
}
