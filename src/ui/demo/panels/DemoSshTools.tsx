import { useRef, useState } from "react";
import { Hammer, KeyRound, Radio, Terminal } from "lucide-react";
import { Button } from "@/components/button";
import { EmptyState } from "@/components/empty-state";
import { GroupHeading, PANEL, PanelShell } from "@/components/panel-layout";
import type { Tab } from "@/types/ui-types";

/**
 * Mirrors the real SshToolsPanel: pick the terminals you want, then what you
 * type reaches all of them at once.
 *
 * Broadcast is live rather than a compose box with a send button. The real
 * panel puts the keyboard into the selected terminals directly, so a box you
 * fill in and submit would be a different feature wearing the same name -- you
 * could not send a Ctrl-C, an arrow key or a tab completion with it. Focusing
 * the field here arms it, and every key is reported as it is pressed.
 */
export function DemoSshTools({
  chrome = true,
  terminalTabs = [],
}: {
  chrome?: boolean;
  terminalTabs?: Tab[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [armed, setArmed] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** What the terminals would receive, written the way a key log reads. */
  function describe(e: React.KeyboardEvent): string | null {
    if (e.ctrlKey && e.key.length === 1) return `Ctrl+${e.key.toUpperCase()}`;
    switch (e.key) {
      case "Enter":
        return "Enter";
      case "Tab":
        return "Tab";
      case "Backspace":
        return "Backspace";
      case "Escape":
        return "Esc";
      case "ArrowUp":
        return "Up";
      case "ArrowDown":
        return "Down";
      case "ArrowLeft":
        return "Left";
      case "ArrowRight":
        return "Right";
      default:
        return e.key.length === 1 ? e.key : null;
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (selected.size === 0) return;
    const key = describe(e);
    if (!key) return;
    // Nothing reaches the field itself: the keystroke is the payload, so the
    // browser must not also insert it or move the caret.
    e.preventDefault();
    setSent((prev) => [...prev.slice(-40), key]);
  }

  return (
    <PanelShell
      chrome={chrome}
      icon={<Hammer className="size-4" />}
      title="SSH tools"
      status={
        terminalTabs.length === 0
          ? "No terminals open"
          : `${selected.size} of ${terminalTabs.length} selected`
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {terminalTabs.length === 0 ? (
        <EmptyState
          icon={Terminal}
          title="No terminals open"
          hint="Open a terminal or two, then type into all of them from here."
        />
      ) : (
        <>
          <div className="flex items-center gap-2">
            <GroupHeading title="Targets" count={terminalTabs.length} />
            <Button
              variant="ghost"
              size="xs"
              className="shrink-0 text-muted-foreground hover:text-foreground"
              onClick={() =>
                setSelected(
                  selected.size === terminalTabs.length
                    ? new Set()
                    : new Set(terminalTabs.map((tab) => tab.id)),
                )
              }
            >
              {selected.size === terminalTabs.length ? "None" : "All"}
            </Button>
          </div>

          <div className="flex flex-col border border-border">
            {terminalTabs.map((tab) => {
              const on = selected.has(tab.id);
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => toggle(tab.id)}
                  className={`flex items-center gap-2 border-b border-border/60 px-3 py-2 text-left transition-colors last:border-0 ${
                    on
                      ? "bg-accent-brand/10 text-accent-brand"
                      : "text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  }`}
                >
                  <span
                    className={`size-3 shrink-0 border ${
                      on
                        ? "border-accent-brand bg-accent-brand"
                        : "border-border"
                    }`}
                  />
                  <Terminal className="size-3 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {tab.customLabel || tab.label || "Terminal"}
                  </span>
                  {on && armed && (
                    <span className="shrink-0 text-[9px] font-bold uppercase tracking-widest">
                      Live
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <GroupHeading title="Broadcast" />
          <button
            type="button"
            onClick={() => inputRef.current?.focus()}
            disabled={selected.size === 0}
            className={`flex min-h-16 w-full flex-col gap-1.5 border px-3 py-2.5 text-left transition-colors ${
              armed
                ? "border-accent-brand bg-accent-brand/5"
                : "border-border hover:bg-muted/30 disabled:hover:bg-transparent"
            }`}
          >
            <span className="flex items-center gap-1.5">
              <Radio
                className={`size-3 shrink-0 ${armed ? "text-accent-brand" : "text-muted-foreground"}`}
              />
              <span
                className={`text-[10px] font-semibold uppercase tracking-widest ${
                  armed ? "text-accent-brand" : "text-muted-foreground"
                }`}
              >
                {selected.size === 0
                  ? "Select a terminal first"
                  : armed
                    ? `Typing into ${selected.size} ${selected.size === 1 ? "terminal" : "terminals"}`
                    : "Click to start typing"}
              </span>
            </span>

            {sent.length === 0 ? (
              <span className="text-[11px] text-muted-foreground/70">
                Every key goes straight through, including Ctrl and the arrows.
              </span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {sent.map((key, i) => (
                  <span
                    key={i}
                    className="border border-border bg-muted/70 px-1 py-px font-mono text-[10px] text-muted-foreground"
                  >
                    {key === " " ? "Space" : key}
                  </span>
                ))}
              </span>
            )}
          </button>

          {/* Off screen, because the keystroke is the payload rather than any
              text it would otherwise accumulate. */}
          <input
            ref={inputRef}
            value=""
            readOnly
            onChange={() => {}}
            onKeyDown={onKeyDown}
            onFocus={() => setArmed(true)}
            onBlur={() => setArmed(false)}
            aria-label="Broadcast keystrokes to the selected terminals"
            className="sr-only"
          />

          {sent.length > 0 && (
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setSent([])}
              className="self-start text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="h-8 justify-start gap-1.5"
            disabled={selected.size === 0}
          >
            <KeyRound className="size-3" />
            Fill saved password
          </Button>
        </>
      )}
    </PanelShell>
  );
}
