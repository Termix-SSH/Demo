import type { ComponentType, ReactNode } from "react";
import { MonitorCog } from "lucide-react";
import {
  useTranslation,
  type ExtensionContribution,
} from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import { useSummary } from "./useSummary";

/** What app.registerExtension("homepage.widgets", ...) takes. */
interface WidgetDefinition extends ExtensionContribution {
  id: string;
  name: string;
  description: string;
  category: "links" | "info" | "system" | "monitoring";
  icon: ReactNode;
  defaultConfig: Record<string, never>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  components: {
    view: ComponentType<{ widget: { title?: string | null } }>;
  };
}

/** The homepage's grid step, in pixels. */
const GRID_SIZE = 30;

function VmSummaryView({ widget }: { widget: { title?: string | null } }) {
  const { t } = useTranslation();
  const { rows } = useSummary(true, t("tab.error"));
  const running = rows?.reduce((n, row) => n + row.running, 0) ?? 0;
  const total = rows?.reduce((n, row) => n + row.total, 0) ?? 0;
  const crashed = rows?.reduce((n, row) => n + row.crashed, 0) ?? 0;
  return (
    <div className="flex h-full flex-col gap-1 p-3">
      <WidgetTitle title={widget.title || t("all.title")} />
      <p className="text-2xl font-semibold">
        {running} / {total}
      </p>
      <p className="text-xs text-muted-foreground">
        {crashed ? t("card.crashed", { count: crashed }) : t("widget.running")}
      </p>
    </div>
  );
}

export const vmSummaryWidget: WidgetDefinition = {
  id: "vm_summary",
  name: "Virtual Machines",
  description: "How many VMs are running across your hosts",
  category: "monitoring",
  icon: <MonitorCog size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 8, h: GRID_SIZE * 4 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 3 },
  components: { view: VmSummaryView },
};
