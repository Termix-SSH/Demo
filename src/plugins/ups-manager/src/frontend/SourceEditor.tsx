import { useEffect, useState } from "react";
import { BatteryCharging } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FormFooter,
  InlineView,
  NumberField,
  SecretField,
  SelectField,
  SwitchRow,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Backend,
  Detect,
  SourceInput,
  SourceSecrets,
  SourceView,
} from "../shared/types";
import { errorMessage, getDetect, testSource } from "./api";
import { formatNumber, formatRuntime, stateKey } from "./format";

interface Props {
  hostId: number;
  source: SourceView | null;
  onClose: () => void;
  onSave: (input: SourceInput, clearSecrets: boolean) => Promise<boolean>;
  busy: boolean;
}

/** Add or change one UPS. Saved secrets are never shown, only kept or replaced. */
export function SourceEditor({ hostId, source, onClose, onSave, busy }: Props) {
  const { t } = useTranslation();
  const [backend, setBackend] = useState<Backend>(source?.backend ?? "nut");
  const [label, setLabel] = useState(source?.label ?? "");
  const [target, setTarget] = useState(source?.target ?? "");
  const [version, setVersion] = useState<"1" | "2c" | "3">(
    source?.snmpVersion ?? "2c",
  );
  const [lowCharge, setLowCharge] = useState(source?.lowCharge ?? 30);
  const [lowRuntime, setLowRuntime] = useState(source?.lowRuntimeMin ?? 5);
  const [alerts, setAlerts] = useState(source?.alerts ?? true);
  const [enabled, setEnabled] = useState(source?.enabled ?? true);
  const [secrets, setSecrets] = useState<SourceSecrets>({});
  const [clear, setClear] = useState(false);
  const [detect, setDetect] = useState<Detect | null>(null);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    getDetect(hostId)
      .then((d) => live && setDetect(d))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hostId]);

  const patch = (change: Partial<SourceSecrets>) =>
    setSecrets((s) => ({ ...s, ...change }));

  const input = (): SourceInput => ({
    backend,
    label: label.trim(),
    target: target.trim(),
    snmpVersion: version,
    lowCharge,
    lowRuntimeMin: lowRuntime,
    alerts,
    enabled,
    secrets,
  });

  const test = async () => {
    setTesting(true);
    setResult("");
    setError("");
    try {
      const reading = await testSource(hostId, {
        ...input(),
        id: source?.id,
      });
      setResult(
        t("editor.testOk", {
          state: t(stateKey(reading.state)),
          charge: formatNumber(reading.chargePct),
          runtime: formatRuntime(reading.runtimeSec),
        }),
      );
    } catch (e) {
      setError(errorMessage(e, t("editor.testFailed")));
    } finally {
      setTesting(false);
    }
  };

  const hint =
    backend === "nut"
      ? detect?.nutUps.length
        ? t("editor.nutFound", { names: detect.nutUps.join(", ") })
        : detect && !detect.upsc
          ? t("editor.nutMissing")
          : t("editor.nutHint")
      : backend === "apcupsd"
        ? detect && !detect.apcaccess
          ? t("editor.apcMissing")
          : t("editor.apcHint")
        : detect && !detect.snmpwalk
          ? t("editor.snmpMissing")
          : t("editor.snmpHint");

  return (
    <InlineView
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={source ? t("editor.editTitle") : t("editor.addTitle")}
      icon={<BatteryCharging className="size-4" />}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() =>
            void onSave(input(), clear).then((ok) => ok && onClose())
          }
          saving={busy}
          dirty
          cancelLabel={t("common.cancel")}
          saveLabel={source ? t("common.save") : t("editor.add")}
          extra={
            <Button
              size="sm"
              variant="outline"
              disabled={testing}
              onClick={() => void test()}
            >
              {testing ? t("editor.testing") : t("editor.test")}
            </Button>
          }
        />
      }
      scroll
    >
      <div className="flex flex-col gap-3 p-3">
        <SelectField<Backend>
          label={t("editor.backend")}
          value={backend}
          onChange={(value) => {
            setBackend(value);
            setTarget("");
            setClear(false);
          }}
          options={[
            { value: "nut", label: t("backend.nut") },
            { value: "apcupsd", label: t("backend.apcupsd") },
            { value: "snmp", label: t("backend.snmp") },
          ]}
        />
        <TextField
          label={t("editor.label")}
          value={label}
          onChange={setLabel}
          placeholder={t("editor.labelPlaceholder")}
        />
        <TextField
          label={t(`editor.target.${backend}`)}
          value={target}
          onChange={setTarget}
          placeholder={t(`editor.targetPlaceholder.${backend}`)}
          hint={hint}
          mono
        />

        {backend === "nut" && (
          <>
            <TextField
              label={t("editor.nutUser")}
              value={secrets.nutUser ?? ""}
              onChange={(nutUser) => patch({ nutUser })}
              hint={t("editor.nutLoginHint")}
              placeholder={source?.hasSecrets ? t("editor.saved") : ""}
            />
            <SecretField
              label={t("editor.nutPassword")}
              value={secrets.nutPassword ?? ""}
              onChange={(nutPassword) => patch({ nutPassword })}
              placeholder={source?.hasSecrets ? t("editor.saved") : ""}
            />
          </>
        )}

        {backend === "snmp" && (
          <>
            <SelectField<"1" | "2c" | "3">
              label={t("editor.snmpVersion")}
              value={version}
              onChange={setVersion}
              options={[
                { value: "1", label: "v1" },
                { value: "2c", label: "v2c" },
                { value: "3", label: "v3" },
              ]}
            />
            {version !== "3" ? (
              <SecretField
                label={t("editor.community")}
                value={secrets.community ?? ""}
                onChange={(community) => patch({ community })}
                placeholder={source?.hasSecrets ? t("editor.saved") : "public"}
              />
            ) : (
              <>
                <TextField
                  label={t("editor.v3User")}
                  value={secrets.v3User ?? ""}
                  onChange={(v3User) => patch({ v3User })}
                />
                <SelectField<NonNullable<SourceSecrets["v3Level"]>>
                  label={t("editor.v3Level")}
                  value={secrets.v3Level ?? "noAuthNoPriv"}
                  onChange={(v3Level) => patch({ v3Level })}
                  options={[
                    { value: "noAuthNoPriv", label: t("editor.v3.noAuth") },
                    { value: "authNoPriv", label: t("editor.v3.auth") },
                    { value: "authPriv", label: t("editor.v3.authPriv") },
                  ]}
                />
                {(secrets.v3Level ?? "noAuthNoPriv") !== "noAuthNoPriv" && (
                  <>
                    <SelectField<NonNullable<SourceSecrets["v3AuthProto"]>>
                      label={t("editor.v3AuthProto")}
                      value={secrets.v3AuthProto ?? "SHA"}
                      onChange={(v3AuthProto) => patch({ v3AuthProto })}
                      options={[
                        { value: "SHA", label: "SHA" },
                        { value: "MD5", label: "MD5" },
                      ]}
                    />
                    <SecretField
                      label={t("editor.v3AuthPass")}
                      value={secrets.v3AuthPass ?? ""}
                      onChange={(v3AuthPass) => patch({ v3AuthPass })}
                      placeholder={source?.hasSecrets ? t("editor.saved") : ""}
                    />
                  </>
                )}
                {secrets.v3Level === "authPriv" && (
                  <>
                    <SelectField<NonNullable<SourceSecrets["v3PrivProto"]>>
                      label={t("editor.v3PrivProto")}
                      value={secrets.v3PrivProto ?? "AES"}
                      onChange={(v3PrivProto) => patch({ v3PrivProto })}
                      options={[
                        { value: "AES", label: "AES" },
                        { value: "DES", label: "DES" },
                      ]}
                    />
                    <SecretField
                      label={t("editor.v3PrivPass")}
                      value={secrets.v3PrivPass ?? ""}
                      onChange={(v3PrivPass) => patch({ v3PrivPass })}
                      placeholder={source?.hasSecrets ? t("editor.saved") : ""}
                    />
                  </>
                )}
              </>
            )}
          </>
        )}

        {source?.hasSecrets && backend !== "apcupsd" && (
          <SwitchRow
            label={t("editor.clearSecrets")}
            description={t("editor.clearSecretsHint")}
            checked={clear}
            onChange={setClear}
          />
        )}

        <NumberField
          label={t("editor.lowCharge")}
          value={lowCharge}
          onChange={setLowCharge}
          min={1}
          max={99}
          hint={t("editor.lowChargeHint")}
        />
        <NumberField
          label={t("editor.lowRuntime")}
          value={lowRuntime}
          onChange={setLowRuntime}
          min={0}
          max={600}
          hint={t("editor.lowRuntimeHint")}
        />
        <SwitchRow
          label={t("editor.alerts")}
          description={t("editor.alertsHint")}
          checked={alerts}
          onChange={setAlerts}
        />
        <SwitchRow
          label={t("editor.enabled")}
          description={t("editor.enabledHint")}
          checked={enabled}
          onChange={setEnabled}
        />
        {result && <p className="text-xs text-green-500">{result}</p>}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    </InlineView>
  );
}
