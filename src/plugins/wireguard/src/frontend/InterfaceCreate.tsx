import { useState } from "react";
import { Network } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  FormFooter,
  PanelShell,
  SwitchRow,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { WireguardStatus } from "../shared/types";
import { createInterface, errorMessage } from "./api";

/** The form for a new server interface. */
export function InterfaceCreate({
  hostId,
  status,
  onClose,
  reload,
}: {
  hostId: number;
  status: WireguardStatus;
  onClose: () => void;
  reload: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("wg0");
  const [address, setAddress] = useState("10.8.0.1/24");
  const [listenPort, setListenPort] = useState("51820");
  const [endpoint, setEndpoint] = useState("");
  const [dns, setDns] = useState("1.1.1.1");
  const [allowedIps, setAllowedIps] = useState("0.0.0.0/0, ::/0");
  const [nat, setNat] = useState(status.iptables);
  const [forwarding, setForwarding] = useState(true);
  const [openFirewall, setOpenFirewall] = useState(status.firewall !== "none");
  const [start, setStart] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await createInterface(hostId, {
        name: name.trim(),
        address: address.trim(),
        listenPort: Number(listenPort),
        endpoint: endpoint.trim(),
        dns: dns.trim(),
        allowedIps: allowedIps.trim(),
        keepalive: 25,
        nat,
        forwarding,
        openFirewall,
        start,
      });
      toast.success(t("create.done"));
      reload();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("create.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      icon={<Network className="size-4" />}
      leading={<BackButton onClick={onClose} />}
      title={t("create.title")}
    >
      <div className="flex shrink-0 flex-col gap-3 p-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <TextField
            label={t("create.name")}
            value={name}
            onChange={setName}
            placeholder="wg0"
            mono
          />
          <TextField
            label={t("create.address")}
            hint={t("create.addressHint")}
            value={address}
            onChange={setAddress}
            mono
          />
          <TextField
            label={t("create.port")}
            value={listenPort}
            onChange={setListenPort}
            mono
          />
        </div>
        <TextField
          label={t("settings.endpoint")}
          hint={t("settings.endpointHint")}
          value={endpoint}
          onChange={setEndpoint}
          placeholder="vpn.example.com:51820"
          mono
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TextField
            label={t("settings.dns")}
            hint={t("settings.dnsHint")}
            value={dns}
            onChange={setDns}
            mono
          />
          <TextField
            label={t("settings.allowed")}
            hint={t("settings.allowedHint")}
            value={allowedIps}
            onChange={setAllowedIps}
            mono
          />
        </div>
        <SwitchRow
          label={t("create.nat")}
          description={
            status.iptables ? t("create.natDesc") : t("create.natMissing")
          }
          checked={nat}
          disabled={!status.iptables}
          onChange={setNat}
        />
        <SwitchRow
          label={t("create.forwarding")}
          description={t("create.forwardingDesc")}
          checked={forwarding}
          onChange={setForwarding}
        />
        <SwitchRow
          label={t("create.firewall")}
          description={t("create.firewallDesc")}
          checked={openFirewall}
          onChange={setOpenFirewall}
        />
        <SwitchRow
          label={t("create.start")}
          description={t("create.startDesc")}
          checked={start}
          onChange={setStart}
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          saveLabel={t("create.save")}
          cancelLabel={t("common.cancel")}
          disabled={!name.trim() || !address.trim() || !listenPort.trim()}
        />
      </div>
    </PanelShell>
  );
}
