import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Input, Checkbox } from "@termix-ssh/plugin-sdk/ui";
import type { CountdownConfig, WidgetEditFormProps } from "../types.js";

export function CountdownEditForm({
  config,
  onChange,
}: WidgetEditFormProps<CountdownConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("homepage.countdownLabel")}
        </label>
        <Input
          value={config.label}
          onChange={(e) => onChange({ ...config, label: e.target.value })}
          placeholder={t("homepage.countdownLabelPlaceholder")}
          className="h-8 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-muted-foreground">
          {t("homepage.targetDate")}
        </label>
        <Input
          type="datetime-local"
          value={config.targetDate}
          onChange={(e) => onChange({ ...config, targetDate: e.target.value })}
          className="h-8 text-xs"
        />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showDays}
          onCheckedChange={(checked) =>
            onChange({ ...config, showDays: checked === true })
          }
        />
        {t("homepage.countdownShowDays")}
      </label>
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.showHours}
          onCheckedChange={(checked) =>
            onChange({ ...config, showHours: checked === true })
          }
        />
        {t("homepage.countdownShowHours")}
      </label>
    </div>
  );
}
