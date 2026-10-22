import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Button,
  PluginIcon,
  PluginSettingsValidationError,
  SectionCard,
  SettingsFieldRow,
  getPluginAdminSettings,
  getPluginUserSettings,
  isFieldShown,
  pluginKey,
  pluginName,
  updatePluginAdminSettings,
  updatePluginUserSettings,
  type PluginSettingsErrors,
  type PluginSettingsField,
  type PluginSummary,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

export type SettingsScope = "admin" | "user";

/** One plugin's settings in one scope, loaded and saved through its own routes. */
export function PluginSettingsForm({
  plugin,
  scope,
  fields,
}: {
  plugin: PluginSummary;
  scope: SettingsScope;
  fields: PluginSettingsField[];
}) {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<PluginSettingsErrors>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const running = plugin.enabled && plugin.state !== "failed";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setValues(
        scope === "admin"
          ? await getPluginAdminSettings(plugin.id)
          : await getPluginUserSettings(plugin.id),
      );
      setErrors({});
      setDirty(false);
    } catch {
      toast.error(t("settings.pluginLoadFailed"));
    } finally {
      setLoading(false);
    }
  }, [plugin.id, scope, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const setValue = (key: string, value: unknown) => {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const saved =
        scope === "admin"
          ? await updatePluginAdminSettings(plugin.id, values)
          : await updatePluginUserSettings(plugin.id, values);
      setValues(saved);
      setErrors({});
      setDirty(false);
      toast.success(t("settings.pluginSaved"));
    } catch (error) {
      if (error instanceof PluginSettingsValidationError) {
        setErrors(error.errors);
        toast.error(t("settings.pluginInvalid"));
      } else {
        toast.error(t("settings.pluginSaveFailed"));
      }
    } finally {
      setSaving(false);
    }
  };

  // Groups appear in the order of their first field, so the manifest sets the layout.
  const groups = useMemo(() => {
    const ordered: { key?: string; fields: PluginSettingsField[] }[] = [];
    for (const field of fields) {
      const existing = ordered.find((group) => group.key === field.group);
      if (existing) existing.fields.push(field);
      else ordered.push({ key: field.group, fields: [field] });
    }
    return ordered;
  }, [fields]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {t("settings.loading")}
      </div>
    );
  }

  const rows = (group: PluginSettingsField[]) =>
    group
      .filter((field) => isFieldShown(field, values))
      .map((field) => (
        <SettingsFieldRow
          key={field.key}
          pluginId={plugin.id}
          field={field}
          values={values}
          setValue={setValue}
          running={running}
          error={errors[field.key]}
        />
      ));

  const icon = <PluginIcon name={plugin.icon} className="size-3.5" />;

  return (
    <div className="flex flex-col gap-2">
      {!running && (
        <div className="border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {t("settings.pluginOff", { name: pluginName(t, plugin) })}
        </div>
      )}
      {groups.map((group, index) =>
        group.key ? (
          <SectionCard
            key={group.key}
            title={t(pluginKey(plugin.id, group.key))}
            icon={icon}
          >
            {rows(group.fields)}
          </SectionCard>
        ) : (
          <div key={`group-${index}`}>{rows(group.fields)}</div>
        ),
      )}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={!dirty || saving}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="size-3 animate-spin mr-1.5" />}
          {t("settings.save")}
        </Button>
      </div>
    </div>
  );
}
