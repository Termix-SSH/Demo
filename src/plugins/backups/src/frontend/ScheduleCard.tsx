import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Field,
  Input,
  SectionCard,
  Segmented,
  SelectField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import { isValidCron, nextCronRun } from "../shared/cron";
import { formatDate, partsOf, presetOf, type SchedulePreset } from "./format";

const SERVER = "__server__";

function timezones(): string[] {
  try {
    const list = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.("timeZone");
    if (list?.length) return list;
  } catch {
    // Older browsers have no list.
  }
  return ["UTC", "Europe/London", "Europe/Berlin", "America/New_York"];
}

function cronFor(
  preset: SchedulePreset,
  hour: number,
  minute: number,
  weekday: number,
): string {
  if (preset === "daily") return `${minute} ${hour} * * *`;
  if (preset === "weekly") return `${minute} ${hour} * * ${weekday}`;
  return "";
}

export function ScheduleCard({
  cron,
  timezone,
  onChange,
}: {
  cron: string;
  timezone: string;
  onChange: (next: { cron: string; timezone: string }) => void;
}) {
  const { t } = useTranslation();
  // Kept apart from the cron, so a custom cron that looks daily stays custom.
  const [preset, setPreset] = useState<SchedulePreset>(() => presetOf(cron));
  const parts = partsOf(cron);
  const zones = useMemo(timezones, []);
  const time = `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;

  const set = (
    next: Partial<{
      preset: SchedulePreset;
      hour: number;
      minute: number;
      weekday: number;
      custom: string;
    }>,
  ) => {
    const p = next.preset ?? preset;
    setPreset(p);
    const value =
      p === "custom"
        ? (next.custom ?? (cron || "0 2 * * *"))
        : cronFor(
            p,
            next.hour ?? parts.hour,
            next.minute ?? parts.minute,
            next.weekday ?? parts.weekday,
          );
    onChange({ cron: value, timezone });
  };

  const valid = !cron || isValidCron(cron);
  const next = useMemo(() => {
    if (!cron || !valid) return null;
    try {
      return nextCronRun(cron, new Date(), timezone || null);
    } catch {
      return null;
    }
  }, [cron, timezone, valid]);

  return (
    <SectionCard title={t("schedule.title")} icon={<CalendarClock />}>
      <div className="flex flex-col gap-3 py-2">
        <Segmented
          value={preset}
          onChange={(value) => set({ preset: value })}
          options={[
            { value: "manual", label: t("schedule.manual") },
            { value: "daily", label: t("schedule.daily") },
            { value: "weekly", label: t("schedule.weekly") },
            { value: "custom", label: t("schedule.custom") },
          ]}
        />
        {(preset === "daily" || preset === "weekly") && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {preset === "weekly" && (
              <SelectField
                label={t("schedule.day")}
                value={String(parts.weekday)}
                onChange={(value) => set({ weekday: Number(value) })}
                options={[1, 2, 3, 4, 5, 6, 0].map((day) => ({
                  value: String(day),
                  label: t(`schedule.days.${day}`),
                }))}
              />
            )}
            <Field label={t("schedule.time")}>
              <Input
                type="time"
                value={time}
                onChange={(e) => {
                  const [h, m] = e.target.value.split(":").map(Number);
                  if (Number.isFinite(h) && Number.isFinite(m)) {
                    set({ hour: h, minute: m });
                  }
                }}
              />
            </Field>
          </div>
        )}
        {preset === "custom" && (
          <TextField
            label={t("schedule.cron")}
            value={cron}
            mono
            placeholder="0 2 * * *"
            hint={t("schedule.cronHint")}
            error={valid ? undefined : t("schedule.cronInvalid")}
            onChange={(value) => set({ custom: value })}
          />
        )}
        {preset !== "manual" && (
          <SelectField
            label={t("schedule.timezone")}
            value={timezone || SERVER}
            onChange={(value) =>
              onChange({ cron, timezone: value === SERVER ? "" : value })
            }
            options={[
              { value: SERVER, label: t("schedule.serverTime") },
              ...zones.map((zone) => ({ value: zone, label: zone })),
            ]}
          />
        )}
        <p className="text-xs text-muted-foreground">
          {preset === "manual"
            ? t("schedule.manualHint")
            : next
              ? t("schedule.next", { time: formatDate(next.toISOString()) })
              : t("schedule.noNext")}
        </p>
      </div>
    </SectionCard>
  );
}
