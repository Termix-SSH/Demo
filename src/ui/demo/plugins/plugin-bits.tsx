import {
  Activity,
  BellRing,
  Boxes,
  Clock,
  Container,
  FolderTree,
  HardDrive,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Monitor,
  Network,
  Play,
  Power,
  Puzzle,
  RefreshCw,
  Rocket,
  ScrollText,
  Server,
  Sparkles,
  Usb,
  Users,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import type { PluginSource } from "./plugin-data";

// Fixtures name their icon as a string, so the data file stays plain data.
const ICONS: Record<string, LucideIcon> = {
  Activity,
  BellRing,
  Boxes,
  Clock,
  Container,
  FolderTree,
  HardDrive,
  KeyRound,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Monitor,
  Network,
  Play,
  Power,
  RefreshCw,
  Rocket,
  ScrollText,
  Server,
  Sparkles,
  Usb,
  Users,
  Workflow,
};

export function PluginIcon({
  name,
  size = "md",
  muted,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  muted?: boolean;
}) {
  const Icon = ICONS[name] ?? Puzzle;
  const box =
    size === "lg" ? "size-10" : size === "sm" ? "size-7" : "size-9";
  const glyph =
    size === "lg" ? "size-5" : size === "sm" ? "size-3.5" : "size-4";
  return (
    <div
      className={`${box} shrink-0 flex items-center justify-center border border-border bg-muted ${
        muted ? "opacity-40" : ""
      }`}
    >
      <Icon className={`${glyph} text-accent-brand`} />
    </div>
  );
}

/**
 * Where a plugin came from. Anything outside the official registry carries this
 * wherever it appears, not just at install, so the label never wears off.
 */
export function SourceBadge({ source }: { source: PluginSource }) {
  if (source === "official") return null;
  // Termix cannot tell a corporate registry from any other one someone added,
  // so both say the only thing that is actually known: it is not official.
  return (
    <span className="shrink-0 border border-warning/40 bg-warning/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-warning">
      Unofficial
    </span>
  );
}
