import { RefreshCw } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { CertStatus } from "../shared/types";

/** How automatic renewal is set up on the host. Read only. */
export function RenewalView({ status }: { status: CertStatus }) {
  const { t } = useTranslation();
  const certbotOn = !!status.timer || status.certbotCron;
  const rows = [
    ...(status.certbot
      ? [
          {
            key: "certbot",
            title: "certbot",
            on: certbotOn,
            meta: status.timer
              ? [
                  t("renewal.timer"),
                  status.timerNext
                    ? t("renewal.next", { time: status.timerNext })
                    : "",
                ]
                  .filter(Boolean)
                  .join(" | ")
              : status.certbotCron
                ? t("renewal.cron")
                : t("renewal.certbotOff"),
          },
        ]
      : []),
    ...(status.acmesh
      ? [
          {
            key: "acme",
            title: "acme.sh",
            on: status.acmeCron,
            meta: status.acmeCron
              ? t("renewal.acmeCron")
              : t("renewal.acmeOff"),
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {t("renewal.hint")}
      </p>
      {rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("tab.noClient")}
        </p>
      ) : (
        <PanelList>
          {rows.map((row, index) => (
            <ListRow
              key={row.key}
              stripe={index}
              icon={<RefreshCw className="size-4" />}
              tone={row.on ? "success" : "warning"}
              title={row.title}
              badges={
                <ListBadge tone={row.on ? "success" : "warning"}>
                  {row.on ? t("renewal.on") : t("renewal.off")}
                </ListBadge>
              }
              meta={row.meta}
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
