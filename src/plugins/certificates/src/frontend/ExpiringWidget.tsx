import { ShieldCheck } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import {
  GRID_SIZE,
  type WidgetComponentProps,
  type WidgetDefinition,
} from "./homepage";
import { ExpiringCard } from "./ExpiringCard";

type Config = Record<string, never>;

function ExpiringCardWidget({ widget }: WidgetComponentProps<Config>) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle
        title={widget.title || t("card.title")}
        icon={<ShieldCheck size={11} />}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <ExpiringCard isVisible />
      </div>
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const expiringWidget: WidgetDefinition<Config> = {
  id: "certificates_expiring_widget",
  name: "Expiring certificates",
  description: "The certificates that expire next across hosts",
  category: "monitoring",
  icon: <ShieldCheck size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: ExpiringCardWidget },
};
