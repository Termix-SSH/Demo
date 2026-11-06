import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { ServerCog } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { StatusDot, WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import type { Device } from "../shared/types";
import { createApi } from "./api";
import { statusTone } from "./format";

const GRID_SIZE = 30;
const POLL_MS = 30_000;

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

function DevicesWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const canView = usePermission("view");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [devices, setDevices] = useState<Device[] | null>(null);

  const load = useCallback(async () => {
    try {
      setDevices(await api.devices());
    } catch {
      setDevices([]);
    }
  }, [api]);

  useEffect(() => {
    if (!canView) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [canView, load]);

  const list = devices ?? [];
  const down = list.filter((device) => device.status === "down");
  const sorted = [...list].sort(
    (a, b) => Number(b.status === "down") - Number(a.status === "down"),
  );
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} icon={<ServerCog size={11} />} />
      <div
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1"
        onMouseDown={(event) => event.stopPropagation()}
      >
        {devices && list.length === 0 && (
          <p className="p-2 text-xs text-muted-foreground">{t("empty")}</p>
        )}
        {list.length > 0 && (
          <p className="px-1 text-xs text-muted-foreground">
            {t("widget.summary", {
              up: list.length - down.length,
              total: list.length,
            })}
          </p>
        )}
        {sorted.map((device) => (
          <div
            key={device.id}
            className="flex min-w-0 items-center gap-2 px-1 text-xs"
          >
            <StatusDot
              tone={statusTone(device.status, device.reading?.health)}
            />
            <span className="min-w-0 flex-1 truncate">{device.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function oobWidget(t: TermixApp["t"]): WidgetDefinition {
  return {
    id: "bmc_devices",
    name: t("widget.name"),
    description: t("widget.description"),
    category: "monitoring",
    icon: <ServerCog size={16} />,
    defaultConfig: {},
    defaultSize: { w: 8 * GRID_SIZE, h: 6 * GRID_SIZE },
    minSize: { w: 5 * GRID_SIZE, h: 4 * GRID_SIZE },
    components: { view: DevicesWidget },
  };
}
