import { DatabaseBackup } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import {
  GRID_SIZE,
  type WidgetComponentProps,
  type WidgetDefinition,
} from "./homepage";
import { JobsCard } from "./JobsCard";

type Config = Record<string, never>;

function JobsCardWidget({ widget }: WidgetComponentProps<Config>) {
  const { t } = useTranslation();
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle
        title={widget.title || t("card.title")}
        icon={<DatabaseBackup size={11} />}
      />
      <div
        className="flex-1 overflow-hidden"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <JobsCard isVisible config={{}} />
      </div>
    </div>
  );
}

/** Registered by the plugin while it runs. */
export const jobsWidget: WidgetDefinition<Config> = {
  id: "backups_jobs_widget",
  name: "Backup jobs",
  description: "Every backup job, worst first, with its last result",
  category: "monitoring",
  icon: <DatabaseBackup size={14} />,
  defaultConfig: {},
  defaultSize: { w: GRID_SIZE * 10, h: GRID_SIZE * 8 },
  minSize: { w: GRID_SIZE * 6, h: GRID_SIZE * 5 },
  components: { view: JobsCardWidget },
};
