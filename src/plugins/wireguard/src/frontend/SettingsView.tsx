import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { FormFooter, TextField, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import type { InterfaceView } from "../shared/types";
import { errorMessage, updateInterface } from "./api";

/** The port and the defaults used for new clients. */
export function SettingsView({
  hostId,
  item,
  onSaved,
}: {
  hostId: number;
  item: InterfaceView;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [listenPort, setListenPort] = useState(String(item.listenPort));
  const [endpoint, setEndpoint] = useState(item.endpoint);
  const [dns, setDns] = useState(item.dns);
  const [allowedIps, setAllowedIps] = useState(item.allowedIps);
  const [keepalive, setKeepalive] = useState(String(item.keepalive));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const dirty =
    listenPort !== String(item.listenPort) ||
    endpoint !== item.endpoint ||
    dns !== item.dns ||
    allowedIps !== item.allowedIps ||
    keepalive !== String(item.keepalive);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await updateInterface(hostId, item.name, {
        listenPort: Number(listenPort),
        endpoint: endpoint.trim(),
        dns: dns.trim(),
        allowedIps: allowedIps.trim(),
        keepalive: Number(keepalive),
      });
      toast.success(t("settings.saved"));
      onSaved();
    } catch (e) {
      setError(errorMessage(e, t("settings.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      chrome={false}
      footer={
        <FormFooter
          onSave={() => void save()}
          saving={saving}
          dirty={dirty}
          saveLabel={t("common.save")}
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        {item.publicKey && (
          <TextField
            label={t("settings.publicKey")}
            value={item.publicKey}
            onChange={() => undefined}
            mono
            disabled
          />
        )}
        <TextField
          label={t("settings.port")}
          value={listenPort}
          onChange={setListenPort}
          mono
        />
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
        <TextField
          label={t("settings.keepalive")}
          hint={t("settings.keepaliveHint")}
          value={keepalive}
          onChange={setKeepalive}
          mono
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </PanelShell>
  );
}
