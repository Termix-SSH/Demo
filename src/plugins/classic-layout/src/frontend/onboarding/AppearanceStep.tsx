import { useRef, useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ACCENT_PRESET_COLORS,
  FONT_SIZES,
  Input,
  LANGUAGES,
  Select2,
  UI_FONTS,
  applyAccentColor,
  applyFontSize,
  applyUiFont,
  changeAppLanguage,
  getUserPreferences,
  normalizeLanguageCode,
  saveUserPreferences,
  useChooseTheme,
  useTheme,
  useThemeOptions,
  type FontSizeId,
  type ThemeId,
  type UiFontId,
} from "@termix-ssh/plugin-sdk/ui";

const DEFAULT_ACCENT = "#f59145";

type ThemeSwatch = NonNullable<
  ReturnType<typeof useThemeOptions>[number]["swatch"]
>;

function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value) || /^#[0-9a-fA-F]{3}$/.test(value);
}

type CloudPrefs = Parameters<typeof saveUserPreferences>[0];

/** Saves to the account only for users who sync settings to the server. */
async function saveIfCloud(prefs: CloudPrefs): Promise<void> {
  try {
    const current = await getUserPreferences();
    if (current?.storageMode === "cloud") await saveUserPreferences(prefs);
  } catch {
    // The local copy already holds the change.
  }
}

/**
 * Theme, accent, font and language, applied right away and stored the same
 * way the profile settings store them.
 */
function useAppearanceSettings() {
  const { theme } = useTheme();
  const chooseTheme = useChooseTheme();
  const [accent, setAccentState] = useState(
    () => localStorage.getItem("termix-accent") ?? DEFAULT_ACCENT,
  );
  const [fontSize, setFontSizeState] = useState<FontSizeId>(
    () => (localStorage.getItem("termix-font-size") as FontSizeId) ?? "md",
  );
  const [uiFont, setUiFontState] = useState<UiFontId>(
    () =>
      (localStorage.getItem("termix-ui-font") as UiFontId) ?? "jetbrains-mono",
  );
  const [language, setLanguageState] = useState(() =>
    normalizeLanguageCode(localStorage.getItem("i18nextLng")),
  );

  return {
    theme,
    accent,
    fontSize,
    uiFont,
    language,
    setTheme(id: ThemeId) {
      chooseTheme(id);
    },
    setAccent(value: string) {
      setAccentState(value);
      localStorage.setItem("termix-accent", value);
      applyAccentColor(value);
      void saveIfCloud({ accentColor: value });
    },
    setFontSize(id: FontSizeId) {
      setFontSizeState(id);
      applyFontSize(id);
      void saveIfCloud({ fontSize: id });
    },
    setUiFont(id: UiFontId) {
      setUiFontState(id);
      applyUiFont(id);
    },
    setLanguage(code: string) {
      void changeAppLanguage(code)
        .then((next) => {
          setLanguageState(next);
          void saveIfCloud({ language: next });
        })
        .catch(() => {});
    },
  };
}

function MiniWindow({ background, panel, text }: ThemeSwatch) {
  return (
    <div className="flex h-full w-full" style={{ background }}>
      <div
        className="flex w-1/4 flex-col gap-1 p-1"
        style={{ background: panel }}
      >
        <div className="h-1 w-3/4" style={{ background: text, opacity: 0.6 }} />
        <div
          className="h-1 w-1/2"
          style={{ background: text, opacity: 0.35 }}
        />
        <div
          className="h-1 w-2/3"
          style={{ background: text, opacity: 0.35 }}
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-1.5">
        <div className="h-1 w-1/2 bg-accent-brand" />
        <div
          className="h-1 w-5/6"
          style={{ background: text, opacity: 0.45 }}
        />
        <div className="h-1 w-2/3" style={{ background: text, opacity: 0.3 }} />
      </div>
    </div>
  );
}

function ThemePreview({
  swatch,
  light,
  dark,
}: {
  swatch: ThemeSwatch | null;
  light?: ThemeSwatch | null;
  dark?: ThemeSwatch | null;
}) {
  if (!swatch) {
    return (
      <div className="flex h-14 w-full">
        <div className="flex-1">{light && <MiniWindow {...light} />}</div>
        <div className="flex-1">{dark && <MiniWindow {...dark} />}</div>
      </div>
    );
  }
  return (
    <div className="h-14 w-full">
      <MiniWindow {...swatch} />
    </div>
  );
}

function ThemeGrid({
  value,
  onChange,
}: {
  value: ThemeId;
  onChange: (id: ThemeId) => void;
}) {
  const { setThemePreview } = useTheme();
  const options = useThemeOptions();
  const light = options.find((option) => option.id === "light")?.swatch;
  const dark = options.find((option) => option.id === "dark")?.swatch;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {options.map(({ id, label, swatch }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => {
              setThemePreview(null);
              onChange(id);
            }}
            onMouseEnter={() => setThemePreview(id)}
            onMouseLeave={() => setThemePreview(null)}
            onFocus={() => setThemePreview(id)}
            onBlur={() => setThemePreview(null)}
            className={`flex flex-col overflow-hidden border text-left transition-colors ${
              active
                ? "border-accent-brand ring-1 ring-accent-brand"
                : "border-border hover:border-foreground/40"
            }`}
          >
            <ThemePreview swatch={swatch} light={light} dark={dark} />
            <span className="flex items-center justify-between gap-1 border-t border-border bg-card px-2 py-1.5 text-[11px]">
              {label}
              {active && <Check size={11} className="text-accent-brand" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function AccentPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(value);
  const [lastValue, setLastValue] = useState(value);
  if (value !== lastValue) {
    setLastValue(value);
    setDraft(value);
  }

  const commit = () => {
    const next = draft.trim();
    if (isHexColor(next)) onChange(next);
    else setDraft(value);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
        {ACCENT_PRESET_COLORS.map((color) => (
          <button
            key={color.value}
            type="button"
            title={color.label}
            aria-label={color.label}
            aria-pressed={value === color.value}
            onClick={() => onChange(color.value)}
            className="flex h-7 items-center justify-center border border-border"
            style={{ background: color.value }}
          >
            {value === color.value && (
              <Check size={12} className="text-white drop-shadow" />
            )}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 border border-border bg-muted/30 px-2 py-1.5">
        <button
          type="button"
          onClick={() => colorInputRef.current?.click()}
          className="size-5 shrink-0 cursor-pointer border border-border/60"
          style={{ background: value }}
          title={t("newUi.sidebar.userProfile.colorPickerTooltip")}
        />
        <input
          ref={colorInputRef}
          type="color"
          value={
            value.startsWith("#") && value.length === 7 ? value : "#f97316"
          }
          onChange={(e) => onChange(e.target.value)}
          className="sr-only"
        />
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
          }}
          placeholder="#f97316"
          className="h-6 min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[11px] focus-visible:ring-0"
        />
        <span className="shrink-0 text-[10px] text-muted-foreground">hex</span>
      </div>
    </div>
  );
}

function FontSizePicker({
  value,
  onChange,
}: {
  value: FontSizeId;
  onChange: (id: FontSizeId) => void;
}) {
  return (
    <div className="flex gap-1">
      {FONT_SIZES.map((size) => (
        <button
          key={size.id}
          type="button"
          aria-pressed={value === size.id}
          onClick={() => onChange(size.id)}
          className={`flex-1 border py-1.5 text-[10px] font-bold transition-colors ${
            value === size.id
              ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
        >
          {size.label}
        </button>
      ))}
    </div>
  );
}

const SELECT_CLASS =
  "w-full border border-border bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:ring-1 focus:ring-ring";

function UiFontSelect({
  value,
  onChange,
}: {
  value: UiFontId;
  onChange: (id: UiFontId) => void;
}) {
  return (
    <Select2
      value={value}
      onChange={(e) => onChange(e.target.value as UiFontId)}
      className={SELECT_CLASS}
    >
      {UI_FONTS.map((font) => (
        <option key={font.id} value={font.id}>
          {font.label}
        </option>
      ))}
    </Select2>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <Select2
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={SELECT_CLASS}
    >
      {LANGUAGES.map((lang) => (
        <option key={lang.code} value={lang.code}>
          {lang.label}
        </option>
      ))}
    </Select2>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && (
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

/** Every change applies right away, so the page itself is the preview. */
export function AppearanceStep() {
  const { t } = useTranslation();
  const appearance = useAppearanceSettings();

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs text-muted-foreground">
        {t("onboarding.appearanceIntro")}
      </p>

      <Field label={t("newUi.sidebar.userProfile.themeLabel")}>
        <ThemeGrid value={appearance.theme} onChange={appearance.setTheme} />
      </Field>

      <Field label={t("newUi.sidebar.userProfile.accentColorLabel")}>
        <AccentPicker
          value={appearance.accent}
          onChange={appearance.setAccent}
        />
      </Field>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Field
          label={t("newUi.sidebar.userProfile.interfaceFontLabel")}
          hint={t("newUi.sidebar.userProfile.interfaceFontDescription")}
        >
          <UiFontSelect
            value={appearance.uiFont}
            onChange={appearance.setUiFont}
          />
        </Field>
        <Field label={t("newUi.sidebar.userProfile.fontSizeLabel")}>
          <FontSizePicker
            value={appearance.fontSize}
            onChange={appearance.setFontSize}
          />
        </Field>
      </div>

      <Field label={t("newUi.sidebar.userProfile.languageLabel")}>
        <LanguageSelect
          value={appearance.language}
          onChange={appearance.setLanguage}
        />
      </Field>
    </div>
  );
}
