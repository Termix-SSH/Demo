import { Checkbox } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { TermixUptimeConfig, WidgetEditFormProps } from "../types.js";

export function TermixUptimeEditForm({
  config,
  onChange,
}: WidgetEditFormProps<TermixUptimeConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showDetailed}
          onCheckedChange={(checked) =>
            onChange({ ...config, showDetailed: checked === true })
          }
        />
        {t("homepage.showSeconds")}
      </label>
    </div>
  );
}
