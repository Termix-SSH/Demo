import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { LayoutPanelLeft, X } from "lucide-react";
import { PANE_COUNTS, SPLIT_MODES } from "@/ui/data";
import { tabIcon } from "@/ui/tabUtils";
import type { Tab, SplitMode } from "@/ui/types";

const LAYOUT_PREVIEWS: Record<SplitMode, React.ReactNode> = {
  "none": (
    <div className="size-full border-2 border-current"/>
  ),
  "2-way": (
    <div className="flex gap-0.5 size-full">
      <div className="flex-1 border-2 border-current"/>
      <div className="flex-1 border-2 border-current"/>
    </div>
  ),
  "3-way": (
    <div className="flex gap-0.5 size-full">
      <div className="flex-1 border-2 border-current"/>
      <div className="flex flex-col flex-1 gap-0.5">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
      </div>
    </div>
  ),
  "4-way": (
    <div className="grid grid-cols-2 grid-rows-2 gap-0.5 size-full">
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
    </div>
  ),
  "5-way": (
    <div className="flex flex-col gap-0.5 size-full">
      <div className="flex gap-0.5 flex-1">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-1 border-2 border-current"/>
      </div>
      <div className="flex gap-0.5 flex-1">
        <div className="flex-1 border-2 border-current"/>
        <div className="flex-[2] border-2 border-current"/>
      </div>
    </div>
  ),
  "6-way": (
    <div className="grid grid-cols-3 grid-rows-2 gap-0.5 size-full">
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
      <div className="border-2 border-current"/>
    </div>
  ),
};

export function SplitScreenPanel({ tabs, splitMode, setSplitMode, paneTabIds, setPaneTabIds }: {
  tabs: Tab[];
  splitMode: SplitMode;
  setSplitMode: (m: SplitMode) => void;
  paneTabIds: (string | null)[];
  setPaneTabIds: (ids: (string | null)[]) => void;
}) {
  const paneCount = PANE_COUNTS[splitMode];
  const [draggingTabId, setDraggingTabId] = useState<string | null>(null);
  const [dragOverPane, setDragOverPane] = useState<number | null>(null);

  function handleDrop(paneIndex: number) {
    if (draggingTabId === null) return;
    const next = [...paneTabIds];
    next[paneIndex] = draggingTabId;
    setPaneTabIds(next);
    setDraggingTabId(null);
    setDragOverPane(null);
  }

  function clearPane(paneIndex: number) {
    const next = [...paneTabIds];
    next[paneIndex] = null;
    setPaneTabIds(next);
  }

  function resetAll() {
    setSplitMode("none");
    setPaneTabIds(Array(6).fill(null));
  }

  const activeCount = paneTabIds.slice(0, Math.max(paneCount, 0)).filter(Boolean).length;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Layout</span>
          {splitMode !== "none" && (
            <span className="text-xs border border-accent-brand/40 text-accent-brand px-1.5 py-0.5 leading-tight">
              {splitMode}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SPLIT_MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setSplitMode(mode.id)}
              className={`flex flex-col items-center gap-1.5 p-2 border transition-colors ${
                splitMode === mode.id
                  ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground/50"
              }`}
            >
              <div className={`w-10 h-7 ${splitMode === mode.id ? "text-accent-brand" : "text-muted-foreground/40"}`}>
                {LAYOUT_PREVIEWS[mode.id]}
              </div>
              <span className="text-xs font-semibold">{mode.label}</span>
            </button>
          ))}
        </div>
      </div>

      {splitMode === "none" ? (
        <div className="flex flex-col items-center justify-center gap-2 py-6 text-center border border-dashed border-border">
          <LayoutPanelLeft className="size-8 text-muted-foreground/30"/>
          <span className="text-sm text-muted-foreground">Select a layout above</span>
          <span className="text-xs text-muted-foreground/60">Choose how many panes to display</span>
        </div>
      ) : (
        <>
          <Separator/>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Panes</span>
              <span className="text-xs text-muted-foreground">{activeCount}/{paneCount} assigned</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {Array.from({ length: paneCount }).map((_, i) => {
                const assignedId = paneTabIds[i];
                const assignedTab = assignedId ? tabs.find(t => t.id === assignedId) : null;
                const isOver = dragOverPane === i;
                return (
                  <div
                    key={i}
                    onDragOver={e => { e.preventDefault(); setDragOverPane(i); }}
                    onDragLeave={() => setDragOverPane(null)}
                    onDrop={() => handleDrop(i)}
                    className={`relative flex flex-col items-center justify-center gap-1 p-2 min-h-[52px] border transition-colors ${
                      isOver
                        ? "border-accent-brand bg-accent-brand/10"
                        : assignedTab
                          ? "border-border bg-muted/20"
                          : "border-dashed border-border/60 bg-muted/5 hover:border-border hover:bg-muted/10"
                    }`}
                  >
                    <span className="absolute top-1 left-1.5 text-[10px] text-muted-foreground/40 font-mono leading-none">{i + 1}</span>
                    {assignedTab ? (
                      <>
                        <div className="flex items-center gap-1 px-1 w-full justify-center">
                          <span className="text-muted-foreground shrink-0">{tabIcon(assignedTab.type)}</span>
                          <span className="text-xs font-semibold truncate max-w-[70px]">
                            {assignedTab.type === "dashboard" ? "Dashboard" : assignedTab.label}
                          </span>
                        </div>
                        <button
                          onClick={() => clearPane(i)}
                          className="absolute top-0.5 right-0.5 size-4 flex items-center justify-center text-muted-foreground hover:text-foreground"
                        >
                          <X className="size-2.5"/>
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground/40">
                        {isOver ? "Drop here" : "Empty"}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <Separator/>

          <div className="flex flex-col gap-2">
            <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Open Tabs</span>
            <span className="text-xs text-muted-foreground/60">Drag tabs into panes above</span>
            <div className="flex flex-col gap-1 mt-0.5">
              {tabs.map(tab => (
                <div
                  key={tab.id}
                  draggable
                  onDragStart={() => setDraggingTabId(tab.id)}
                  onDragEnd={() => { setDraggingTabId(null); setDragOverPane(null); }}
                  className={`flex items-center gap-2 px-2.5 py-2 border cursor-grab active:cursor-grabbing select-none transition-colors ${
                    draggingTabId === tab.id
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                  }`}
                >
                  <span className="text-muted-foreground shrink-0">{tabIcon(tab.type)}</span>
                  <span className="text-xs font-medium flex-1 truncate">
                    {tab.type === "dashboard" ? "Dashboard" : tab.label}
                  </span>
                  <div className="grid grid-cols-2 gap-px opacity-30 shrink-0">
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                    <div className="size-1 bg-muted-foreground rounded-full"/>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="w-full text-xs text-muted-foreground"
            onClick={resetAll}
          >
            <X className="size-3"/>
            Clear Split Screen
          </Button>
        </>
      )}
    </div>
  );
}
