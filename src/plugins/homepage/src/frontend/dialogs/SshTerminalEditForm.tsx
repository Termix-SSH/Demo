import { Checkbox } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { SshTerminalConfig, WidgetEditFormProps } from "../types.js";
import { SingleHostEditForm } from "./SingleHostEditForm";

export function SshTerminalEditForm({
  config,
  onChange,
}: WidgetEditFormProps<SshTerminalConfig>) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3">
      <SingleHostEditForm
        hostId={config.hostId}
        onChange={(hostId) => onChange({ ...config, hostId })}
        filter={(h) => !!h.enableSsh}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
        <Checkbox
          checked={config.autoConnect}
          onCheckedChange={(checked) =>
            onChange({ ...config, autoConnect: checked === true })
          }
        />
        {t("homepage.sshTerminalAutoConnect")}
      </label>
    </div>
  );
}
