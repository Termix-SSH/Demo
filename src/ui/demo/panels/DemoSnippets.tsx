import { useEffect, useMemo, useState } from "react";
import {
  Check,
  ChevronRight,
  Copy,
  Folder,
  FolderOpen,
  Pencil,
  Play,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { PANEL, PanelSearch, PanelShell } from "@/components/panel-layout";
import { getSnippets } from "@/demo/demo-api";
import type { Snippet } from "@/types/ui-types";

/**
 * Mirrors the real SnippetsPanel: folder-grouped cards, the command in mono
 * under the name, and a run/copy/edit/delete row on each.
 *
 * Folders are drawn the same way the host and credential trees draw theirs --
 * a rotating chevron, a folder glyph, a bold name, a count chip, and children
 * behind a left rule. A second folder idiom in the same sidebar would read as
 * a different kind of thing, which is what the first version of this did.
 */
export function DemoSnippets({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [ran, setRan] = useState<number | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    getSnippets().then((snippets) => {
      if (cancelled) return;
      setRows(snippets);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Clears the "ran" and "copied" ticks so the feedback does not stick.
  useEffect(() => {
    if (ran === null) return;
    const id = setTimeout(() => setRan(null), 1400);
    return () => clearTimeout(id);
  }, [ran]);
  useEffect(() => {
    if (copied === null) return;
    const id = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(id);
  }, [copied]);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (row) =>
      !q ||
      row.name.toLowerCase().includes(q) ||
      row.content.toLowerCase().includes(q) ||
      (row.description ?? "").toLowerCase().includes(q),
  );

  // Loose snippets first, then each folder, so the ones with no home are not
  // buried under the groups.
  const groups = useMemo(() => {
    const byFolder = new Map<string, Snippet[]>();
    for (const row of visible) {
      const key = row.folder ?? "";
      const list = byFolder.get(key);
      if (list) list.push(row);
      else byFolder.set(key, [row]);
    }
    return [...byFolder.entries()].sort(([a], [b]) =>
      a === "" ? -1 : b === "" ? 1 : a.localeCompare(b),
    );
  }, [visible]);

  function remove(id: number) {
    setRows((prev) => prev.filter((row) => row.id !== id));
  }

  async function copy(row: Snippet) {
    try {
      await navigator.clipboard.writeText(row.content);
    } catch {
      // A blocked clipboard still gets the tick, since the demo has nothing
      // else to report and a silent button reads as broken.
    }
    setCopied(row.id);
  }

  function toggleFolder(name: string) {
    setClosed((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const card = (row: Snippet) => (
    <SnippetCard
      key={row.id}
      row={row}
      ran={ran === row.id}
      copied={copied === row.id}
      onRun={() => setRan(row.id)}
      onCopy={() => copy(row)}
      onDelete={() => remove(row.id)}
    />
  );

  if (loading) return <div className="h-full" />;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Play className="size-4" />}
      title="Snippets"
      status={`${rows.length} saved`}
      actions={
        <Button variant="ghost" size="icon-xs" title="New snippet">
          <Plus className="size-4" />
        </Button>
      }
      toolbar={
        <>
          <PanelSearch
            value={query}
            onChange={setQuery}
            placeholder="Search snippets"
            fill
            className="flex-1"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 gap-1.5 text-xs"
          >
            <Plus className="size-3" />
            New
          </Button>
        </>
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {visible.length === 0 ? (
        <EmptyState
          icon={Play}
          title={rows.length === 0 ? "No snippets" : "Nothing matches"}
          hint={
            rows.length === 0
              ? "Save a command once and run it on any host from here."
              : "Try a different search."
          }
        />
      ) : (
        groups.map(([folder, items]) =>
          folder === "" ? (
            <div key="loose" className="flex flex-col gap-2">
              {items.map(card)}
            </div>
          ) : (
            <div key={folder} className="flex flex-col">
              <FolderRow
                name={folder}
                count={items.length}
                open={!!q || !closed.has(folder)}
                onToggle={() => toggleFolder(folder)}
              />
              {(!!q || !closed.has(folder)) && (
                <div className="ml-[13px] flex flex-col gap-2 border-l border-border/50 py-2 pl-2">
                  {items.map(card)}
                </div>
              )}
            </div>
          ),
        )
      )}
    </PanelShell>
  );
}

/** The host tree's folder row, in the one place snippets need it. */
function FolderRow({
  name,
  count,
  open,
  onToggle,
}: {
  name: string;
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  const Glyph = open ? FolderOpen : Folder;
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`flex w-full items-center gap-2 py-1.5 pl-2.5 pr-2 text-left transition-colors ${
        open ? "bg-muted/40" : "hover:bg-muted/30"
      }`}
    >
      <ChevronRight
        className={`size-3.5 shrink-0 text-muted-foreground/60 transition-transform ${open ? "rotate-90" : ""}`}
      />
      <Glyph
        className={`size-4 shrink-0 ${open ? "text-accent-brand" : "text-muted-foreground/70"}`}
      />
      <span className="min-w-0 flex-1 truncate text-[13px] font-bold tracking-tight text-foreground">
        {name}
      </span>
      <span className="ml-1 shrink-0 bg-muted/70 px-1.5 py-[1px] text-[10px] tabular-nums text-muted-foreground/50">
        {count}
      </span>
    </button>
  );
}

function SnippetCard({
  row,
  ran,
  copied,
  onRun,
  onCopy,
  onDelete,
}: {
  row: Snippet;
  ran: boolean;
  copied: boolean;
  onRun: () => void;
  onCopy: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 border border-border bg-background p-2.5">
      <div className="flex min-w-0 flex-col">
        <span className="text-xs font-semibold break-words">{row.name}</span>
        {row.description && (
          <span className="text-xs text-muted-foreground break-words">
            {row.description}
          </span>
        )}
      </div>

      <span className="min-w-0 whitespace-pre-wrap break-all px-1 font-mono text-xs text-muted-foreground">
        {row.content}
      </span>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          onClick={onRun}
          className={`h-7 flex-1 gap-1.5 text-xs ${
            ran
              ? "border-accent-brand/40 text-accent-brand hover:text-accent-brand"
              : ""
          }`}
        >
          {ran ? <Check className="size-3" /> : <Play className="size-3" />}
          {ran ? "Sent to terminal" : "Run"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Copy"
          onClick={onCopy}
          className={`size-7 shrink-0 ${
            copied
              ? "text-accent-brand"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {copied ? (
            <Check className="size-3.5" />
          ) : (
            <Copy className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Edit"
          className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="Delete"
          onClick={onDelete}
          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
