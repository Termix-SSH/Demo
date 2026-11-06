import { useState } from "react";
import { Radar } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  PanelShell,
  SecretField,
  SelectField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import { Plus } from "lucide-react";
import type { DiscoveryResult } from "../shared/types";
import { errorMessage, type NetworkApi } from "./api";

export function Discover({
  api,
  onBack,
  onAdd,
}: {
  api: NetworkApi;
  onBack: () => void;
  onAdd: (result: DiscoveryResult) => void;
}) {
  const { t } = useTranslation();
  const [cidr, setCidr] = useState("192.168.1.0/24");
  const [community, setCommunity] = useState("");
  const [version, setVersion] = useState<"1" | "2c">("2c");
  const [results, setResults] = useState<DiscoveryResult[] | null>(null);
  const [scanning, setScanning] = useState(false);

  async function scan() {
    setScanning(true);
    try {
      setResults(await api.discover(cidr.trim(), community, version));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setScanning(false);
    }
  }

  return (
    <PanelShell
      icon={<Radar className="size-4" />}
      title={t("discover.title")}
      leading={<BackButton onClick={onBack} label={t("back")} />}
    >
      <div className="flex flex-col gap-3 border-b border-border p-3">
        <p className="text-xs text-muted-foreground">{t("discover.hint")}</p>
        <TextField
          label={t("discover.range")}
          value={cidr}
          onChange={setCidr}
          mono
        />
        <SelectField
          label={t("form.snmpVersion")}
          value={version}
          onChange={(value) => setVersion(value as typeof version)}
          options={[
            { value: "1", label: "SNMPv1" },
            { value: "2c", label: "SNMPv2c" },
          ]}
        />
        <SecretField
          label={t("fields.community")}
          value={community}
          onChange={setCommunity}
        />
        <div>
          <button
            type="button"
            disabled={scanning || !cidr.trim() || !community.trim()}
            onClick={() => void scan()}
            className="border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
          >
            {t(scanning ? "discover.scanning" : "discover.scan")}
          </button>
        </div>
      </div>
      {scanning && <LoadingState />}
      {results && !scanning && (
        <PanelList
          empty={<EmptyState icon={Radar} title={t("discover.none")} />}
        >
          {results.map((result, index) => (
            <ListRow
              key={result.address}
              stripe={index}
              icon={<Radar />}
              title={result.name}
              badges={
                result.added ? (
                  <ListBadge>{t("discover.added")}</ListBadge>
                ) : null
              }
              meta={[result.address, result.description]
                .filter(Boolean)
                .join(" | ")}
              actions={
                result.added ? undefined : (
                  <ListRowAction
                    label={t("add")}
                    tone="brand"
                    onClick={() => onAdd(result)}
                  >
                    <Plus />
                  </ListRowAction>
                )
              }
            />
          ))}
        </PanelList>
      )}
    </PanelShell>
  );
}
