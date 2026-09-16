import { useEffect, useRef, type ReactNode } from "react";

/**
 * Scrollable underline tabs.
 *
 * Lived in HostManagerTabs next to the host editor's tab model. The editor no
 * longer uses tabs, but the plugins screen, Docker, Proxmox and host metrics
 * all still do, so it moved here rather than staying in a file named for
 * something that is gone.
 */

export function TabStrip({
  tabs,
  activeTab,
  onTabChange,
  isActive,
  variant = "primary",
}: {
  tabs: { id: string; label: string; icon: ReactNode }[];
  activeTab: string;
  onTabChange: (id: string) => void;
  isActive?: (id: string) => boolean;
  variant?: "primary" | "secondary";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const renderTab = (tab: (typeof tabs)[0]) => {
    const active = isActive ? isActive(tab.id) : activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onTabChange(tab.id)}
        className={`flex items-center gap-1.5 px-3 ${
          variant === "secondary" ? "py-1.5 text-[11px]" : "py-2 text-xs"
        } font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
          active
            ? "border-accent-brand text-accent-brand"
            : "border-transparent text-muted-foreground hover:text-foreground"
        }`}
      >
        {tab.icon}
        {tab.label}
      </button>
    );
  };

  return (
    <div
      ref={ref}
      className={`overflow-x-auto scrollbar-none ${
        variant === "secondary" ? "border-t border-border bg-card" : ""
      }`}
    >
      <div className="flex min-w-max">{tabs.map(renderTab)}</div>
    </div>
  );
}
