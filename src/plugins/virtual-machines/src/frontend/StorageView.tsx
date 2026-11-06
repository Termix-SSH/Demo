import { useCallback, useEffect, useState } from "react";
import { Download, HardDrive, Play, Square, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  NumberField,
  PanelList,
  SectionCard,
  TextField,
  TileStack,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { PoolRow, VolumeRow } from "../shared/types";
import {
  createPool,
  createVolume,
  deletePool,
  deleteVolume,
  downloadVolume,
  getVolumes,
  poolAction,
} from "./api";
import { formatBytes, percentOf, statusText } from "./format";
import { useAction } from "./useAction";

export function StorageView({
  hostId,
  pools,
  onChanged,
  onJobs,
}: {
  hostId: number;
  pools: PoolRow[];
  onChanged: () => unknown;
  onJobs: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [selected, setSelected] = useState("");
  const [volumes, setVolumes] = useState<VolumeRow[]>([]);
  const [poolName, setPoolName] = useState("");
  const [poolPath, setPoolPath] = useState("");
  const [volumeName, setVolumeName] = useState("");
  const [volumeGib, setVolumeGib] = useState(20);
  const [url, setUrl] = useState("");

  const pool = selected || pools[0]?.name || "";
  const loadVolumes = useCallback(async () => {
    if (!pool) return;
    setVolumes(await getVolumes(hostId, pool).catch(() => []));
    await onChanged();
  }, [hostId, pool, onChanged]);
  const action = useAction(loadVolumes);

  useEffect(() => {
    if (!pool) return;
    getVolumes(hostId, pool)
      .then(setVolumes)
      .catch(() => setVolumes([]));
  }, [hostId, pool]);

  const fileName = url.split("?")[0].split("/").pop() ?? "";

  return (
    <TileStack>
      <SectionCard
        title={t("storage.pools")}
        icon={<HardDrive className="size-3.5" />}
      >
        <PanelList
          empty={
            <EmptyState
              title={t("storage.none")}
              hint={t("storage.noneHint")}
            />
          }
        >
          {pools.map((row) => {
            const on = row.state === "running";
            return (
              <ListRow
                key={row.name}
                title={row.name}
                selected={row.name === pool}
                onClick={() => setSelected(row.name)}
                badges={
                  <ListBadge tone={on ? "success" : "muted"}>
                    {on ? t("storage.active") : t("storage.inactive")}
                  </ListBadge>
                }
                meta={statusText([
                  t("storage.used", {
                    used: formatBytes(row.allocation),
                    size: formatBytes(row.capacity),
                    percent: percentOf(row.allocation, row.capacity),
                  }),
                  row.autostart && t("vm.autostart"),
                ])}
                trailing={
                  <>
                    <ListRowAction
                      label={on ? t("storage.stop") : t("storage.start")}
                      disabled={action.busy}
                      onClick={(event) => {
                        event.stopPropagation();
                        void action.run(() =>
                          poolAction(hostId, row.name, on ? "stop" : "start"),
                        );
                      }}
                    >
                      {on ? (
                        <Square className="size-3.5" />
                      ) : (
                        <Play className="size-3.5" />
                      )}
                    </ListRowAction>
                    <ListRowAction
                      label={t("storage.forget")}
                      tone="destructive"
                      disabled={action.busy}
                      onClick={async (event) => {
                        event.stopPropagation();
                        const ok = await confirm({
                          title: t("storage.forgetTitle", { name: row.name }),
                          description: t("storage.forgetText"),
                          confirmLabel: t("storage.forget"),
                        });
                        if (ok) {
                          await action.run(() => deletePool(hostId, row.name));
                        }
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </ListRowAction>
                  </>
                }
              />
            );
          })}
        </PanelList>
        <div className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_2fr_auto]">
          <TextField
            label={t("storage.poolName")}
            value={poolName}
            onChange={setPoolName}
          />
          <TextField
            label={t("storage.poolPath")}
            value={poolPath}
            onChange={setPoolPath}
            placeholder="/srv/vms"
            mono
          />
          <Button
            disabled={action.busy || !poolName || !poolPath}
            onClick={async () => {
              const ok = await action.run(() =>
                createPool(hostId, poolName, poolPath),
              );
              if (ok) {
                setPoolName("");
                setPoolPath("");
              }
            }}
          >
            {t("storage.addPool")}
          </Button>
        </div>
      </SectionCard>

      {pool && (
        <SectionCard
          title={t("storage.volumes", { pool })}
          icon={<HardDrive className="size-3.5" />}
        >
          <PanelList empty={<EmptyState title={t("storage.noVolumes")} />}>
            {volumes.map((volume) => (
              <ListRow
                key={volume.name}
                title={volume.name}
                meta={statusText([
                  formatBytes(volume.capacity),
                  t("storage.allocated", {
                    size: formatBytes(volume.allocation),
                  }),
                ])}
                trailing={
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    disabled={action.busy}
                    onClick={async () => {
                      const ok = await confirm({
                        title: t("storage.deleteVolume", {
                          name: volume.name,
                        }),
                        description: t("storage.deleteVolumeText"),
                        confirmLabel: t("common.delete"),
                      });
                      if (ok) {
                        await action.run(() =>
                          deleteVolume(hostId, pool, volume.name),
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
            <TextField
              label={t("storage.volumeName")}
              value={volumeName}
              onChange={setVolumeName}
              placeholder="data.qcow2"
            />
            <NumberField
              label={t("hardware.sizeGib")}
              value={volumeGib}
              onChange={setVolumeGib}
              min={1}
            />
            <Button
              disabled={action.busy || !volumeName}
              onClick={async () => {
                const ok = await action.run(() =>
                  createVolume(hostId, pool, volumeName, volumeGib),
                );
                if (ok) setVolumeName("");
              }}
            >
              {t("storage.addVolume")}
            </Button>
          </div>
          <div className="grid items-end gap-3 pb-3 sm:grid-cols-[1fr_auto]">
            <TextField
              label={t("storage.downloadUrl")}
              value={url}
              onChange={setUrl}
              placeholder="https://example.com/installer.iso"
              hint={t("storage.downloadHint")}
            />
            <Button
              disabled={action.busy || !fileName}
              onClick={async () => {
                const ok = await action.run(
                  () => downloadVolume(hostId, pool, fileName, url.trim()),
                  t("storage.downloadStarted"),
                );
                if (ok) {
                  setUrl("");
                  onJobs();
                }
              }}
            >
              <Download className="size-3.5" />
              {t("storage.download")}
            </Button>
          </div>
        </SectionCard>
      )}
    </TileStack>
  );
}
