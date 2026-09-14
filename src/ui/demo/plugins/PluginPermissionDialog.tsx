import { useMemo } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/dialog";
import { PluginIcon, SourceBadge } from "./plugin-bits";
import { Facts } from "@/components/panel-layout";
import {
  CAPABILITY_INFO,
  type DemoPlugin,
  type PluginCapability,
} from "./plugin-data";

/**
 * Install and update consent.
 *
 * Capabilities are shown as consequences rather than names, worst first. The
 * high-risk ones always stand alone; the low-risk ones collapse into a single
 * line so the list stays short enough that people actually read it.
 */
export function PluginPermissionDialog({
  plugin,
  mode,
  open,
  onOpenChange,
  onConfirm,
}: {
  plugin: DemoPlugin | null;
  /** "update" shows only what the new version adds. */
  mode: "install" | "update";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const shown: PluginCapability[] = useMemo(() => {
    if (!plugin) return [];
    return mode === "update"
      ? (plugin.addedCapabilities ?? [])
      : plugin.capabilities;
  }, [plugin, mode]);

  const notable = shown.filter((c) => CAPABILITY_INFO[c].risk !== "low");
  const minor = shown.filter((c) => CAPABILITY_INFO[c].risk === "low");

  if (!plugin) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2.5">
            <PluginIcon name={plugin.icon} />
            <div className="flex min-w-0 flex-col gap-0.5">
              <DialogTitle>
                {mode === "update"
                  ? `Update ${plugin.name}`
                  : `Install ${plugin.name}`}
              </DialogTitle>
              <DialogDescription asChild>
                <Facts>
                  <span className="truncate">{plugin.author}</span>
                  <span className="shrink-0">
                    {mode === "update"
                      ? `${plugin.version} to ${plugin.latestVersion}`
                      : plugin.version}
                  </span>
                  <SourceBadge source={plugin.source} />
                </Facts>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {mode === "update" && (
          <p className="text-xs leading-relaxed text-foreground">
            This version asks for something the one you have does not have, so
            it will not install on its own.
          </p>
        )}

        <div className="flex flex-col">
          <span className="pb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {mode === "update" ? "New in this version" : "What it can do"}
          </span>

          <div className="divide-y divide-border border-y border-border">
            {notable.map((cap) => {
              const info = CAPABILITY_INFO[cap];
              const severe = info.risk === "high";
              return (
                <div key={cap} className="flex items-start gap-2.5 py-2.5">
                  {/* The badge marks severity, so only the severe rows get
                      one. A filler glyph on the rest would just read as a
                      list marker. */}
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                    {severe && (
                      <span className="flex size-4 items-center justify-center border border-destructive/50 bg-destructive/10 text-[10px] font-bold text-destructive">
                        !
                      </span>
                    )}
                  </span>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-xs font-medium leading-snug">
                      {info.title}
                    </span>
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {info.detail}
                    </span>
                  </div>
                </div>
              );
            })}

            {minor.length > 0 && (
              <div className="py-2.5">
                <span className="text-[11px] leading-snug text-muted-foreground">
                  It also adds its own screens and stores its own data, kept
                  separate from other plugins.
                </span>
              </div>
            )}
          </div>
        </div>

        {plugin.source === "community" && (
          <div className="flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-2">
            <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
            <span className="text-[11px] leading-snug text-muted-foreground">
              Written outside the Termix team. Reviewed before listing, but not
              maintained by Termix.
            </span>
          </div>
        )}

        <DialogFooter className="items-center">
          <span className="mr-auto text-[11px] text-muted-foreground">
            {plugin.downloads} installs
          </span>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {mode === "update" ? "Agree and update" : "Install"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
