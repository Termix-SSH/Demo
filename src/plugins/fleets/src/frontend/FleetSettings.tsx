import {
  useTranslation,
  type SettingsState,
} from "@termix-ssh/plugin-sdk/frontend";
import { Rows3, SlidersHorizontal } from "lucide-react";
import {
  FakeSwitch,
  InlineView,
  SectionCard,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";

export function readFleetSettings(values: Record<string, unknown>) {
  return { alwaysShowActions: values.alwaysShowActions === true };
}

export function FleetSettings({
  settings,
  onBack,
}: {
  settings: SettingsState;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const current = readFleetSettings(settings.values);

  return (
    <InlineView
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<SlidersHorizontal className="size-4" />}
      title={t("newUi.sidebar.fleets.settingsTitle")}
    >
      <SectionCard
        title={t("newUi.sidebar.fleets.settingsDisplayTitle")}
        icon={<Rows3 className="size-3.5" />}
      >
        <SettingRow
          label={t("settings.alwaysShowActions.label")}
          description={t("settings.alwaysShowActions.description")}
        >
          <FakeSwitch
            checked={current.alwaysShowActions}
            onChange={(v) =>
              void settings.save({ ...settings.values, alwaysShowActions: v })
            }
          />
        </SettingRow>
      </SectionCard>
    </InlineView>
  );
}
