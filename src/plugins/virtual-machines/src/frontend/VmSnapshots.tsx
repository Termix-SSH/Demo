import { useCallback, useEffect, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  NoticePanel,
  PanelList,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { SnapshotRow, VmDetail } from "../shared/types";
import {
  deleteSnapshot,
  errorMessage,
  getSnapshots,
  revertSnapshot,
  takeSnapshot,
} from "./api";
import { statusText } from "./format";
import { useAction } from "./useAction";

export function VmSnapshots({
  hostId,
  vm,
  onChanged,
}: {
  hostId: number;
  vm: VmDetail;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [rows, setRows] = useState<SnapshotRow[] | null>(null);
  const [failed, setFailed] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await getSnapshots(hostId, vm.uuid));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
    await onChanged();
  }, [hostId, vm.uuid, onChanged, t]);
  const action = useAction(load);

  useEffect(() => {
    void load();
    // Only on open: onChanged reloads the VM, which must not loop back here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, vm.uuid]);

  if (failed && !rows) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!rows) return <LoadingState label={t("common.loading")} />;

  return (
    <div className="flex flex-col">
      {vm.canSnapshot ? (
        <div className="grid items-end gap-3 border-b border-border p-3 sm:grid-cols-[1fr_2fr_auto]">
          <TextField
            label={t("snapshot.name")}
            value={name}
            onChange={setName}
            placeholder="before-upgrade"
          />
          <TextField
            label={t("snapshot.description")}
            value={description}
            onChange={setDescription}
          />
          <Button
            disabled={action.busy || !name.trim()}
            onClick={async () => {
              const ok = await action.run(
                () => takeSnapshot(hostId, vm.uuid, name.trim(), description),
                t("snapshot.taken"),
              );
              if (ok) {
                setName("");
                setDescription("");
              }
            }}
          >
            {action.busy ? t("snapshot.taking") : t("snapshot.take")}
          </Button>
        </div>
      ) : (
        <NoticePanel title={vm.snapshotBlock} tone="warning" />
      )}
      <PanelList
        empty={
          <EmptyState
            title={t("snapshot.none")}
            hint={t("snapshot.noneHint")}
          />
        }
      >
        {rows.map((row) => (
          <ListRow
            key={row.name}
            title={row.name}
            badges={
              row.current ? (
                <ListBadge tone="brand">{t("snapshot.current")}</ListBadge>
              ) : undefined
            }
            meta={statusText([
              row.createdAt && new Date(row.createdAt).toLocaleString(),
              row.state,
              row.description,
            ])}
            trailing={
              <>
                <ListRowAction
                  label={t("snapshot.revert")}
                  disabled={action.busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t("snapshot.revertTitle", { name: row.name }),
                      description: t("snapshot.revertText"),
                      confirmLabel: t("snapshot.revert"),
                    });
                    if (ok) {
                      await action.run(
                        () => revertSnapshot(hostId, vm.uuid, row.name),
                        t("snapshot.reverted"),
                      );
                    }
                  }}
                >
                  <History className="size-3.5" />
                </ListRowAction>
                <ListRowAction
                  label={t("snapshot.delete")}
                  tone="destructive"
                  disabled={action.busy}
                  onClick={async () => {
                    const ok = await confirm({
                      title: t("snapshot.deleteTitle", { name: row.name }),
                      description: t("snapshot.deleteText"),
                      confirmLabel: t("snapshot.delete"),
                    });
                    if (ok) {
                      await action.run(() =>
                        deleteSnapshot(hostId, vm.uuid, row.name),
                      );
                    }
                  }}
                >
                  <Trash2 className="size-3.5" />
                </ListRowAction>
              </>
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
