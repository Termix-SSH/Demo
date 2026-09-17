import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  Boxes,
  Check,
  FolderOpen,
  Network,
  Scissors,
  Server,
  TerminalSquare,
} from "lucide-react";
import { Button } from "@/components/button";
import { useUiPreferencesContext } from "@/contexts/UiPreferencesContext";
import {
  effectivePresetLabel,
  UI_ONBOARDING_VERSION,
  type UiPreset,
} from "@/types/ui-preferences";
import {
  ACCENT_PRESET_COLORS,
  applyAccentColor,
  readStoredAccentColor,
} from "@/lib/theme";

/**
 * A short tour on first load.
 *
 * The demo drops you straight into a rail, docks, tabs and a six way split with
 * nothing explaining any of it. The real app answers that with an onboarding
 * dialog, and its copy is already translated here, so this reuses the same keys
 * rather than inventing new ones.
 *
 * Two of the steps do real work: the preset writes through to
 * UiPreferencesContext, and the accent swatches drive the same helper the
 * Appearance settings use. Picking something and seeing the app change is the
 * point, so the tour is not just a slideshow in front of a static screenshot.
 */

type StepId = "welcome" | "preset" | "appearance" | "features";

const STEPS: StepId[] = ["welcome", "preset", "appearance", "features"];

const PRESETS: Exclude<UiPreset, "custom">[] = [
  "simple",
  "balanced",
  "advanced",
];

export function OnboardingDialog() {
  const { t } = useTranslation();
  const ctx = useUiPreferencesContext();
  const [index, setIndex] = useState(0);
  const [accent, setAccent] = useState(readStoredAccentColor);

  const done = ctx
    ? ctx.preferences.onboarding.completedVersion >= UI_ONBOARDING_VERSION
    : true;
  const [dismissed, setDismissed] = useState(done);

  if (!ctx || dismissed) return null;

  const step = STEPS[index];
  const last = index === STEPS.length - 1;

  const close = (skipped: boolean) => {
    ctx.completeOnboarding(skipped);
    setDismissed(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-[520px] flex-col border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <img src="./icon.svg" alt="" className="size-4 object-contain" />
          <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Termix
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            {t("onboarding.stepCounter", {
              current: index + 1,
              total: STEPS.length,
            })}
          </span>
        </div>

        <div className="flex flex-col gap-4 p-5">
          {step === "welcome" && (
            <Step
              title={t("onboarding.welcomeTitle")}
              intro={t("onboarding.welcomeIntro")}
            >
              <Highlights
                rows={[
                  {
                    icon: Server,
                    label: t("onboarding.welcome_hosts"),
                    hint: t("onboarding.welcome_hosts_desc"),
                  },
                  {
                    icon: TerminalSquare,
                    label: t("onboarding.welcome_terminal"),
                    hint: t("onboarding.welcome_terminal_desc"),
                  },
                  {
                    icon: FolderOpen,
                    label: t("onboarding.welcome_files"),
                    hint: t("onboarding.welcome_files_desc"),
                  },
                ]}
              />
            </Step>
          )}

          {step === "preset" && (
            <Step
              title={t("onboarding.presetTitle")}
              intro={t("onboarding.presetIntro")}
            >
              <div className="flex flex-col gap-1.5">
                {PRESETS.map((id) => {
                  const on = effectivePresetLabel(ctx.preferences) === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => ctx.setPreset(id)}
                      className={`flex items-start gap-2.5 border px-3 py-2.5 text-left transition-colors ${
                        on
                          ? "border-accent-brand bg-accent-brand/10"
                          : "border-border hover:border-accent-brand/40"
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border ${
                          on ? "border-accent-brand" : "border-border"
                        }`}
                      >
                        {on && (
                          <span className="size-1.5 rounded-full bg-accent-brand" />
                        )}
                      </span>
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span
                          className={`text-sm font-medium leading-snug ${on ? "text-accent-brand" : ""}`}
                        >
                          {t(`settings.preset${cap(id)}`)}
                        </span>
                        <span className="text-xs leading-snug text-muted-foreground">
                          {t(`settings.preset${cap(id)}Hint`)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t("onboarding.presetChangeLater")}
              </p>
            </Step>
          )}

          {step === "appearance" && (
            <Step
              title={t("onboarding.appearanceTitle")}
              intro={t("onboarding.appearanceIntro")}
            >
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESET_COLORS.map((preset) => {
                  const on =
                    preset.value.toLowerCase() === accent.toLowerCase();
                  return (
                    <button
                      key={preset.value}
                      type="button"
                      title={preset.label}
                      aria-label={preset.label}
                      aria-pressed={on}
                      onClick={() => {
                        applyAccentColor(preset.value);
                        setAccent(preset.value);
                      }}
                      className={`size-7 border transition-transform ${
                        on
                          ? "border-foreground scale-110"
                          : "border-border hover:scale-110"
                      }`}
                      style={{ backgroundColor: preset.value }}
                    />
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                The demo is dark and English only. Everything else here is real.
              </p>
            </Step>
          )}

          {step === "features" && (
            <Step
              title={t("onboarding.featuresTitle")}
              intro={t("onboarding.featuresIntro")}
            >
              <Highlights
                rows={[
                  {
                    icon: FolderOpen,
                    label: t("onboarding.feature_files"),
                    hint: t("onboarding.feature_files_desc"),
                  },
                  {
                    icon: Boxes,
                    label: t("onboarding.feature_docker"),
                    hint: t("onboarding.feature_docker_desc"),
                  },
                  {
                    icon: Network,
                    label: t("onboarding.feature_tunnels"),
                    hint: t("onboarding.feature_tunnels_desc"),
                  },
                  {
                    icon: Scissors,
                    label: t("onboarding.feature_snippets"),
                    hint: t("onboarding.feature_snippets_desc"),
                  },
                ]}
              />
            </Step>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            type="button"
            onClick={() => close(true)}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            {t("onboarding.skip")}
          </button>

          <div className="flex items-center gap-2">
            {index > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-[11px]"
                onClick={() => setIndex((i) => i - 1)}
              >
                {t("common.back")}
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 gap-1.5 bg-accent-brand text-[11px] font-bold uppercase tracking-widest text-background hover:bg-accent-brand/90"
              onClick={() => (last ? close(false) : setIndex((i) => i + 1))}
            >
              {last ? t("onboarding.finish") : t("onboarding.next")}
              {last ? (
                <Check className="size-3.5" />
              ) : (
                <ArrowRight className="size-3.5" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function cap(id: string) {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

function Step({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold tracking-tight">{title}</h2>
        <p className="text-xs leading-snug text-muted-foreground">{intro}</p>
      </div>
      {children}
    </>
  );
}

function Highlights({
  rows,
}: {
  rows: { icon: React.ElementType; label: string; hint: string }[];
}) {
  return (
    <div className="flex flex-col">
      {rows.map((row, i) => {
        const Icon = row.icon;
        return (
          <div
            key={row.label}
            className={`flex items-start gap-3 py-2.5 ${i > 0 ? "border-t border-border" : ""}`}
          >
            <span className="mt-0.5 text-accent-brand">
              <Icon className="size-4" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-medium leading-snug">
                {row.label}
              </span>
              <span className="text-xs leading-snug text-muted-foreground">
                {row.hint}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
