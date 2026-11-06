import {
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { Package } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import type { Summary } from "../shared/types";
import { createApi } from "./api";
import { formatBytes } from "./format";

function toStats(summary: Summary, t: (key: string) => string): Stat[] {
  return [
    { key: "buckets", label: t("widget.buckets"), value: summary.buckets },
    {
      key: "size",
      label: t("widget.size"),
      value: formatBytes(summary.bytes),
    },
    {
      key: "quota",
      label: t("widget.overQuota"),
      value: summary.overQuota.length,
      bad: summary.overQuota.length > 0,
    },
    {
      key: "failing",
      label: t("widget.failing"),
      value: summary.failingAccounts,
      bad: summary.failingAccounts > 0,
    },
  ];
}

const GRID_SIZE = 30;
const POLL_MS = 5 * 60_000;

interface WidgetProps {
  widget: { title?: string | null };
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

interface Stat {
  key: string;
  label: string;
  value: number | string;
  bad?: boolean;
}

function SummaryWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const canView = usePermission("view");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [stats, setStats] = useState<Stat[] | null>(null);

  useEffect(() => {
    if (!canView) return;
    const load = () =>
      api
        .summary()
        .then((summary) => toStats(summary, t))
        .then(setStats)
        .catch(() => undefined);
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [canView, api, t]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Package size={11} />} />
      <div
        className="grid min-h-0 flex-1 grid-cols-2 content-start gap-2 overflow-y-auto p-2"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {(stats ?? []).map((stat) => (
          <div key={stat.key} className="flex flex-col">
            <span
              className={`text-xl font-semibold ${stat.bad ? "text-destructive" : ""}`}
            >
              {stat.value}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {stat.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function storageWidget(t: TermixApp["t"]): WidgetDefinition {
  return {
    id: "object_storage_summary",
    name: t("widget.name"),
    description: t("widget.description"),
    category: "monitoring",
    icon: <Package size={16} />,
    defaultConfig: {},
    defaultSize: { w: 8 * GRID_SIZE, h: 5 * GRID_SIZE },
    minSize: { w: 5 * GRID_SIZE, h: 3 * GRID_SIZE },
    components: { view: SummaryWidget },
  };
}
