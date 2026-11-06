import { useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, NumberField, SwitchRow } from "@termix-ssh/plugin-sdk/ui";
import type { HostConfig } from "../shared/types";
import { errorMessage, saveConfig } from "./api";

/** Alerts, how often to read and when a drive counts as too hot or worn. */
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
  const [warn, setWarn] = useState(config.tempWarnC);
  const [crit, setCrit] = useState(config.tempCritC);
  const [wear, setWear] = useState(config.wearWarnPct);
  const [thin, setThin] = useState(config.thinWarnPct);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveConfig(hostId, {
        alerts,
        intervalMin: interval,
        tempWarnC: warn,
        tempCritC: crit,
        wearWarnPct: wear,
        thinWarnPct: thin,
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
        min={5}
        max={1440}
        hint={t("settings.intervalHint")}
      />
      <NumberField
        label={t("settings.tempWarn")}
        value={warn}
        onChange={setWarn}
        min={0}
        max={120}
        hint={t("settings.tempHint")}
      />
      <NumberField
        label={t("settings.tempCrit")}
        value={crit}
        onChange={setCrit}
        min={0}
        max={150}
        hint={t("settings.tempHint")}
      />
      <NumberField
        label={t("settings.wear")}
        value={wear}
        onChange={setWear}
        min={1}
        max={94}
        hint={t("settings.wearHint")}
      />
      <NumberField
        label={t("settings.thin")}
        value={thin}
        onChange={setThin}
        min={1}
        max={94}
        hint={t("settings.thinHint")}
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
