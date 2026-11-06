import { GitBranch } from "lucide-react";
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
import { GitCard } from "./GitCard";

type Config = Record<string, never>;

// The cards never read the shell.
const cardProps = { isVisible: true } as DashboardCardProps;

function GitWidget({ widget }: WidgetComponentProps<Config>) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle
        title={widget.title || t("card.title")}
        icon={<GitBranch size={11} />}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GitCard {...cardProps} />
      </div>
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const gitWidget: WidgetDefinition<Config> = {
  id: "git_widget",
  name: "Git repos",
  description: "Changes and sync state of the repos on your hosts",
  category: "monitoring",
  icon: <GitBranch size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: GitWidget },
};
