import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Search, Terminal, Trash2 } from "lucide-react";
import { HISTORY_ENTRIES } from "@/ui/utils/data";
import type { Tab } from "@/ui/utils/types";

export function HistoryPanel({ activeTabId, terminalTabs }: {
  activeTabId: string;
  terminalTabs: Tab[];
}) {
  const [search, setSearch] = useState("");
  const [entries, setEntries] = useState(HISTORY_ENTRIES);

  const activeIsTerminal = terminalTabs.some(t => t.id === activeTabId);

  if (!activeIsTerminal) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-3 p-6 text-center">
        <div className="size-10 rounded-full bg-muted/40 flex items-center justify-center">
          <Terminal className="size-5 text-muted-foreground/30"/>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm font-semibold text-muted-foreground/60">No terminal selected</span>
          <span className="text-xs text-muted-foreground/40">Open an SSH terminal tab to view its command history</span>
        </div>
      </div>
    );
  }

  const activeTab = terminalTabs.find(t => t.id === activeTabId)!;

  const filtered = search
    ? entries.filter(e =>
        e.command.toLowerCase().includes(search.toLowerCase()) ||
        e.host.toLowerCase().includes(search.toLowerCase())
      )
    : entries;

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted/30 border border-border/60">
        <Terminal className="size-3 shrink-0 text-accent-brand"/>
        <span className="text-xs font-medium truncate text-foreground">{activeTab.label}</span>
      </div>
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
        <Input placeholder="Search history..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8"/>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
        <button onClick={() => setEntries([])} className="text-xs text-accent-brand hover:text-accent-brand/70">
          Clear All
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {filtered.length === 0 && (
          <span className="text-xs text-muted-foreground/60 text-center py-8">No history entries</span>
        )}
        {filtered.map(entry => (
          <div key={entry.id} className="group flex flex-col gap-1 px-2.5 py-2 border border-border bg-background hover:border-muted-foreground/30 transition-colors">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-mono text-foreground break-all leading-relaxed">{entry.command}</span>
              <div className="flex items-center gap-0.5 shrink-0 md:opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={() => navigator.clipboard.writeText(entry.command)}>
                  <Copy className="size-3"/>
                </Button>
                <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}>
                  <Trash2 className="size-3"/>
                </Button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground/60">{entry.host}</span>
              <span className="text-xs text-muted-foreground/40">·</span>
              <span className="text-xs text-muted-foreground/60">{entry.time}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
