import { BatteryCharging } from "lucide-react";
import {
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import {
  GRID_SIZE,
  type WidgetComponentProps,
  type WidgetDefinition,
} from "./homepage";
import { UpsHostsCard } from "./UpsHostsCard";

type Config = Record<string, never>;

// The cards never read the shell.
const cardProps = { isVisible: true } as DashboardCardProps;

function UpsWidget({ widget }: WidgetComponentProps<Config>) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle
        title={widget.title || t("card.title")}
        icon={<BatteryCharging size={11} />}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <UpsHostsCard {...cardProps} />
      </div>
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const upsWidget: WidgetDefinition<Config> = {
  id: "ups_manager_widget",
  name: "UPS",
  description: "Battery charge and runtime of every UPS",
  category: "monitoring",
  icon: <BatteryCharging size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: UpsWidget },
};
