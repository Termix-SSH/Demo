import { Package } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import {
  GRID_SIZE,
  type WidgetComponentProps,
  type WidgetDefinition,
} from "./homepage";
import { UpdatesCard } from "./UpdatesCard";

type Config = Record<string, never>;

function UpdatesWidget({ widget }: WidgetComponentProps<Config>) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle
        title={widget.title || t("card.title")}
        icon={<Package size={11} />}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <UpdatesCard isVisible />
      </div>
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const updatesWidget: WidgetDefinition<Config> = {
  id: "package_updates_widget",
  name: "Package updates",
  description: "Pending updates on every host with Packages turned on",
  category: "monitoring",
  icon: <Package size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: UpdatesWidget },
};
