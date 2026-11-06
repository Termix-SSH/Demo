import { useCallback, useEffect, useState } from "react";
import { Copy, GitCompare, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { DiffEntry, Snapshot } from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { DiffList } from "./DiffList";

export function CopiesPanel({
  api,
  accountId,
  zoneId,
  canEdit,
  canManage,
  onRestored,
}: {
  api: DnsApi;
  accountId: number;
  zoneId: string;
  canEdit: boolean;
  canManage: boolean;
  onRestored: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [copies, setCopies] = useState<Snapshot[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState<{ id: number; diff: DiffEntry[] } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setCopies(await api.snapshots(accountId, zoneId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [api, accountId, zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    try {
      await api.takeSnapshot(accountId, zoneId, t("copies.manualLabel"));
      toast.success(t("copies.saved"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function compare(copy: Snapshot) {
    if (open?.id === copy.id) {
      setOpen(null);
      return;
    }
    try {
      setOpen({ id: copy.id, diff: await api.snapshotDiff(copy.id) });
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function restore(copy: Snapshot) {
    const diff = await api.snapshotDiff(copy.id).catch(() => []);
    const ok = await confirm({
      title: t("copies.restoreConfirm", { count: diff.length }),
      confirmLabel: t("copies.restore"),
    });
    if (!ok) return;
    try {
      const result = await api.restore(copy.id);
      toast.success(t("copies.restored", { count: result.diff.length }));
      setOpen(null);
      onRestored();
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(copy: Snapshot) {
    try {
      await api.deleteSnapshot(copy.id);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{t("copies.hint")}</p>
        {canEdit && (
          <AddButton label={t("copies.save")} onClick={() => void save()} />
        )}
      </div>
      {!loaded && <LoadingState />}
      <PanelList
        empty={
          loaded ? <EmptyState icon={Copy} title={t("copies.empty")} /> : null
        }
      >
        {copies.map((copy, index) => (
          <div key={copy.id}>
            <ListRow
              stripe={index}
              icon={<Copy />}
              title={copy.label}
              badges={
                <ListBadge tone={copy.source === "manual" ? "brand" : "muted"}>
                  {t(`copies.source.${copy.source}`)}
                </ListBadge>
              }
              meta={`${new Date(copy.createdAt).toLocaleString()} | ${t("copies.count", { count: copy.recordCount })}`}
              actions={
                <>
                  <ListRowAction
                    label={t("copies.compare")}
                    onClick={() => void compare(copy)}
                  >
                    <GitCompare />
                  </ListRowAction>
                  {canManage && (
                    <ListRowAction
                      label={t("copies.restore")}
                      onClick={() => void restore(copy)}
                    >
                      <RotateCcw />
                    </ListRowAction>
                  )}
                  {canEdit && (
                    <ListRowAction
                      label={t("delete")}
                      tone="destructive"
                      onClick={() => void remove(copy)}
                    >
                      <Trash2 />
                    </ListRowAction>
                  )}
                </>
              }
            />
            {open?.id === copy.id && <DiffList diff={open.diff} />}
          </div>
        ))}
      </PanelList>
    </div>
  );
}
