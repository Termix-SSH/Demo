import { useCallback, useEffect, useState } from "react";
import { Network } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge, ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { InterfaceView } from "../shared/types";
import { errorMessage, listInterfaces } from "./api";
import { Loading } from "./Loading";

export function InterfacesView({
  hostId,
  onOpen,
  isVisible,
}: {
  hostId: number;
  onOpen: (name: string) => void;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<InterfaceView[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await listInterfaces(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("interfaces.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!items) return <Loading />;

  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
        {t("interfaces.empty")}
      </p>
    );
  }

  return (
    <PanelList>
      {items.map((item, index) => (
        <ListRow
          key={item.name}
          stripe={index}
          icon={<Network className="size-4" />}
          title={item.name}
          tone={item.active ? "brand" : undefined}
          onClick={() => onOpen(item.name)}
          badges={
            <>
              <ListBadge>
                {item.active ? t("interfaces.up") : t("interfaces.down")}
              </ListBadge>
              <ListBadge>
                {t("interfaces.clients", { count: item.clients })}
              </ListBadge>
              {item.nat && <ListBadge>{t("interfaces.nat")}</ListBadge>}
              {item.enabled && <ListBadge>{t("interfaces.boot")}</ListBadge>}
            </>
          }
          meta={
            <span className="font-mono">
              {item.address.join(", ")} | UDP {item.listenPort}
            </span>
          }
        />
      ))}
    </PanelList>
  );
}
