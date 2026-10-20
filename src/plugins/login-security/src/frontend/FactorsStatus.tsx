import { useEffect, useState } from "react";
import {
  useTranslation,
  type SettingsComponentProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";

interface Status {
  factors: { id: string; pluginId: string }[];
}

/** Which second factors are installed, with a warning when there are none. */
export function createFactorsStatus(app: TermixApp) {
  return function FactorsStatus({ values }: SettingsComponentProps) {
    const { t } = useTranslation();
    const [status, setStatus] = useState<Status | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      app.api
        .get<Status>("/status")
        .then(({ data }) => setStatus(data))
        .catch(() => setFailed(true));
    }, []);

    if (failed) {
      return <p className="text-xs text-destructive">{t("status.failed")}</p>;
    }
    if (!status) return null;
    if (status.factors.length === 0) {
      const required = values.secondFactor && values.secondFactor !== "off";
      return (
        <p
          className={`text-xs ${required ? "text-destructive" : "text-muted-foreground"}`}
        >
          {t("status.noFactors")}
        </p>
      );
    }
    return (
      <p className="text-xs text-muted-foreground">
        {t("status.factors", {
          factors: status.factors.map((factor) => factor.id).join(" | "),
        })}
      </p>
    );
  };
}
