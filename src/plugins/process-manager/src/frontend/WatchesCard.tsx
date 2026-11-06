import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import {
  useHosts,
  usePermission,
  useTabs,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { WatchView } from "../shared/types";
import { errorMessage, listAllWatches } from "./api";

const POLL_MS = 30_000;

/** Dashboard card: every watch with the last state seen, broken first. */
export function WatchesCard({ isVisible }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const tabs = useTabs();
  const { hosts } = useHosts();
  const [watches, setWatches] = useState<WatchView[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setWatches(await listAllWatches());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("watches.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, allowed, load]);

  if (failed) return <p className="p-3 text-xs text-destructive">{failed}</p>;
  if (!watches) {
    return <LoadingState compact label={t("tab.loading")} />;
  }

  const sorted = [...watches].sort(
    (a, b) => Number(b.state === "down") - Number(a.state === "down"),
  );

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {sorted.map((watch, index) => {
        const host = hosts.find((h) => Number(h.id) === watch.hostId);
        return (
          <ListRow
            key={watch.id}
            stripe={index}
            tone={
              watch.state === "down"
                ? "destructive"
                : watch.state === "up"
                  ? "success"
                  : "muted"
            }
            icon={<Activity className="size-3.5" />}
            title={<span className="font-mono text-xs">{watch.target}</span>}
            meta={`${host?.name || host?.ip || `#${watch.hostId}`} | ${t(`watch.rule.${watch.rule}`)}`}
            badges={
              <ListBadge
                tone={
                  watch.state === "down"
                    ? "destructive"
                    : watch.state === "up"
                      ? "success"
                      : "muted"
                }
              >
                {watch.state === "down"
                  ? t("watches.broken")
                  : watch.state === "up"
                    ? t("watches.fine")
                    : t("card.unknown")}
              </ListBadge>
            }
            onClick={() => host && tabs.openTab(host, "process-manager")}
          />
        );
      })}
    </PanelList>
  );
}
