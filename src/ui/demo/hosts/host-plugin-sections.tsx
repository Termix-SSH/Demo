/* eslint-disable react-refresh/only-export-components */
import { useEffect, useState } from "react";
import {
  Activity,
  Box,
  FolderTree,
  LayoutGrid,
  Network,
  Puzzle,
  Server,
  type LucideIcon,
} from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { getPlugins, subscribePlugins } from "@/demo/plugins/plugin-store";
import type { DemoPlugin } from "@/demo/plugins/plugin-data";
import {
  NumberField,
  SelectField,
  SwitchRow,
  TextField,
} from "@/demo/hosts/host-fields";
import type { HostEditorForm } from "@/demo/hosts/host-form";

/**
 * Host editor sections contributed by plugins.
 *
 * Follows the same three rules as the rail and dashboard bridges:
 *
 *  - uninstalled: the section is withdrawn entirely
 *  - disabled: it stays but is marked not running, rather than vanishing
 *    silently while the plugin is still installed
 *  - no `ui:surface` capability: nothing is contributed at all, which is what
 *    makes that capability mean something
 *
 * Files, Docker, Tunnels, Proxmox, Metrics and Tmux all come through here.
 * They used to be hardcoded tabs, which is why uninstalling Docker still left
 * a Docker tab in the editor.
 */

const ICONS: Record<string, LucideIcon> = {
  FolderTree,
  Box,
  Network,
  Server,
  Activity,
  LayoutGrid,
  Puzzle,
};

export interface PluginHostSection {
  pluginId: string;
  label: string;
  icon: LucideIcon;
  running: boolean;
  fields: NonNullable<
    NonNullable<DemoPlugin["contributions"]>["hostFields"]
  >;
}

function contributes(plugin: DemoPlugin): boolean {
  return (
    plugin.installed &&
    plugin.capabilities.includes("ui:surface") &&
    !!plugin.contributions?.hostFields
  );
}

/** Installed plugins that add fields, plus the ones that would if installed. */
export function usePluginHostSections(): {
  sections: PluginHostSection[];
  available: DemoPlugin[];
} {
  const [plugins, setPlugins] = useState(getPlugins);
  useEffect(() => subscribePlugins(() => setPlugins([...getPlugins()])), []);

  const sections = plugins.filter(contributes).map((plugin) => {
    const fields = plugin.contributions!.hostFields!;
    return {
      pluginId: plugin.id,
      label: fields.label,
      icon: ICONS[fields.icon ?? ""] ?? Puzzle,
      running: plugin.state === "enabled",
      fields,
    };
  });

  const available = plugins.filter(
    (plugin) =>
      !plugin.installed &&
      plugin.capabilities.includes("ui:surface") &&
      !!plugin.contributions?.hostFields,
  );

  return { sections, available };
}

/**
 * One plugin's section: the enable switch first, then whatever it declared.
 *
 * The plugin supplies data only, so it cannot ship its own form styling and
 * drift from the rest of the editor.
 */
export function PluginHostSection({
  section,
  values,
  setValue,
}: {
  section: PluginHostSection;
  values: HostEditorForm["pluginValues"];
  setValue: (key: string, value: string | number | boolean) => void;
}) {
  const { fields, icon: Icon, running } = section;
  const enabled = values[fields.enableKey] === true;

  return (
    <SectionCard title={fields.label} icon={<Icon className="size-3.5" />}>
      {!running && (
        <div className="my-3 border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          {section.label} is installed but not running. These settings are saved
          but will not take effect.
        </div>
      )}

      <SwitchRow
        label={fields.enableLabel}
        description={fields.enableDescription}
        checked={enabled}
        onChange={(value) => setValue(fields.enableKey, value)}
        disabled={!running}
      />

      {enabled && fields.fields && fields.fields.length > 0 && (
        <div
          className={`flex flex-col gap-4 py-3 ${running ? "" : "pointer-events-none opacity-50"}`}
        >
          {fields.fields.map((field) => {
            const current = values[field.key] ?? field.value ?? "";

            if (field.type === "switch") {
              return (
                <SwitchRow
                  key={field.key}
                  label={field.label}
                  description={field.description}
                  checked={current === true}
                  onChange={(value) => setValue(field.key, value)}
                />
              );
            }
            if (field.type === "number") {
              return (
                <NumberField
                  key={field.key}
                  label={field.label}
                  hint={field.description}
                  value={Number(current)}
                  onChange={(value) => setValue(field.key, value)}
                />
              );
            }
            if (field.type === "select") {
              return (
                <SelectField
                  key={field.key}
                  label={field.label}
                  hint={field.description}
                  value={String(current)}
                  onChange={(value) => setValue(field.key, value)}
                  options={(field.options ?? []).map((option) => ({
                    value: option,
                    label: option,
                  }))}
                />
              );
            }
            return (
              <TextField
                key={field.key}
                label={field.label}
                hint={field.description}
                placeholder={field.placeholder}
                value={String(current)}
                onChange={(value) => setValue(field.key, value)}
              />
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

/**
 * The plugins that could add a section here but are not installed.
 *
 * Without this line the editor silently lacks Docker and the user has no way to
 * learn that installing a plugin is what puts it there.
 */
export function AvailablePluginsNote({
  available,
  onOpenPlugins,
}: {
  available: DemoPlugin[];
  onOpenPlugins: () => void;
}) {
  if (available.length === 0) return null;
  return (
    <p className="px-1 text-[10px] text-muted-foreground">
      {available.map((plugin) => plugin.name).join(", ")}{" "}
      {available.length === 1 ? "adds settings" : "add settings"} here once
      installed.{" "}
      <button
        type="button"
        onClick={onOpenPlugins}
        className="text-accent-brand hover:underline focus-visible:ring-1 focus-visible:ring-ring"
      >
        Browse plugins
      </button>
    </p>
  );
}
