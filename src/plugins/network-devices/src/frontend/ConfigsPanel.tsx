import { useCallback, useEffect, useMemo, useState } from "react";
import { diffLines } from "diff";
import { Download, FileText, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  InlineView,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  ToolbarSelect,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { ConfigFile, ConfigMeta, Device } from "../shared/types";
import { errorMessage, type NetworkApi } from "./api";

const when = (iso: string) => new Date(iso).toLocaleString();

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const EXTENSION = { text: "txt", xml: "xml", json: "json" } as const;

/** Saved configurations of one device: save now, read, compare, download. */
export function ConfigsPanel({
  device,
  api,
  canManage,
}: {
  device: Device;
  api: NetworkApi;
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [list, setList] = useState<ConfigMeta[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState<ConfigFile | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await api.configs(device.id));
    } catch (error) {
      toast.error(errorMessage(error));
      setList([]);
    }
  }, [api, device.id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveNow() {
    setSaving(true);
    try {
      const result = await api.saveConfig(device.id);
      toast.success(
        result.changed ? t("configs.saved") : t("configs.unchanged"),
      );
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  }

  async function show(meta: ConfigMeta) {
    try {
      setOpen(await api.config(device.id, meta.id));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(meta: ConfigMeta) {
    const ok = await confirm({
      title: t("configs.deleteConfirm", { when: when(meta.takenAt) }),
      confirmLabel: t("configs.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await api.deleteConfig(device.id, meta.id);
      await load();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const schedule = device.options.configBackup ?? "off";

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {canManage && (
          <Button size="sm" disabled={saving} onClick={() => void saveNow()}>
            <Save className="size-3.5" />
            {saving ? t("configs.saving") : t("configs.saveNow")}
          </Button>
        )}
        <span className="text-xs text-muted-foreground">
          {t(`configs.schedule.${schedule}`)}
        </span>
      </div>
      {list === null ? (
        <LoadingState />
      ) : list.length === 0 ? (
        <EmptyState icon={FileText} title={t("configs.none")} />
      ) : (
        <PanelList>
          {list.map((meta, index) => (
            <ListRow
              key={meta.id}
              stripe={index}
              icon={<FileText className="size-3.5" />}
              title={when(meta.takenAt)}
              meta={`${size(meta.size)} | ${meta.format.toUpperCase()} | ${meta.sha256.slice(0, 12)}`}
              onClick={() => void show(meta)}
              trailing={
                canManage ? (
                  <ListRowAction
                    label={t("configs.delete")}
                    tone="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(meta);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ListRowAction>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
      {open && list && (
        <ConfigViewer
          device={device}
          api={api}
          file={open}
          list={list}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}

function ConfigViewer({
  device,
  api,
  file,
  list,
  onClose,
}: {
  device: Device;
  api: NetworkApi;
  file: ConfigFile;
  list: ConfigMeta[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const older = list.filter((meta) => meta.takenAt < file.takenAt);
  const [against, setAgainst] = useState<string>(
    older[0] ? String(older[0].id) : "none",
  );
  const [other, setOther] = useState<ConfigFile | null>(null);

  useEffect(() => {
    if (against === "none") {
      setOther(null);
      return;
    }
    let live = true;
    void api
      .config(device.id, Number(against))
      .then((loaded) => {
        if (live) setOther(loaded);
      })
      .catch((error) => toast.error(errorMessage(error)));
    return () => {
      live = false;
    };
  }, [api, device.id, against]);

  const parts = useMemo(
    () => (other ? diffLines(other.content, file.content) : null),
    [other, file.content],
  );

  function download() {
    const blob = new Blob([file.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${device.name}-${file.takenAt.slice(0, 19).replace(/:/g, "-")}.${EXTENSION[file.format]}`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <InlineView
      open
      bare
      onOpenChange={(open) => !open && onClose()}
      icon={<FileText className="size-4" />}
      title={t("configs.title", {
        name: device.name,
        when: when(file.takenAt),
      })}
      toolbar={
        <div className="flex flex-wrap items-center gap-2">
          <ToolbarSelect<string>
            label={t("configs.compare")}
            value={against}
            onChange={setAgainst}
            options={[
              { value: "none", label: t("configs.noCompare") },
              ...list
                .filter((meta) => meta.id !== file.id)
                .map((meta) => ({
                  value: String(meta.id),
                  label: t("configs.compareWith", { when: when(meta.takenAt) }),
                })),
            ]}
          />
          <Button size="sm" variant="outline" onClick={download}>
            <Download className="size-3.5" />
            {t("configs.download")}
          </Button>
        </div>
      }
    >
      <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-[11px] leading-[1.45]">
        {parts
          ? parts.map((part, i) => (
              <span
                key={i}
                className={
                  part.added
                    ? "block bg-success/15 text-success"
                    : part.removed
                      ? "block bg-destructive/15 text-destructive line-through"
                      : "block text-muted-foreground"
                }
              >
                {part.value
                  .replace(/\n$/, "")
                  .split("\n")
                  .map(
                    (line) =>
                      `${part.added ? "+ " : part.removed ? "- " : "  "}${line}`,
                  )
                  .join("\n")}
              </span>
            ))
          : file.content}
      </pre>
      {parts && parts.every((part) => !part.added && !part.removed) && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("configs.same")}
        </p>
      )}
    </InlineView>
  );
}
