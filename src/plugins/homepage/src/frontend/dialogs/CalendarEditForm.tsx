import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Input, Checkbox } from "@termix-ssh/plugin-sdk/ui";
import type { CalendarConfig, WidgetEditFormProps } from "../types.js";

export function CalendarEditForm({
  config,
  onChange,
}: WidgetEditFormProps<CalendarConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("homepage.timezone")}
        </label>
        <Input
          value={config.timezone ?? ""}
          onChange={(e) =>
            onChange({ ...config, timezone: e.target.value || undefined })
          }
          placeholder="UTC"
          className="h-8 text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.startOnMonday}
          onCheckedChange={(checked) =>
            onChange({ ...config, startOnMonday: checked === true })
          }
        />
        {t("homepage.startOnMonday")}
      </label>
    </div>
  );
}
