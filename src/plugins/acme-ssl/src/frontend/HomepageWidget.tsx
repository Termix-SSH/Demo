import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { WidgetTitle, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import { daysLeft } from "./AcmeCard";
import type { AcmeStatus } from "./AcmeStatusSetting";

const GRID_SIZE = 30;

interface WidgetProps {
  widget: { title?: string | null };
  config: Record<string, never>;
}

/** What app.registerExtension("homepage.widgets", ...) takes. */
interface WidgetDefinition extends ExtensionContribution {
  id: string;
  name: string;
  description: string;
  category: "links" | "info" | "system" | "monitoring";
  icon: ReactNode;
  defaultConfig: Record<string, never>;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  components: { view: ComponentType<WidgetProps> };
}

function CertWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const api = usePluginApi();
  const allowed = usePermission("manage");
  const [status, setStatus] = useState<AcmeStatus | null>(null);

  useEffect(() => {
    if (!allowed) return;
    const load = () =>
      void api
        .get<AcmeStatus>("/status")
        .then((res) => setStatus(res.data))
        .catch(() => setStatus(null));
    load();
    const timer = setInterval(load, 10 * 60_000);
    return () => clearInterval(timer);
  }, [api, allowed]);

  const cert = status?.tls.certificate;
  const days = cert ? daysLeft(cert.notAfter) : null;
  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <WidgetTitle title={widget.title} />
      <div className="flex min-h-0 flex-1 flex-col gap-1 p-2 text-xs">
        {!allowed ? (
          <p className="text-muted-foreground">{t("card.denied")}</p>
        ) : !status ? (
          <LoadingState compact label={t("card.loading")} />
        ) : (
          <>
            <span
              className={`text-base font-bold ${
                days !== null && days < 14 ? "text-destructive" : ""
              }`}
            >
              {days === null
                ? t("status.none")
                : t("card.daysLeft", { count: days })}
            </span>
            {cert && (
              <span className="truncate text-muted-foreground">
                {cert.names.join(", ")}
              </span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function certWidget(t: TermixApp["t"]): WidgetDefinition {
  return {
    id: "https_certificate",
    name: t("widget.name"),
    description: t("widget.description"),
    category: "monitoring",
    icon: null,
    defaultConfig: {},
    defaultSize: { w: 8 * GRID_SIZE, h: 4 * GRID_SIZE },
    minSize: { w: 5 * GRID_SIZE, h: 3 * GRID_SIZE },
    components: { view: CertWidget },
  };
}
