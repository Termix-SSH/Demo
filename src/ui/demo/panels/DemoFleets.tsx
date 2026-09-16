import { useEffect, useState } from "react";
import { Boxes, Play, Plus, Send, Tag, Upload } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { EmptyState } from "@/components/empty-state";
import { Facts, PANEL, PanelShell } from "@/components/panel-layout";
import { TabStrip } from "@/components/tab-strip";
import { getFleets } from "@/demo/demo-api";
import type { DemoFleet } from "@/demo/demo-data";

/**
 * Mirrors the real FleetsPanel: pick a group of hosts, then do one thing to
 * all of them. Selecting a fleet swaps the list for its action tabs, which is
 * how the real panel behaves in a sidebar this narrow.
 */

type Section = "run" | "transfer" | "inventory";

export function DemoFleets({ chrome = true }: { chrome?: boolean }) {
  const [rows, setRows] = useState<DemoFleet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<DemoFleet | null>(null);
  const [section, setSection] = useState<Section>("run");
  const [command, setCommand] = useState("");
  const [ran, setRan] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getFleets().then((fleets) => {
      if (cancelled) return;
      setRows(fleets);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ran) return;
    const id = setTimeout(() => setRan(false), 2000);
    return () => clearTimeout(id);
  }, [ran]);

  if (loading) return <div className="h-full" />;

  if (selected) {
    return (
      <PanelShell
        chrome={chrome}
        icon={<Boxes className="size-4" />}
        title={selected.name}
        status={`${selected.onlineCount} of ${selected.memberCount} online`}
        leading={
          <Button
            variant="ghost"
            size="xs"
            className="mx-2"
            onClick={() => setSelected(null)}
          >
            Back
          </Button>
        }
        tabs={
          <TabStrip
            activeTab={section}
            onTabChange={(id) => setSection(id as Section)}
            tabs={[
              { id: "run", label: "Run", icon: <Play className="size-3" /> },
              {
                id: "transfer",
                label: "Transfer",
                icon: <Upload className="size-3" />,
              },
              {
                id: "inventory",
                label: "Inventory",
                icon: <Boxes className="size-3" />,
              },
            ]}
          />
        }
        className={`${PANEL.body} ${PANEL.gap}`}
      >
        {section === "run" && (
          <>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="uptime"
              className="h-8 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              disabled={!command.trim()}
              onClick={() => setRan(true)}
            >
              <Send className="size-3" />
              Run on {selected.memberCount} hosts
            </Button>
            {ran && (
              <div className="flex flex-col border border-border">
                {Array.from({ length: selected.memberCount }).map((_, i) => {
                  const ok = i < selected.onlineCount;
                  return (
                    <div
                      key={i}
                      className="flex items-center gap-2 border-b border-border/60 px-3 py-1.5 last:border-0"
                    >
                      <span
                        className={`size-1.5 shrink-0 rounded-full ${ok ? "bg-accent-brand" : "bg-destructive"}`}
                      />
                      <span className="truncate text-xs">
                        {selected.name.toLowerCase().replace(/\s+/g, "-")}-
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground">
                        {ok ? "exit 0" : "unreachable"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {section === "transfer" && (
          <EmptyState
            icon={Upload}
            title="Push a file to every host"
            hint="Drop a file here, or pull one from all of them as a bundle."
          />
        )}

        {section === "inventory" && (
          <div className="flex flex-col border border-border">
            {["Kernel", "Package manager", "Uptime", "Architecture"].map(
              (label) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 border-b border-border/60 px-3 py-2 last:border-0"
                >
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <span className="truncate font-mono text-[11px]">
                    {label === "Kernel"
                      ? "6.8.0 on 5, 6.5.0 on 1"
                      : label === "Package manager"
                        ? "apt"
                        : label === "Uptime"
                          ? "41d average"
                          : "x86_64"}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </PanelShell>
    );
  }

  return (
    <PanelShell
      chrome={chrome}
      icon={<Boxes className="size-4" />}
      title="Fleets"
      status={`${rows.length} groups`}
      actions={
        <Button variant="ghost" size="icon-xs" title="New fleet">
          <Plus className="size-4" />
        </Button>
      }
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      {rows.length === 0 ? (
        <EmptyState
          icon={Boxes}
          title="No fleets"
          hint="Group hosts so a command or a file goes to all of them at once."
        />
      ) : (
        rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelected(row)}
            className="flex items-center gap-2 border border-border px-3 py-2 text-left transition-colors hover:bg-muted/40"
          >
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-semibold">{row.name}</span>
              <Facts className="text-[10px] text-muted-foreground">
                <span>
                  {row.onlineCount} of {row.memberCount} online
                </span>
                {row.tagRule ? (
                  <span className="inline-flex items-center gap-1">
                    <Tag className="size-2.5" />
                    {row.tagRule}
                  </span>
                ) : (
                  <span>Picked by hand</span>
                )}
              </Facts>
            </div>
          </button>
        ))
      )}
    </PanelShell>
  );
}
