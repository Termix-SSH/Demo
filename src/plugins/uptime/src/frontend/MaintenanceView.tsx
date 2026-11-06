import { useCallback, useEffect, useState } from "react";
import { Wrench } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  Checkbox,
  EmptyState,
  Field,
  FormFooter,
  InlineView,
  Input,
  ListBadge,
  ListRow,
  LoadingState,
  NumberField,
  PanelList,
  SelectField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  MaintenanceInput,
  MaintenanceView as Window,
  MonitorView,
} from "../shared/types";
import {
  deleteMaintenance,
  errorMessage,
  listMaintenance,
  saveMaintenance,
} from "./api";
import { MonitorPicker } from "./MonitorPicker";

const DAYS = [0, 1, 2, 3, 4, 5, 6];

function localInput(ms: number | undefined): string {
  if (!ms) return "";
  const offset = new Date(ms).getTimezoneOffset() * 60_000;
  return new Date(ms - offset).toISOString().slice(0, 16);
}

function blank(): MaintenanceInput {
  const now = Date.now();
  return {
    name: "",
    scope: "all",
    monitorKeys: [],
    tag: "",
    kind: "once",
    startsAt: now,
    endsAt: now + 3_600_000,
    days: [0],
    startMinute: 180,
    durationMinutes: 60,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    enabled: true,
  };
}

function timeText(minute: number): string {
  const hours = String(Math.floor(minute / 60)).padStart(2, "0");
  return `${hours}:${String(minute % 60).padStart(2, "0")}`;
}

function WindowEditor({
  window,
  monitors,
  onClose,
  onSaved,
}: {
  window: Window | "new";
  monitors: MonitorView[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<MaintenanceInput>(
    window === "new" ? blank() : window,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<MaintenanceInput>) =>
    setForm((current) => ({ ...current, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      await saveMaintenance(form, window === "new" ? undefined : window.id);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("editor.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const picked = form.days ?? [];
  return (
    <InlineView
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(window === "new" ? "maintenance.add" : "maintenance.edit")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          saving={saving}
          status={
            error ? <span className="text-destructive">{error}</span> : null
          }
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <TextField
          label={t("editor.name")}
          value={form.name}
          onChange={(name) => set({ name })}
        />
        <SelectField<MaintenanceInput["kind"]>
          label={t("maintenance.when")}
          value={form.kind}
          onChange={(kind) => set({ kind })}
          options={[
            { value: "once", label: t("maintenance.once") },
            { value: "weekly", label: t("maintenance.weekly") },
          ]}
        />
        {form.kind === "once" ? (
          <>
            <Field label={t("maintenance.start")}>
              <Input
                type="datetime-local"
                value={localInput(form.startsAt)}
                onChange={(event) =>
                  set({ startsAt: new Date(event.target.value).getTime() })
                }
              />
            </Field>
            <Field label={t("maintenance.end")}>
              <Input
                type="datetime-local"
                value={localInput(form.endsAt)}
                onChange={(event) =>
                  set({ endsAt: new Date(event.target.value).getTime() })
                }
              />
            </Field>
          </>
        ) : (
          <>
            <Field label={t("maintenance.days")}>
              <div className="flex flex-wrap gap-3">
                {DAYS.map((day) => (
                  <label key={day} className="flex items-center gap-1 text-sm">
                    <Checkbox
                      checked={picked.includes(day)}
                      onCheckedChange={(checked) =>
                        set({
                          days: checked
                            ? [...picked, day]
                            : picked.filter((item) => item !== day),
                        })
                      }
                    />
                    {t(`maintenance.day${day}`)}
                  </label>
                ))}
              </div>
            </Field>
            <Field label={t("maintenance.time")}>
              <Input
                type="time"
                value={timeText(form.startMinute ?? 0)}
                onChange={(event) => {
                  const [hours, minutes] = event.target.value.split(":");
                  set({ startMinute: Number(hours) * 60 + Number(minutes) });
                }}
              />
            </Field>
            <NumberField
              label={t("maintenance.length")}
              value={form.durationMinutes ?? 60}
              onChange={(durationMinutes) => set({ durationMinutes })}
              min={1}
            />
            <TextField
              label={t("maintenance.timezone")}
              value={form.timezone ?? ""}
              onChange={(timezone) => set({ timezone })}
            />
          </>
        )}
        <SelectField<MaintenanceInput["scope"]>
          label={t("maintenance.covers")}
          value={form.scope}
          onChange={(scope) => set({ scope })}
          options={[
            { value: "all", label: t("maintenance.coversAll") },
            { value: "monitors", label: t("maintenance.coversSome") },
            { value: "tag", label: t("maintenance.coversTag") },
          ]}
        />
        {form.scope === "monitors" ? (
          <MonitorPicker
            monitors={monitors.filter((m) => m.access !== "view")}
            picked={form.monitorKeys ?? []}
            onChange={(monitorKeys) => set({ monitorKeys })}
          />
        ) : null}
        {form.scope === "tag" ? (
          <TextField
            label={t("editor.tags")}
            value={form.tag ?? ""}
            onChange={(tag) => set({ tag })}
          />
        ) : null}
      </div>
    </InlineView>
  );
}

export function MaintenanceView({
  monitors,
  canManage,
}: {
  monitors: MonitorView[];
  canManage: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [windows, setWindows] = useState<Window[] | null>(null);
  const [editing, setEditing] = useState<Window | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setWindows(await listMaintenance());
    } catch (e) {
      toast.error(errorMessage(e, t("tab.error")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (window: Window) => {
    const yes = await confirm({
      title: t("maintenance.deleteTitle", { name: window.name }),
      confirmLabel: t("common.delete"),
    });
    if (!yes) return;
    await deleteMaintenance(window.id);
    await load();
  };

  if (windows === null) return <LoadingState label={t("common.loading")} />;

  const summary = (window: Window) =>
    window.kind === "once"
      ? `${new Date(window.startsAt ?? 0).toLocaleString()} | ${new Date(window.endsAt ?? 0).toLocaleString()}`
      : `${(window.days ?? []).map((day) => t(`maintenance.day${day}`)).join(", ")} | ${timeText(window.startMinute ?? 0)} | ${window.durationMinutes} min`;

  return (
    <div className="flex min-h-0 flex-col">
      {canManage ? (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <AddButton
            label={t("maintenance.add")}
            onClick={() => setEditing("new")}
          />
        </div>
      ) : null}
      {windows.length === 0 ? (
        <EmptyState
          icon={Wrench}
          title={t("maintenance.none")}
          hint={t("maintenance.noneHint")}
        />
      ) : (
        <PanelList>
          {windows.map((window) => (
            <ListRow
              key={window.id}
              title={window.name}
              meta={summary(window)}
              onClick={canManage ? () => setEditing(window) : undefined}
              badges={
                window.active ? (
                  <ListBadge tone="brand">{t("maintenance.active")}</ListBadge>
                ) : null
              }
              trailing={
                canManage ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(window);
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                ) : null
              }
            />
          ))}
        </PanelList>
      )}
      {editing ? (
        <WindowEditor
          window={editing}
          monitors={monitors}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      ) : null}
    </div>
  );
}
