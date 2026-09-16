/* eslint-disable react-refresh/only-export-components */
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Activity,
  Globe,
  KeyRound,
  Monitor,
  MousePointerClick,
  Network,
  Puzzle,
  Server,
  SquareTerminal,
  Tag,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { GroupHeading } from "@/components/panel-layout";
import type { HostEditorForm } from "@/demo/hosts/host-form";

/**
 * Every section of the host editor, in order, in one table.
 *
 * The nav is generated from this, so a section cannot exist without a nav entry
 * to reach it. The old editor hid seven sub-tabs behind a single "SSH" tab and
 * scrolled the strip horizontally, which is the main reason people could not
 * find settings.
 */

export type SectionBand = "basics" | "session" | "network" | "protocols" | "plugins";

export interface SectionDef {
  id: string;
  label: string;
  icon: LucideIcon;
  band: SectionBand;
  /** Hidden until Advanced is on, unless it already holds a changed value. */
  advanced?: boolean;
  /** Protocol sections appear only when their protocol is on. */
  visible?: (form: HostEditorForm) => boolean;
  /**
   * True when this section holds something other than its default. An advanced
   * section that answers true stays visible with Advanced off, so a value can
   * never be hidden and silently saved.
   */
  dirty?: (form: HostEditorForm) => boolean;
}

export const BAND_LABELS: Record<SectionBand, string> = {
  basics: "Basics",
  session: "Session",
  network: "Network",
  protocols: "Protocols",
  plugins: "Plugins",
};

export const HOST_SECTIONS: SectionDef[] = [
  { id: "identity", label: "Identity", icon: Globe, band: "basics" },
  { id: "access", label: "Access", icon: KeyRound, band: "basics" },
  { id: "organization", label: "Organization", icon: Tag, band: "basics" },

  {
    id: "terminal-behavior",
    label: "Terminal",
    icon: SquareTerminal,
    band: "session",
    visible: (f) => f.enableSsh,
  },
  {
    id: "terminal-appearance",
    label: "Appearance",
    icon: Terminal,
    band: "session",
    advanced: true,
    visible: (f) => f.enableSsh,
    dirty: (f) => !f.inheritTerminalAppearance,
  },
  {
    id: "session-recording",
    label: "Logging and sharing",
    icon: Activity,
    band: "session",
    advanced: true,
    visible: (f) => f.enableSsh,
    dirty: (f) => !f.enableSessionLogging || !f.allowSessionSharing,
  },

  { id: "ports", label: "Ports", icon: Network, band: "network" },
  {
    id: "proxy",
    label: "Proxy and jump hosts",
    icon: Server,
    band: "network",
    advanced: true,
    dirty: (f) =>
      f.useSocks5 || f.jumpHosts.length > 0 || f.connectionOrigin !== "",
  },
  {
    id: "reachability",
    label: "Reachability",
    icon: Activity,
    band: "network",
    advanced: true,
    dirty: (f) =>
      !!f.macAddress || f.portKnockSequence.length > 0,
  },

  {
    id: "rdp",
    label: "RDP",
    icon: Monitor,
    band: "protocols",
    visible: (f) => f.enableRdp,
  },
  {
    id: "vnc",
    label: "VNC",
    icon: MousePointerClick,
    band: "protocols",
    visible: (f) => f.enableVnc,
  },
  {
    id: "telnet",
    label: "Telnet",
    icon: Terminal,
    band: "protocols",
    visible: (f) => f.enableTelnet,
  },
];

/** The sections to actually render, given the form and the advanced toggle. */
export function visibleSections(
  sections: SectionDef[],
  form: HostEditorForm,
  advanced: boolean,
): SectionDef[] {
  return sections.filter((section) => {
    if (section.visible && !section.visible(form)) return false;
    if (!section.advanced || advanced) return true;
    return section.dirty?.(form) ?? false;
  });
}

/**
 * Highlights the section you are looking at, and scrolls to the one you click.
 *
 * Uses scroll position rather than IntersectionObserver ratios: with sections
 * of very different heights, "most visible" jumps around, while "last heading
 * above the top edge" tracks what you are actually reading.
 */
export function useScrollSpy(
  containerRef: RefObject<HTMLElement | null>,
  ids: string[],
): { active: string; scrollTo: (id: string) => void } {
  const [active, setActive] = useState(ids[0] ?? "");
  const idsKey = ids.join("|");
  // Clicking jumps the scroll position, which would otherwise make the spy
  // flicker through every section it passes on the way.
  const lockUntil = useRef(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onScroll = () => {
      if (Date.now() < lockUntil.current) return;
      const top = container.getBoundingClientRect().top;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = container.querySelector<HTMLElement>(`[data-section="${id}"]`);
        if (!el) continue;
        if (el.getBoundingClientRect().top - top <= 24) current = id;
      }
      // At the very bottom the last section may never clear the threshold.
      if (
        container.scrollTop + container.clientHeight >=
        container.scrollHeight - 8
      ) {
        current = ids[ids.length - 1] ?? current;
      }
      setActive(current);
    };

    onScroll();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [containerRef, idsKey, ids]);

  return {
    active,
    scrollTo: (id: string) => {
      const container = containerRef.current;
      const el = container?.querySelector<HTMLElement>(`[data-section="${id}"]`);
      if (!container || !el) return;
      lockUntil.current = Date.now() + 600;
      setActive(id);
      container.scrollTo({
        top: el.offsetTop - container.offsetTop,
        behavior: "smooth",
      });
    },
  };
}

/** The nav column. Same left-marker treatment as the settings screen. */
export function SectionNav({
  bands,
  active,
  errorSections,
  onSelect,
}: {
  bands: { band: SectionBand; items: { id: string; label: string; icon: LucideIcon }[] }[];
  active: string;
  errorSections: Set<string>;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="flex w-52 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border py-2.5">
      {bands.map(({ band, items }) => (
        <div key={band} className="flex flex-col">
          <GroupHeading title={BAND_LABELS[band]} className="px-2.5 pb-1.5" />
          {items.map((item) => {
            const Icon = item.icon;
            const on = item.id === active;
            return (
              <button
                key={item.id}
                onClick={() => onSelect(item.id)}
                className={`flex w-full items-center gap-2 border-l-2 py-1.5 pl-2 pr-2 text-left transition-colors focus-visible:relative focus-visible:z-10 focus-visible:ring-1 focus-visible:ring-ring ${
                  on
                    ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                    : "border-transparent text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5 shrink-0" />
                <span className="truncate text-xs font-medium">
                  {item.label}
                </span>
                {errorSections.has(item.id) && (
                  <span
                    title="Something here needs attention"
                    className="ml-auto size-1.5 shrink-0 rounded-full bg-destructive"
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Wraps a section so the scroll spy can find it. */
export function Section({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <div data-section={id} className="scroll-mt-4">
      {children}
    </div>
  );
}

export const PLUGIN_BAND_ICON = Puzzle;
