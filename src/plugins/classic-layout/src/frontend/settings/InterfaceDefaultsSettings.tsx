import { useEffect, useMemo, useState } from "react";
import {
  FakeSwitch,
  Button,
  LoadingState,
  Segmented,
  SettingRow,
  cn,
  getRoles,
  roleLabel,
  useRailItems,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Check } from "lucide-react";
import { toast } from "sonner";
import {
  useInterfaceDefaults,
  type InterfaceDefaults,
  type InterfacePreset,
  type InterfaceTemplate,
} from "../interface-defaults";

const EVERYONE = "";

/** What new users see first, for everyone and for each role. Admin only. */
export function InterfaceDefaultsSettings() {
  const { t } = useTranslation();
  const { defaults, loaded, save } = useInterfaceDefaults();
  const railItems = useRailItems();
  const [roles, setRoles] = useState<{ name: string; label: string }[]>([]);
  const [draft, setDraft] = useState<InterfaceDefaults | null>(null);
  const [scope, setScope] = useState(EVERYONE);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getRoles()
      .then(({ roles: list }) =>
        setRoles(
          (list ?? []).map((role) => ({
            name: role.name,
            label: roleLabel(t, role.displayName || role.name),
          })),
        ),
      )
      .catch(() => setRoles([]));
  }, []);

  useEffect(() => {
    if (loaded && !draft) setDraft(defaults ?? { everyone: null, roles: {} });
  }, [loaded, defaults, draft]);

  const apps = useMemo(
    () =>
      railItems
        .filter((item) => item.pluginId && !item.alwaysVisible)
        .map((item) => ({ id: item.id, label: t(item.labelKey) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [railItems, t],
  );

  if (!draft) return <LoadingState />;

  // A new template starts from what people get without one.
  const base: InterfaceTemplate = {
    preset: "balanced",
    pins: railItems
      .filter((item) => item.pluginId && item.simplePreset)
      .map((item) => item.id),
    locked: false,
  };

  const own =
    scope === EVERYONE ? draft.everyone : (draft.roles[scope] ?? null);
  const current = own ?? draft.everyone ?? base;
  const inherits = scope !== EVERYONE && !own;
  const dirty = JSON.stringify(draft) !== JSON.stringify(defaults);

  const update = (patch: Partial<InterfaceTemplate>) => {
    const next = { ...current, ...patch };
    setDraft((prev) =>
      prev
        ? scope === EVERYONE
          ? { ...prev, everyone: next }
          : { ...prev, roles: { ...prev.roles, [scope]: next } }
        : prev,
    );
  };
  const useEveryone = () =>
    setDraft((prev) => {
      if (!prev) return prev;
      const rolesCopy = { ...prev.roles };
      delete rolesCopy[scope];
      return { ...prev, roles: rolesCopy };
    });
  const togglePin = (id: string) =>
    update({
      pins: current.pins.includes(id)
        ? current.pins.filter((pin) => pin !== id)
        : [...current.pins, id],
    });

  const onSave = async () => {
    setSaving(true);
    try {
      setDraft(await save(draft));
      toast.success(t("settings.interfaceDefaults.saved"));
    } catch {
      toast.error(t("settings.interfaceDefaults.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {t("settings.interfaceDefaults.intro")}
      </p>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t("settings.interfaceDefaults.setFor")}
        </span>
        <Segmented
          value={scope}
          onChange={setScope}
          options={[
            {
              value: EVERYONE,
              label: t("settings.interfaceDefaults.everyone"),
            },
            ...roles.map((role) => ({ value: role.name, label: role.label })),
          ]}
        />
        {inherits && (
          <span className="text-[11px] text-muted-foreground">
            {t("settings.interfaceDefaults.inherits")}
          </span>
        )}
        {scope !== EVERYONE && own && (
          <button
            type="button"
            onClick={useEveryone}
            className="text-[11px] text-accent-brand hover:underline"
          >
            {t("settings.interfaceDefaults.useEveryone")}
          </button>
        )}
      </div>

      <div className="px-3">
        <SettingRow
          label={t("settings.interfaceDefaults.look")}
          description={t("settings.interfaceDefaults.lookHint")}
        >
          <Segmented<InterfacePreset>
            value={current.preset}
            onChange={(preset) => update({ preset })}
            options={[
              {
                value: "simple",
                label: t("settings.interfaceDefaults.simple"),
              },
              {
                value: "balanced",
                label: t("settings.interfaceDefaults.balanced"),
              },
              {
                value: "advanced",
                label: t("settings.interfaceDefaults.advanced"),
              },
            ]}
          />
        </SettingRow>
        <SettingRow
          label={t("settings.interfaceDefaults.lock")}
          description={t("settings.interfaceDefaults.lockHint")}
        >
          <FakeSwitch
            checked={current.locked}
            onChange={(locked) => update({ locked })}
          />
        </SettingRow>
      </div>

      <div className="flex flex-col gap-2 border-t border-border px-3 py-3">
        <div>
          <div className="text-xs font-medium text-foreground">
            {t("settings.interfaceDefaults.apps")}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {current.preset === "advanced"
              ? t("settings.interfaceDefaults.appsAdvanced")
              : t("settings.interfaceDefaults.appsHint")}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-1">
          {apps.map((app) => {
            const on = current.pins.includes(app.id);
            return (
              <button
                key={app.id}
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={current.preset === "advanced"}
                onClick={() => togglePin(app.id)}
                className={cn(
                  "flex h-7 items-center gap-2 border px-2 text-left text-xs transition-colors disabled:opacity-50",
                  on
                    ? "border-accent-brand/40 bg-accent-brand/10 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-3.5 shrink-0 items-center justify-center border",
                    on
                      ? "border-accent-brand bg-accent-brand"
                      : "border-border",
                  )}
                >
                  {on && <Check className="size-2.5 text-background" />}
                </span>
                <span className="truncate">{app.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 border-t border-border px-3 py-3">
        <Button
          size="sm"
          variant="outline"
          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
          disabled={saving || !dirty}
          onClick={() => void onSave()}
        >
          {saving ? t("common.saving") : t("common.save")}
        </Button>
      </div>
    </div>
  );
}
