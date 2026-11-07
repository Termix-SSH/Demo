import { Bug, KeyRound, ShieldCheck, TriangleAlert } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  InfoGrid,
  ListBadge,
  ListRow,
  PanelList,
  StatTile,
  TileStack,
  TileWall,
} from "@termix-ssh/plugin-sdk/ui";
import type { HostView } from "./api";
import { severityTone, statTone } from "./format";

/** Score, counts and every finding for one host. */
export function OverviewView({
  data,
  onOpen,
}: {
  data: HostView;
  onOpen: (view: "keys" | "vulns") => void;
}) {
  const { t } = useTranslation();
  const reading = data.reading;
  const scan = data.scan;
  const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 } as const;
  const findings = [...data.findings].sort(
    (a, b) => order[a.severity] - order[b.severity],
  );
  const exploited = scan?.kev ?? 0;
  const critical = scan?.critical ?? 0;

  return (
    <TileStack>
      <TileWall minWidth={160}>
        <StatTile
          label={t("overview.score")}
          icon={<ShieldCheck className="size-3.5" />}
          value={data.score ?? "-"}
          unit="/ 100"
          percent={data.score ?? undefined}
          tone={statTone(data.status)}
        />
        <StatTile
          label={t("overview.findings")}
          icon={<TriangleAlert className="size-3.5" />}
          value={findings.length}
          tone={findings.length ? "warn" : "ok"}
        />
        <StatTile
          label={t("overview.keys")}
          icon={<KeyRound className="size-3.5" />}
          value={reading?.keys.length ?? 0}
          onClick={() => onOpen("keys")}
        />
        <StatTile
          label={t("overview.vulns")}
          icon={<Bug className="size-3.5" />}
          value={scan ? scan.total : "-"}
          hint={
            exploited
              ? t("overview.exploited", { count: exploited })
              : critical
                ? t("overview.critical", { count: critical })
                : undefined
          }
          tone={exploited || critical ? "bad" : scan ? "ok" : "default"}
          onClick={() => onOpen("vulns")}
        />
      </TileWall>
      {reading && (
        <div className="p-3">
          <InfoGrid
            items={[
              { label: t("overview.os"), value: reading.os.name || "-" },
              {
                label: t("overview.sshd"),
                value: reading.sshdVersion || "-",
              },
              {
                label: t("overview.access"),
                value: reading.root
                  ? t("overview.root")
                  : t("overview.notRoot"),
              },
              {
                label: t("overview.reboot"),
                value: reading.rebootRequired
                  ? t("overview.rebootYes")
                  : t("overview.rebootNo"),
              },
            ]}
          />
        </div>
      )}
      {reading && !reading.root && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("overview.noRoot")}
        </p>
      )}
      <div>
        {findings.length === 0 ? (
          <EmptyState icon={ShieldCheck} title={t("overview.clean")} />
        ) : (
          <PanelList className="[&>*:last-child]:border-b-0">
            {findings.map((f, index) => (
              <ListRow
                key={f.key}
                stripe={index}
                tone={severityTone(f.severity)}
                title={f.title}
                meta={f.detail}
                badges={
                  <ListBadge tone={severityTone(f.severity)}>
                    {t(`severity.${f.severity}`)}
                  </ListBadge>
                }
              />
            ))}
          </PanelList>
        )}
      </div>
    </TileStack>
  );
}
