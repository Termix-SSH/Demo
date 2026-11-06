import { useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
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
import { errorMessage, type KvmApi } from "./api";

const NONE = "none";

export function DeviceForm({
  device,
  drivers,
  api,
  onBack,
  onSave,
}: {
  device: Device | null;
  drivers: DriverInfo[];
  api: KvmApi;
  onBack: () => void;
  onSave: (input: DeviceInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const [driverId, setDriverId] = useState<DriverId>(device?.driver ?? "pikvm");
  const driver = drivers.find((item) => item.id === driverId);
  const [name, setName] = useState(device?.name ?? "");
  const [address, setAddress] = useState(device?.address ?? "");
  const [port, setPort] = useState<number | null>(device?.port ?? null);
  const [pollSeconds, setPollSeconds] = useState(device?.pollSeconds ?? 60);
  const [hostId, setHostId] = useState(
    device?.hostId ? String(device.hostId) : NONE,
  );
  const [scheme, setScheme] = useState<"http" | "https">(
    device?.options.scheme ?? (driverId === "pikvm" ? "https" : "http"),
  );
  const [mac, setMac] = useState(device?.options.mac ?? "");
  const [broadcast, setBroadcast] = useState(device?.options.broadcast ?? "");
  const [ca, setCa] = useState("");
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const hasKeys = Object.values(keys).some((value) => value.trim());
  const needsKeys = !!driver?.fields.some((field) => field.required);
  const canSave =
    !!name.trim() &&
    !!address.trim() &&
    !!driver &&
    !saving &&
    (!!device || hasKeys || !needsKeys);

  const hostOptions = [
    { value: NONE, label: t("form.noHost") },
    ...hosts.map((host) => ({
      value: String(host.id),
      label: host.name || host.ip,
    })),
  ];

  function build(): DeviceInput {
    const options: DeviceOptions = { scheme };
    if (mac.trim()) options.mac = mac.trim();
    if (broadcast.trim()) options.broadcast = broadcast.trim();
    return {
      name: name.trim(),
      driver: driverId,
      address: address.trim(),
      port,
      pollSeconds,
      hostId: hostId === NONE ? null : Number(hostId),
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
      const reading = await api.test(build());
      toast.success(
        t("form.testOk", { model: reading.model ?? t(`drivers.${driverId}`) }),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setTesting(false);
    }
  }

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<MonitorSmartphone className="size-4" />}
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
        icon={<MonitorSmartphone className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          {!device && (
            <SelectField
              label={t("form.type")}
              value={driverId}
              onChange={(value) => {
                setDriverId(value as DriverId);
                setKeys({});
                setPort(null);
                setScheme(value === "pikvm" ? "https" : "http");
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
            placeholder="192.168.1.60"
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
          <SelectField
            label={t("form.host")}
            hint={t("form.hostHint")}
            value={hostId}
            onChange={setHostId}
            options={hostOptions}
          />
          <NumberField
            label={t("form.poll")}
            hint={t("form.pollHint")}
            value={pollSeconds}
            onChange={setPollSeconds}
            min={30}
            max={3600}
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("form.access")}
        icon={<MonitorSmartphone className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          <SelectField
            label={t("form.scheme")}
            value={scheme}
            onChange={(value) => setScheme(value as typeof scheme)}
            options={[
              { value: "https", label: "https" },
              { value: "http", label: "http" },
            ]}
          />
          {driver?.fields.map((field) =>
            field.type === "secret" ? (
              <SecretField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={device ? t("form.keepLogin") : undefined}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
              />
            ) : (
              <TextField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={device ? t("form.keepLogin") : undefined}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
              />
            ),
          )}
          {scheme === "https" && (
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
              disabled={testing || !address.trim() || (needsKeys && !hasKeys)}
              onClick={() => void test()}
              className="border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-50"
            >
              {t("form.test")}
            </button>
            {device && needsKeys && !hasKeys && (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("form.testNeedsLogin")}
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("form.machine")}
        icon={<MonitorSmartphone className="size-3.5" />}
      >
        <div className="flex flex-col gap-4 py-3">
          <TextField
            label={t("form.mac")}
            hint={t("form.macHint")}
            value={mac}
            onChange={setMac}
            placeholder="aa:bb:cc:dd:ee:ff"
            mono
          />
          <TextField
            label={t("form.broadcast")}
            hint={t("form.broadcastHint")}
            value={broadcast}
            onChange={setBroadcast}
            placeholder="192.168.1.255"
            mono
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
