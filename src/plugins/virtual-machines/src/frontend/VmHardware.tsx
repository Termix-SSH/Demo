import { useEffect, useState } from "react";
import { Cpu, Disc, HardDrive, Network, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FormFooter,
  ListRow,
  ListRowAction,
  NumberField,
  PanelList,
  SectionCard,
  SelectField,
  TextField,
  TileStack,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { PoolRow, VmDetail, VolumeRow } from "../shared/types";
import {
  addDisk,
  addNic,
  getNetworks,
  getVolumes,
  removeDisk,
  removeNic,
  setHardware,
  setMedia,
} from "./api";
import { useAction } from "./useAction";

export function VmHardware({
  hostId,
  vm,
  pools,
  onChanged,
}: {
  hostId: number;
  vm: VmDetail;
  pools: PoolRow[];
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const action = useAction(onChanged);
  const memoryNow = Math.round(vm.maxMemoryKib / 1024);
  const [vcpus, setVcpus] = useState(vm.vcpus);
  const [memoryMib, setMemoryMib] = useState(memoryNow);
  const [pool, setPool] = useState(pools[0]?.name ?? "");
  const [gib, setGib] = useState(20);
  const [nicType, setNicType] = useState<"network" | "bridge">("network");
  const [nicSource, setNicSource] = useState("");
  const [networks, setNetworks] = useState<string[]>([]);
  const [isos, setIsos] = useState<VolumeRow[]>([]);
  const [iso, setIso] = useState("");

  useEffect(() => {
    getNetworks(hostId)
      .then((rows) => {
        setNetworks(rows.map((row) => row.name));
        setNicSource((old) => old || rows[0]?.name || "");
      })
      .catch(() => undefined);
  }, [hostId]);

  useEffect(() => {
    if (!pool) return;
    getVolumes(hostId, pool)
      .then((rows) => setIsos(rows.filter((r) => r.name.endsWith(".iso"))))
      .catch(() => setIsos([]));
  }, [hostId, pool]);

  const running = vm.state === "running";
  const drive = vm.diskDevices.find((disk) => disk.device === "cdrom");
  const poolOptions = pools.map((p) => ({ value: p.name, label: p.name }));
  const dirty = vcpus !== vm.vcpus || memoryMib !== memoryNow;

  return (
    <TileStack>
      <SectionCard
        title={t("hardware.cpuMemory")}
        icon={<Cpu className="size-3.5" />}
      >
        <div className="flex flex-col gap-3 py-3">
          <div className="grid gap-3 sm:grid-cols-2">
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
          </div>
          {running && (
            <p className="text-xs text-muted-foreground">
              {t("hardware.nextStart")}
            </p>
          )}
          <FormFooter
            saving={action.busy}
            dirty={dirty}
            saveLabel={t("common.save")}
            onSave={() =>
              void action.run(
                () =>
                  setHardware(hostId, vm.uuid, {
                    ...(vcpus !== vm.vcpus ? { vcpus } : {}),
                    ...(memoryMib !== memoryNow ? { memoryMib } : {}),
                  }),
                t("hardware.saved"),
              )
            }
          />
        </div>
      </SectionCard>

      <SectionCard
        title={t("hardware.disks")}
        icon={<HardDrive className="size-3.5" />}
      >
        <PanelList>
          {vm.diskDevices
            .filter((disk) => disk.device !== "cdrom")
            .map((disk) => (
              <ListRow
                key={disk.target}
                title={disk.target}
                meta={`${disk.source} | ${disk.bus} | ${disk.format}`}
                trailing={
                  <ListRowAction
                    label={t("hardware.detach")}
                    tone="destructive"
                    disabled={action.busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("hardware.detachTitle", { name: disk.target }),
                        description: t("hardware.detachText"),
                        confirmLabel: t("hardware.detach"),
                      });
                      if (ok) {
                        await action.run(() =>
                          removeDisk(hostId, vm.uuid, disk.target),
                        );
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ListRowAction>
                }
              />
            ))}
        </PanelList>
        <div className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_8rem_auto]">
          <SelectField
            label={t("hardware.pool")}
            value={pool}
            onChange={setPool}
            options={poolOptions}
          />
          <NumberField
            label={t("hardware.sizeGib")}
            value={gib}
            onChange={setGib}
            min={1}
          />
          <Button
            disabled={action.busy || !pool}
            onClick={() =>
              void action.run(() => addDisk(hostId, vm.uuid, pool, gib))
            }
          >
            {t("hardware.addDisk")}
          </Button>
        </div>
      </SectionCard>

      <SectionCard
        title={t("hardware.cdrom")}
        icon={<Disc className="size-3.5" />}
      >
        <div className="flex flex-col gap-3 py-3">
          <p className="break-all text-xs text-muted-foreground">
            {drive?.source || t("hardware.noMedia")}
          </p>
          <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
            <SelectField
              label={t("hardware.iso")}
              value={iso}
              onChange={setIso}
              options={isos.map((v) => ({ value: v.name, label: v.name }))}
              placeholder={t("hardware.pickIso")}
            />
            <Button
              disabled={action.busy || !iso}
              onClick={() =>
                void action.run(() => setMedia(hostId, vm.uuid, pool, iso))
              }
            >
              {t("hardware.insert")}
            </Button>
            <Button
              variant="ghost"
              disabled={action.busy || !drive?.source}
              onClick={() =>
                void action.run(() => setMedia(hostId, vm.uuid, "", ""))
              }
            >
              {t("hardware.eject")}
            </Button>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title={t("hardware.nics")}
        icon={<Network className="size-3.5" />}
      >
        <PanelList>
          {vm.nicDevices.map((nic) => (
            <ListRow
              key={nic.mac}
              title={nic.source || nic.type}
              meta={`${nic.mac} | ${nic.model}`}
              trailing={
                <ListRowAction
                  label={t("hardware.removeNic")}
                  tone="destructive"
                  disabled={action.busy}
                  onClick={() =>
                    void action.run(() => removeNic(hostId, vm.uuid, nic.mac))
                  }
                >
                  <Trash2 className="size-3.5" />
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
        <div className="grid items-end gap-3 py-3 sm:grid-cols-[10rem_1fr_auto]">
          <SelectField
            label={t("hardware.nicType")}
            value={nicType}
            onChange={(next) => setNicType(next as "network" | "bridge")}
            options={[
              { value: "network", label: t("hardware.virtualNetwork") },
              { value: "bridge", label: t("hardware.hostBridge") },
            ]}
          />
          {nicType === "network" ? (
            <SelectField
              label={t("hardware.network")}
              value={nicSource}
              onChange={setNicSource}
              options={networks.map((n) => ({ value: n, label: n }))}
            />
          ) : (
            <TextField
              label={t("hardware.bridge")}
              value={nicSource}
              onChange={setNicSource}
              placeholder="br0"
            />
          )}
          <Button
            disabled={action.busy || !nicSource}
            onClick={() =>
              void action.run(() => addNic(hostId, vm.uuid, nicType, nicSource))
            }
          >
            {t("hardware.addNic")}
          </Button>
        </div>
      </SectionCard>
    </TileStack>
  );
}
