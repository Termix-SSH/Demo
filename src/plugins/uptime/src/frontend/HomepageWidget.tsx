import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { HeartPulse } from "lucide-react";
import {
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  StatusDot,
  WidgetTitle,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { UptimeSummary } from "../shared/types";
import { getSummary } from "./api";
import { percentText, POLL_MS } from "./format";

const GRID_SIZE = 30;

interface WidgetProps {
  widget: { title?: string | null };
  config: Record<string, never>;
}

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
  components: { view: ComponentType<WidgetProps> };
}

function UptimeWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<UptimeSummary | null>(null);

  useEffect(() => {
    const load = () =>
      void getSummary()
        .then(setSummary)
        .catch(() => setSummary(null));
    load();
    const timer = setInterval(load, POLL_MS * 2);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} icon={<HeartPulse size={11} />} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2 text-xs">
        {!summary ? (
          <LoadingState compact label={t("card.loading")} />
        ) : (
          <>
            <div className="flex items-center gap-2">
              <StatusDot tone="ok" />
              <span className="flex-1">{t("widget.up")}</span>
              <span>{summary.up}</span>
            </div>
            <div className="flex items-center gap-2">
              <StatusDot tone={summary.down > 0 ? "bad" : "idle"} />
              <span className="flex-1">{t("widget.down")}</span>
              <span>{summary.down}</span>
            </div>
            <p className="text-muted-foreground">
              {t("card.month", { value: percentText(summary.uptimeMonth) })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function uptimeWidget(t: TermixApp["t"]): WidgetDefinition {
  return {
    id: "uptime",
    name: t("widget.name"),
    description: t("widget.description"),
    category: "monitoring",
    icon: <HeartPulse size={16} />,
    defaultConfig: {},
    defaultSize: { w: 8 * GRID_SIZE, h: 6 * GRID_SIZE },
    minSize: { w: 5 * GRID_SIZE, h: 4 * GRID_SIZE },
    components: { view: UptimeWidget },
  };
}
