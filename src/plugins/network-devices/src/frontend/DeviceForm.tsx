import { useState } from "react";
import { Network } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  InlineView,
  NumberField,
  SecretField,
  SectionCard,
  SelectField,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Device,
  DeviceInput,
  DeviceOptions,
  DriverId,
  DriverInfo,
} from "../shared/types";
import { errorMessage, type NetworkApi } from "./api";

export function DeviceForm({
  device,
  drivers,
  api,
  initial,
  onBack,
  onSave,
}: {
  device: Device | null;
  drivers: DriverInfo[];
  api: NetworkApi;
  // Filled when the form opens from a discovery result
  initial?: { address: string; driver: DriverId; name: string };
  onBack: () => void;
  onSave: (input: DeviceInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [driverId, setDriverId] = useState<DriverId>(
    device?.driver ?? initial?.driver ?? "snmp",
  );
  const driver = drivers.find((item) => item.id === driverId);
  const [name, setName] = useState(device?.name ?? initial?.name ?? "");
  const [address, setAddress] = useState(
    device?.address ?? initial?.address ?? "",
  );
  const [port, setPort] = useState<number | null>(device?.port ?? null);
  const [pollSeconds, setPollSeconds] = useState(device?.pollSeconds ?? 60);
  const [scheme, setScheme] = useState<"http" | "https">(
    device?.options.scheme ?? (driverId === "openwrt" ? "http" : "https"),
  );
  const [version, setVersion] = useState<"1" | "2c" | "3">(
    device?.options.snmpVersion ?? "2c",
  );
  const [ca, setCa] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const hasKeys = Object.values(keys).some((value) => value.trim());
  const canSave =
    !!name.trim() &&
    !!address.trim() &&
    !!driver &&
    !saving &&
    (!!device || hasKeys);

  function build(): DeviceInput {
    const options: DeviceOptions = { ...(device?.options ?? {}) };
    if (driver?.web) options.scheme = scheme;
    else delete options.scheme;
    if (driverId === "snmp") options.snmpVersion = version;
    return {
      name: name.trim(),
      driver: driverId,
      address: address.trim(),
      port,
      pollSeconds,
      options,
      ...(ca.trim() ? { ca: ca.trim() } : {}),
      ...(hasKeys ? { credentials: keys } : {}),
    };
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(build());
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    try {
      const info = await api.test(build());
      toast.success(t("form.testOk", { name: info.name }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  const visibleFields = (driver?.fields ?? []).filter((field) => {
    if (driverId !== "snmp") return true;
    const v3 = [
      "username",
      "authProtocol",
      "authKey",
      "privProtocol",
      "privKey",
    ];
    return version === "3" ? v3.includes(field.key) : !v3.includes(field.key);
  });

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<Network className="size-4" />}
      title={t(device ? "form.editTitle" : "form.addTitle")}
      status={device?.name}
      footer={
        <FormFooter
          saving={saving}
          disabled={!canSave}
          onCancel={onBack}
          onSave={() => void save()}
          saveLabel={t(device ? "form.save" : "form.add")}
        />
      }
    >
      <SectionCard
        title={t("form.device")}
        icon={<Network className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          {!device && (
            <SelectField
              label={t("form.type")}
              value={driverId}
              onChange={(value) => {
                setDriverId(value);
                setKeys({});
                setScheme(value === "openwrt" ? "http" : "https");
              }}
              options={drivers.map((item) => ({
                value: item.id,
                label: t(`drivers.${item.id}`),
              }))}
            />
          )}
          <TextField label={t("form.name")} value={name} onChange={setName} />
          <TextField
            label={t("form.address")}
            value={address}
            onChange={setAddress}
            placeholder="192.168.1.1"
            mono
          />
          <NumberField
            label={t("form.port")}
            value={port ?? driver?.defaultPort ?? 0}
            onChange={(value) =>
              setPort(value === driver?.defaultPort ? null : value)
            }
            min={1}
            max={65535}
          />
          <NumberField
            label={t("form.poll")}
            hint={t("form.pollHint")}
            value={pollSeconds}
            onChange={setPollSeconds}
            min={15}
            max={3600}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("form.access")}
        icon={<Network className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          {driverId === "snmp" && (
            <SelectField
              label={t("form.snmpVersion")}
              value={version}
              onChange={(value) => setVersion(value as typeof version)}
              options={[
                { value: "1", label: "SNMPv1" },
                { value: "2c", label: "SNMPv2c" },
                { value: "3", label: "SNMPv3" },
              ]}
            />
          )}
          {driver?.web && (
            <SelectField
              label={t("form.scheme")}
              value={scheme}
              onChange={(value) => setScheme(value as typeof scheme)}
              options={[
                { value: "https", label: "https" },
                { value: "http", label: "http" },
              ]}
            />
          )}
          {visibleFields.map((field) =>
            field.type === "select" ? (
              <SelectField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? field.options?.[0] ?? ""}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
                options={(field.options ?? []).map((option) => ({
                  value: option,
                  label: option,
                }))}
              />
            ) : field.type === "secret" ? (
              <SecretField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={device ? t("form.keepKeys") : undefined}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
              />
            ) : (
              <TextField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={device ? t("form.keepKeys") : undefined}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
              />
            ),
          )}
          {driver?.web && (
            <TextAreaField
              label={t("form.ca")}
              hint={t(device?.hasCa ? "form.caSet" : "form.caHint")}
              value={ca}
              onChange={setCa}
              rows={4}
              mono
            />
          )}
          <div>
            <button
              type="button"
              disabled={testing || !address.trim() || !hasKeys}
              onClick={() => void test()}
              className="border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {t("form.test")}
            </button>
            {device && !hasKeys && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("form.testNeedsKeys")}
              </p>
            )}
          </div>
        </div>
      </SectionCard>
    </InlineView>
  );
}
