import { Checkbox } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { SystemOverviewConfig, WidgetEditFormProps } from "../types.js";

export function SystemOverviewEditForm({
  config,
  onChange,
}: WidgetEditFormProps<SystemOverviewConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showVersion}
          onCheckedChange={(checked) =>
            onChange({ ...config, showVersion: checked === true })
          }
        />
        {t("homepage.overviewVersion")}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showDbHealth}
          onCheckedChange={(checked) =>
            onChange({ ...config, showDbHealth: checked === true })
          }
        />
        {t("homepage.overviewDatabase")}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showUptime}
          onCheckedChange={(checked) =>
            onChange({ ...config, showUptime: checked === true })
          }
        />
        {t("homepage.overviewUptime")}
      </label>
    </div>
  );
}
