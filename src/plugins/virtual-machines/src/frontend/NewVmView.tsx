import { useEffect, useState } from "react";
import { MonitorCog } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Field,
  FormFooter,
  InlineView,
  Input,
  NumberField,
  SectionCard,
  SelectField,
  SwitchRow,
  Textarea,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  CloudImage,
  HypervisorStatus,
  NewVm,
  PoolRow,
  VmSource,
  VolumeRow,
} from "../shared/types";
import { createVm, getImages, getNetworks, getVolumes } from "./api";
import { useAction } from "./useAction";

type SourceType = VmSource["type"];
const CUSTOM = "custom";

/** Makes a new VM. The host does the work in a job. */
export function NewVmView({
  open,
  onOpenChange,
  hostId,
  status,
  pools,
  onStarted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hostId: number;
  status: HypervisorStatus;
  pools: PoolRow[];
  onStarted: () => void;
}) {
  const { t } = useTranslation();
  const action = useAction();
  const [name, setName] = useState("");
  const [vcpus, setVcpus] = useState(2);
  const [memoryMib, setMemoryMib] = useState(2048);
  const [diskGib, setDiskGib] = useState(20);
  const [pool, setPool] = useState("");
  const [firmware, setFirmware] = useState<"bios" | "uefi">("bios");
  const [networks, setNetworks] = useState<string[]>([]);
  const [networkType, setNetworkType] = useState<"network" | "bridge">(
    "network",
  );
  const [network, setNetwork] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>("cloud");
  const [images, setImages] = useState<CloudImage[]>([]);
  const [image, setImage] = useState("");
  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [sshKey, setSshKey] = useState("");
  const [isos, setIsos] = useState<VolumeRow[]>([]);
  const [iso, setIso] = useState("");
  const [autostart, setAutostart] = useState(false);
  const [start, setStart] = useState(true);

  useEffect(() => {
    if (!open) return;
    setPool((old) => old || pools[0]?.name || "");
    getImages()
      .then((rows) => {
        setImages(rows);
        setImage((old) => old || rows[0]?.id || CUSTOM);
      })
      .catch(() => undefined);
    getNetworks(hostId)
      .then((rows) => {
        setNetworks(rows.map((row) => row.name));
        setNetwork((old) => old || rows[0]?.name || "");
      })
      .catch(() => undefined);
  }, [open, hostId, pools]);

  useEffect(() => {
    if (!open || !pool) return;
    getVolumes(hostId, pool)
      .then((rows) => setIsos(rows.filter((r) => r.name.endsWith(".iso"))))
      .catch(() => setIsos([]));
  }, [open, hostId, pool]);

  const source = (): VmSource => {
    if (sourceType === "iso") return { type: "iso", volume: iso };
    if (sourceType === "blank") return { type: "blank" };
    return {
      type: "cloud",
      image: image === CUSTOM ? "" : image,
      url: image === CUSTOM ? url : "",
      username,
      password,
      sshKey,
    };
  };

  const submit = async () => {
    const input: NewVm = {
      name: name.trim(),
      vcpus,
      memoryMib,
      diskGib,
      pool,
      firmware,
      network: { type: networkType, source: network },
      source: source(),
      autostart,
      start,
    };
    const ok = await action.run(
      () => createVm(hostId, input),
      t("new.started"),
    );
    if (ok) {
      setPassword("");
      setName("");
      onStarted();
    }
  };

  const cloud = sourceType === "cloud";
  const ready =
    name.trim() &&
    pool &&
    network &&
    (sourceType !== "iso" || iso) &&
    (!cloud || password || sshKey.trim());

  return (
    <InlineView
      open={open}
      onOpenChange={onOpenChange}
      title={t("new.title")}
      icon={<MonitorCog className="size-4" />}
      stacked
      footer={
        <FormFooter
          saving={action.busy}
          dirty={!!name.trim()}
          disabled={!ready}
          saveLabel={t("new.create")}
          cancelLabel={t("common.cancel")}
          onCancel={() => onOpenChange(false)}
          onSave={() => void submit()}
        />
      }
    >
      <SectionCard
        title={t("new.basics")}
        icon={<MonitorCog className="size-3.5" />}
      >
        <div className="flex flex-col gap-3 py-3">
          <TextField
            label={t("new.name")}
            value={name}
            onChange={setName}
            placeholder="web-1"
          />
          <div className="grid gap-3 sm:grid-cols-3">
            <NumberField
              label={t("hardware.vcpus")}
              value={vcpus}
              onChange={setVcpus}
              min={1}
              max={256}
            />
            <NumberField
              label={t("hardware.memory")}
              value={memoryMib}
              onChange={setMemoryMib}
              min={64}
            />
            <NumberField
              label={t("hardware.sizeGib")}
              value={diskGib}
              onChange={setDiskGib}
              min={1}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField
              label={t("hardware.pool")}
              value={pool}
              onChange={setPool}
              options={pools.map((p) => ({ value: p.name, label: p.name }))}
            />
            <SelectField
              label={t("vm.firmware")}
              value={firmware}
              onChange={(next) => setFirmware(next as "bios" | "uefi")}
              hint={
                !status.uefi
                  ? t("new.noUefi")
                  : firmware === "uefi"
                    ? t("new.uefiHint")
                    : undefined
              }
              options={[
                { value: "bios", label: t("vm.bios") },
                ...(status.uefi
                  ? [{ value: "uefi" as const, label: t("vm.uefi") }]
                  : []),
              ]}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <SelectField
              label={t("hardware.nicType")}
              value={networkType}
              onChange={(next) => {
                setNetworkType(next as "network" | "bridge");
                setNetwork(next === "network" ? networks[0] || "" : "");
              }}
              options={[
                { value: "network", label: t("hardware.virtualNetwork") },
                { value: "bridge", label: t("hardware.hostBridge") },
              ]}
            />
            {networkType === "network" ? (
              <SelectField
                label={t("hardware.network")}
                value={network}
                onChange={setNetwork}
                options={networks.map((n) => ({ value: n, label: n }))}
              />
            ) : (
              <TextField
                label={t("hardware.bridge")}
                value={network}
                onChange={setNetwork}
                placeholder="br0"
              />
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("new.install")}
        icon={<MonitorCog className="size-3.5" />}
      >
        <div className="flex flex-col gap-3 py-3">
          <SelectField
            label={t("new.source")}
            value={sourceType}
            onChange={(next) => setSourceType(next as SourceType)}
            options={[
              { value: "cloud", label: t("new.sourceCloud") },
              { value: "iso", label: t("new.sourceIso") },
              { value: "blank", label: t("new.sourceBlank") },
            ]}
          />
          {sourceType === "iso" && (
            <SelectField
              label={t("hardware.iso")}
              value={iso}
              onChange={setIso}
              options={isos.map((v) => ({ value: v.name, label: v.name }))}
              placeholder={t("hardware.pickIso")}
              hint={isos.length ? undefined : t("new.noIso")}
            />
          )}
          {cloud && (
            <>
              {status.missingTools.length > 0 && (
                <p className="text-xs text-destructive">
                  {t("new.missingTools", {
                    tools: status.missingTools.join(", "),
                  })}
                </p>
              )}
              <SelectField
                label={t("new.image")}
                value={image}
                onChange={setImage}
                options={[
                  ...images.map((i) => ({ value: i.id, label: i.name })),
                  { value: CUSTOM, label: t("new.customImage") },
                ]}
              />
              {image === CUSTOM && (
                <TextField
                  label={t("new.imageUrl")}
                  value={url}
                  onChange={setUrl}
                  placeholder="https://"
                />
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <TextField
                  label={t("new.username")}
                  value={username}
                  onChange={setUsername}
                />
                <Field label={t("new.password")}>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </Field>
              </div>
              <Field label={t("new.sshKey")} hint={t("new.sshKeyHint")}>
                <Textarea
                  value={sshKey}
                  onChange={(event) => setSshKey(event.target.value)}
                  spellCheck={false}
                  className="font-mono text-xs"
                  rows={2}
                />
              </Field>
            </>
          )}
          <SwitchRow
            label={t("new.start")}
            checked={start}
            onChange={setStart}
          />
          <SwitchRow
            label={t("vm.autostart")}
            description={t("vm.autostartHint")}
            checked={autostart}
            onChange={setAutostart}
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
