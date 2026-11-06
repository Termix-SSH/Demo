import { useEffect, useState } from "react";
import { Boxes } from "lucide-react";
import {
  usePermission,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import type { FleetRow, FleetsApi } from "./fleets-api.js";

const POLL_MS = 5 * 60_000;

/** Dashboard card: each fleet with how many hosts it has. */
export function createFleetsCard(api: FleetsApi, inventoryTab: string) {
  return function FleetsCard({ isVisible, shell }: DashboardCardProps) {
    const { t } = useTranslation();
    const canView = usePermission("view");
    const [fleets, setFleets] = useState<FleetRow[] | null>(null);

    useEffect(() => {
      if (!isVisible || !canView) return;
      const load = () =>
        api
          .list()
          .then(setFleets)
          .catch(() => setFleets([]));
      void load();
      const timer = setInterval(() => void load(), POLL_MS);
      return () => clearInterval(timer);
    }, [isVisible, canView]);

    if (!canView) return null;
    if (!fleets) {
      return <LoadingState compact label={t("card.loading")} />;
    }
    return (
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
        }
      >
        {fleets.map((fleet, index) => (
          <ListRow
            key={fleet.id}
            stripe={index}
            icon={<Boxes className="size-3.5" />}
            title={fleet.name}
            meta={t("card.hosts", { count: fleet.memberCount })}
            onClick={() =>
              shell.openSingletonTab(inventoryTab, {
                data: { fleetId: fleet.id },
              })
            }
          />
        ))}
      </PanelList>
    );
  };
}
