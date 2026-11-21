import { useEffect, useState } from "react";
import { Bell, Bookmark } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Checkbox,
  FormFooter,
  InlineView,
  NumberField,
  SectionCard,
  SwitchRow,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { SavedQuery, SavedSearch } from "../shared/types";
import {
  createSaved,
  deleteSaved,
  errorMessage,
  listChannels,
  updateSaved,
} from "./api";

/** Saves the current search, or changes a saved one, with its alert. */
export function SavedEditor({
  existing,
  search,
  onClose,
  onSaved,
  onDeleted,
}: {
  existing: SavedSearch | null;
  search: SavedQuery;
  onClose: () => void;
  onSaved: (saved: SavedSearch) => void;
  onDeleted: (id: number) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [name, setName] = useState(existing?.name ?? "");
  const [enabled, setEnabled] = useState(existing?.alert.enabled ?? false);
  const [every, setEvery] = useState(existing?.alert.everyMinutes ?? 5);
  const [min, setMin] = useState(existing?.alert.minMatches ?? 1);
  const [picked, setPicked] = useState<Set<number>>(
    new Set(existing?.alert.channelIds ?? []),
  );
  const [channels, setChannels] = useState<Array<{ id: number; name: string }>>(
    [],
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void listChannels()
      .then(setChannels)
      .catch(() => setChannels([]));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name: name.trim(),
        search,
        alert: {
          enabled,
          everyMinutes: every,
          minMatches: min,
          channelIds: [...picked],
        },
      };
      const saved = existing
        ? await updateSaved(existing.id, body)
        : await createSaved(body);
      toast.success(t("saved.done"));
      onSaved(saved);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t("saved.failed")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    const ok = await confirm({
      title: t("saved.deleteConfirm", { name: existing.name }),
      confirmLabel: t("saved.delete"),
    });
    if (!ok) return;
    try {
      await deleteSaved(existing.id);
      onDeleted(existing.id);
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t("saved.failed")));
    }
  };

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onClose()}
      icon={<Bookmark className="size-4" />}
      title={existing ? t("saved.editTitle") : t("saved.newTitle")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          disabled={!name.trim()}
          saveLabel={t("saved.save")}
          cancelLabel={t("saved.cancel")}
          {...(existing
            ? { onDelete: () => void remove(), deleteLabel: t("saved.delete") }
            : {})}
        />
      }
    >
      <SectionCard title={t("saved.search")} icon={<Bookmark />}>
        <div className="flex flex-col gap-3 py-2">
          <TextField
            label={t("saved.name")}
            value={name}
            placeholder={t("saved.namePlaceholder")}
            onChange={setName}
          />
          <p className="text-xs text-muted-foreground">
            {t("saved.searchHint", {
              query: search.query || t("saved.anyLine"),
              range: t(`range.${search.range}`),
            })}
          </p>
        </div>
      </SectionCard>
      <SectionCard title={t("saved.alert")} icon={<Bell />}>
        <div className="flex flex-col gap-3 py-2">
          <SwitchRow
            label={t("saved.alertOn")}
            description={t("saved.alertOnHint")}
            checked={enabled}
            onChange={setEnabled}
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <NumberField
              label={t("saved.every")}
              hint={t("saved.everyHint")}
              value={every}
              min={1}
              max={1440}
              disabled={!enabled}
              onChange={(v) =>
                setEvery(Math.min(1440, Math.max(1, Math.round(v) || 1)))
              }
            />
            <NumberField
              label={t("saved.min")}
              hint={t("saved.minHint")}
              value={min}
              min={1}
              max={100000}
              disabled={!enabled}
              onChange={(v) => setMin(Math.max(1, Math.round(v) || 1))}
            />
          </div>
          {channels.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">{t("saved.channels")}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {channels.map((channel) => (
                  <label
                    key={channel.id}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Checkbox
                      checked={picked.has(channel.id)}
                      disabled={!enabled}
                      onCheckedChange={() =>
                        setPicked((current) => {
                          const next = new Set(current);
                          if (next.has(channel.id)) next.delete(channel.id);
                          else next.add(channel.id);
                          return next;
                        })
                      }
                    />
                    {channel.name}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                {t("saved.channelsHint")}
              </p>
            </div>
          ) : null}
          {existing?.lastRunAt ? (
            <p className="text-xs text-muted-foreground">
              {existing.lastError
                ? t("saved.lastError", { error: existing.lastError })
                : t("saved.lastRun", {
                    when: new Date(existing.lastRunAt).toLocaleString(),
                    count: existing.lastCount ?? 0,
                  })}
            </p>
          ) : null}
        </div>
      </SectionCard>
    </InlineView>
  );
}
