import { ExternalLink, Info, RotateCcw } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, SettingRow, useConfirm } from "@termix-ssh/plugin-sdk/ui";
import { resetDemo } from "../backend/store";

export function LoginHint() {
  const { t } = useTranslation();
  return (
    <p className="flex items-start gap-2 border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 size-3.5 shrink-0 text-accent-brand" />
      <span>{t("loginHint")}</span>
    </p>
  );
}

export function ResetSetting() {
  const { t } = useTranslation();
  const confirm = useConfirm();
  return (
    <div className="flex flex-col gap-4">
      <SettingRow label={t("aboutTitle")} description={t("aboutDescription")}>
        <Button variant="outline" size="sm" asChild>
          <a
            href="https://github.com/Termix-SSH/Termix"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink className="size-3.5" />
            {t("getTermix")}
          </a>
        </Button>
      </SettingRow>
      <SettingRow label={t("resetTitle")} description={t("resetDescription")}>
        <Button
          variant="outline"
          size="sm"
          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={async () => {
            const ok = await confirm({
              title: t("resetConfirmTitle"),
              description: t("resetConfirmDescription"),
              confirmLabel: t("resetButton"),
              destructive: true,
            });
            if (ok) resetDemo();
          }}
        >
          <RotateCcw className="size-3.5" />
          {t("resetButton")}
        </Button>
      </SettingRow>
    </div>
  );
}
