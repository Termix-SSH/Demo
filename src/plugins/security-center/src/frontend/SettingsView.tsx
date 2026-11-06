import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, NumberField, SwitchRow } from "@termix-ssh/plugin-sdk/ui";
import type { HostConfig } from "../shared/types";
import { errorMessage, saveConfig } from "./api";

/** Alerts, how often to check and the key limits. */
export function SettingsView({
  hostId,
  config,
  canEdit,
  onSaved,
}: {
  hostId: number;
  config: HostConfig;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [alerts, setAlerts] = useState(config.alerts);
  const [interval, setIntervalMin] = useState(config.intervalMin);
  const [scanEvery, setScanEvery] = useState(config.vulnIntervalH);
  const [rsa, setRsa] = useState(config.minRsaBits);
  const [age, setAge] = useState(config.keyMaxAgeDays);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig(hostId, {
        alerts,
        intervalMin: interval,
        vulnIntervalH: scanEvery,
        minRsaBits: rsa,
        keyMaxAgeDays: age,
      });
      toast.success(t("settings.saved"));
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <SwitchRow
        label={t("settings.alerts")}
        description={t("settings.alertsHint")}
        checked={alerts}
        onChange={setAlerts}
      />
      <NumberField
        label={t("settings.interval")}
        value={interval}
        onChange={setIntervalMin}
        min={15}
        max={1440}
        hint={t("settings.intervalHint")}
      />
      <NumberField
        label={t("settings.scanEvery")}
        value={scanEvery}
        onChange={setScanEvery}
        min={1}
        max={168}
        hint={t("settings.scanEveryHint")}
      />
      <NumberField
        label={t("settings.rsa")}
        value={rsa}
        onChange={setRsa}
        min={2048}
        max={8192}
        hint={t("settings.rsaHint")}
      />
      <NumberField
        label={t("settings.age")}
        value={age}
        onChange={setAge}
        min={0}
        max={3650}
        hint={t("settings.ageHint")}
      />
      <div>
        <Button
          size="sm"
          disabled={!canEdit || saving}
          onClick={() => void save()}
        >
          {t("common.save")}
        </Button>
      </div>
    </div>
  );
}
