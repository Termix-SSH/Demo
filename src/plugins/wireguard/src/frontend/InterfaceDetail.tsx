import { useCallback, useEffect, useState } from "react";
import { Network } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { BackButton, PanelShell, Segmented } from "@termix-ssh/plugin-sdk/ui";
import type { InterfaceView, WireguardStatus } from "../shared/types";
import { errorMessage, listInterfaces } from "./api";
import { Loading } from "./Loading";
import { ClientsView } from "./ClientsView";
import { ConfigView } from "./ConfigView";
import { ServiceView } from "./ServiceView";
import { SettingsView } from "./SettingsView";

type Section = "clients" | "settings" | "config" | "service";

/** One interface in full: clients, settings, raw config and the service. */
export function InterfaceDetail({
  hostId,
  name,
  status,
  onClose,
  reload,
}: {
  hostId: number;
  name: string;
  status: WireguardStatus;
  onClose: () => void;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const [item, setItem] = useState<InterfaceView | null>(null);
  const [failed, setFailed] = useState("");
  const [section, setSection] = useState<Section>("clients");
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const all = await listInterfaces(hostId);
      const found = all.find((i) => i.name === name) ?? null;
      setItem(found);
      setFailed(found ? "" : t("detail.gone"));
    } catch (e) {
      setFailed(errorMessage(e, t("interfaces.loadFailed")));
    }
  }, [hostId, name, t]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  const changed = () => {
    setTick((n) => n + 1);
    reload();
  };

  return (
    <PanelShell
      icon={<Network className="size-4" />}
      leading={<BackButton onClick={onClose} />}
      title={name}
      status={
        item
          ? `${item.active ? t("interfaces.up") : t("interfaces.down")} | ${item.address.join(", ")}`
          : undefined
      }
      toolbar={
        <Segmented<Section>
          value={section}
          onChange={setSection}
          options={[
            { value: "clients", label: t("detail.clients") },
            { value: "settings", label: t("detail.settings") },
            { value: "config", label: t("detail.config") },
            { value: "service", label: t("detail.service") },
          ]}
        />
      }
      className="gap-2 p-2.5"
    >
      <div className="flex shrink-0 flex-col gap-2">
        {failed ? (
          <p className="p-2 text-sm text-destructive">{failed}</p>
        ) : !item ? (
          <Loading />
        ) : section === "clients" ? (
          <ClientsView hostId={hostId} item={item} />
        ) : section === "settings" ? (
          <SettingsView
            key={tick}
            hostId={hostId}
            item={item}
            onSaved={changed}
          />
        ) : section === "config" ? (
          <ConfigView key={tick} hostId={hostId} name={name} />
        ) : (
          <ServiceView
            hostId={hostId}
            item={item}
            status={status}
            onChanged={changed}
            onDeleted={() => {
              reload();
              onClose();
            }}
          />
        )}
      </div>
    </PanelShell>
  );
}
