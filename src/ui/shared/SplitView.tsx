import { useState, useRef, useEffect } from "react";
import { splitDragState, notifyDragEnd } from "@/ui/utils/splitDragging";
import { renderTabContent, tabIcon } from "@/ui/utils/tabUtils";
import type { Tab, TabType, Host, SplitMode } from "@/ui/utils/types";

// ─── Types ────────────────────────────────────────────────────────────────────

type RowColSizes = number[][];

// ─── useSplitSizes ────────────────────────────────────────────────────────────

function defaultSizes(mode: SplitMode): { rowSizes: number[]; rowColSizes: RowColSizes } {
  switch (mode) {
    case "2-way":  return { rowSizes: [100],      rowColSizes: [[50, 50]] };
    case "3-way":  return { rowSizes: [50, 50],   rowColSizes: [[50, 50], [100]] };
    case "4-way":  return { rowSizes: [50, 50],   rowColSizes: [[50, 50], [50, 50]] };
    case "5-way":  return { rowSizes: [50, 50],   rowColSizes: [[33.3, 33.3, 33.4], [33.3, 66.7]] };
    case "6-way":  return { rowSizes: [50, 50],   rowColSizes: [[33.3, 33.3, 33.4], [33.3, 33.3, 33.4]] };
    default:       return { rowSizes: [100],      rowColSizes: [[100]] };
  }
}

function useSplitSizes(splitMode: SplitMode) {
  const init = defaultSizes(splitMode);
  const [rowSizes, setRowSizes] = useState(init.rowSizes);
  const [rowColSizes, setRowColSizes] = useState<RowColSizes>(init.rowColSizes);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const d = defaultSizes(splitMode);
    setRowSizes(d.rowSizes);
    setRowColSizes(d.rowColSizes);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [splitMode]);

  function reset() {
    const d = defaultSizes(splitMode);
    setRowSizes(d.rowSizes);
    setRowColSizes(d.rowColSizes);
  }

  function startDrag() {
    splitDragState.active = true;
    setIsDragging(true);
  }

  function endDrag() {
    splitDragState.active = false;
    setIsDragging(false);
    notifyDragEnd();
  }

  function onRowDivider(e: React.MouseEvent, rowIdx: number) {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    startDrag();
    const totalH = container.getBoundingClientRect().height;
    const startY = e.clientY;
    const a = rowSizes[rowIdx];
    const b = rowSizes[rowIdx + 1];
    function onMove(ev: MouseEvent) {
      const delta = ((ev.clientY - startY) / totalH) * 100;
      const na = Math.max(10, Math.min(a + b - 10, a + delta));
      setRowSizes(prev => { const n = [...prev]; n[rowIdx] = na; n[rowIdx + 1] = a + b - na; return n; });
    }
    function onUp() {
      endDrag();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function onColDivider(e: React.MouseEvent, rowIdx: number, colIdx: number) {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    startDrag();
    const totalW = container.getBoundingClientRect().width;
    const startX = e.clientX;
    const cols = rowColSizes[rowIdx];
    const a = cols[colIdx];
    const b = cols[colIdx + 1];
    function onMove(ev: MouseEvent) {
      const delta = ((ev.clientX - startX) / totalW) * 100;
      const na = Math.max(10, Math.min(a + b - 10, a + delta));
      setRowColSizes(prev => {
        const next = prev.map(r => [...r]);
        next[rowIdx][colIdx] = na;
        next[rowIdx][colIdx + 1] = a + b - na;
        return next;
      });
    }
    function onUp() {
      endDrag();
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  return { rowSizes, rowColSizes, isDragging, containerRef, reset, onRowDivider, onColDivider };
}

// ─── Dividers ─────────────────────────────────────────────────────────────────

function ColDivider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="w-1 shrink-0 cursor-col-resize bg-border hover:bg-accent-brand/60 transition-colors z-10"
    />
  );
}

function RowDivider({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div
      onMouseDown={onMouseDown}
      className="h-1 w-full shrink-0 cursor-row-resize bg-border hover:bg-accent-brand/60 transition-colors z-10"
    />
  );
}

// ─── Pane ─────────────────────────────────────────────────────────────────────

function PaneHeader({ tab, paneIndex }: { tab: Tab | null; paneIndex: number }) {
  return (
    <div className="flex items-center gap-1.5 px-2.5 h-7 shrink-0 bg-sidebar border-b border-border text-xs font-medium text-muted-foreground select-none">
      {tab ? (
        <>
          <span className="opacity-60">{tabIcon(tab.type)}</span>
          <span className="truncate text-foreground">{tab.type === "dashboard" ? "Dashboard" : tab.label}</span>
        </>
      ) : (
        <span className="opacity-40">Pane {paneIndex + 1} — empty</span>
      )}
    </div>
  );
}

function EmptyPane() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-full gap-2 text-muted-foreground/30 bg-background">
      <div className="grid grid-cols-2 gap-1">
        <div className="size-5 border-2 border-current rounded-sm"/>
        <div className="size-5 border-2 border-current rounded-sm"/>
        <div className="size-5 border-2 border-current rounded-sm"/>
        <div className="size-5 border-2 border-current rounded-sm"/>
      </div>
      <span className="text-xs">No tab assigned</span>
    </div>
  );
}

function Pane({ tab, paneIndex, isDragging, onOpenSingletonTab, onOpenTab }: {
  tab: Tab | null;
  paneIndex: number;
  isDragging: boolean;
  onOpenSingletonTab: (type: TabType) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  return (
    <div className="relative flex flex-col w-full h-full min-w-0 min-h-0 overflow-hidden">
      <PaneHeader tab={tab} paneIndex={paneIndex}/>
      <div className="flex-1 min-h-0 overflow-hidden">
        {tab ? renderTabContent(tab, onOpenSingletonTab, onOpenTab) : <EmptyPane/>}
      </div>
      {isDragging && (
        <div className="absolute inset-0 z-10" style={{ cursor: "inherit" }}/>
      )}
    </div>
  );
}

// ─── SplitView ────────────────────────────────────────────────────────────────

export function SplitView({
  tabs,
  paneTabIds,
  splitMode,
  onOpenSingletonTab,
  onOpenTab,
}: {
  tabs: Tab[];
  paneTabIds: (string | null)[];
  splitMode: SplitMode;
  onOpenSingletonTab: (type: TabType) => void;
  onOpenTab: (host: Host, type: TabType) => void;
}) {
  const { rowSizes, rowColSizes, isDragging, containerRef, reset, onRowDivider, onColDivider } = useSplitSizes(splitMode);

  function pane(idx: number) {
    const tab = paneTabIds[idx] != null ? tabs.find(t => t.id === paneTabIds[idx]) ?? null : null;
    return <Pane tab={tab} paneIndex={idx} isDragging={isDragging} onOpenSingletonTab={onOpenSingletonTab} onOpenTab={onOpenTab}/>;
  }

  function Row({ rowIdx, paneIndices }: { rowIdx: number; paneIndices: number[] }) {
    const cols = rowColSizes[rowIdx] ?? [];
    return (
      <div className="flex min-h-0 w-full" style={{ height: `${rowSizes[rowIdx]}%` }}>
        {paneIndices.map((pIdx, ci) => (
          <>
            <div key={pIdx} className="min-w-0 min-h-0 overflow-hidden" style={{ width: `${cols[ci]}%` }}>
              {pane(pIdx)}
            </div>
            {ci < paneIndices.length - 1 && (
              <ColDivider key={`cd-${rowIdx}-${ci}`} onMouseDown={e => onColDivider(e, rowIdx, ci)}/>
            )}
          </>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex flex-col w-full h-full min-h-0 overflow-hidden relative">
      <button
        onClick={reset}
        className="absolute top-1 right-1 z-20 text-xs text-muted-foreground hover:text-foreground bg-background/80 border border-border px-1.5 py-0.5 leading-tight"
        title="Reset to equal split"
      >
        Reset
      </button>

      {splitMode === "2-way" && (
        <Row rowIdx={0} paneIndices={[0, 1]}/>
      )}

      {splitMode === "3-way" && (
        <div className="flex w-full h-full min-h-0">
          <div className="min-w-0 min-h-0 overflow-hidden" style={{ width: `${rowColSizes[0][0]}%` }}>
            {pane(0)}
          </div>
          <ColDivider onMouseDown={e => onColDivider(e, 0, 0)}/>
          <div className="flex flex-col flex-1 min-h-0">
            <div className="min-h-0 overflow-hidden" style={{ height: `${rowSizes[0]}%` }}>
              {pane(1)}
            </div>
            <RowDivider onMouseDown={e => onRowDivider(e, 0)}/>
            <div className="min-h-0 overflow-hidden" style={{ height: `${rowSizes[1]}%` }}>
              {pane(2)}
            </div>
          </div>
        </div>
      )}

      {splitMode === "4-way" && (
        <div className="flex flex-col w-full h-full min-h-0">
          <Row rowIdx={0} paneIndices={[0, 1]}/>
          <RowDivider onMouseDown={e => onRowDivider(e, 0)}/>
          <Row rowIdx={1} paneIndices={[2, 3]}/>
        </div>
      )}

      {splitMode === "5-way" && (
        <div className="flex flex-col w-full h-full min-h-0">
          <Row rowIdx={0} paneIndices={[0, 1, 2]}/>
          <RowDivider onMouseDown={e => onRowDivider(e, 0)}/>
          <Row rowIdx={1} paneIndices={[3, 4]}/>
        </div>
      )}

      {splitMode === "6-way" && (
        <div className="flex flex-col w-full h-full min-h-0">
          <Row rowIdx={0} paneIndices={[0, 1, 2]}/>
          <RowDivider onMouseDown={e => onRowDivider(e, 0)}/>
          <Row rowIdx={1} paneIndices={[3, 4, 5]}/>
        </div>
      )}
    </div>
  );
}
