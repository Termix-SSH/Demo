// Rules that give core's square parts the rounded v2.2.1 look, plus the old
// font and white accent. The layout adds them while it shows; the Original
// themes carry the same rules so plugin frames get them too.

/** The class the layout puts on <html> while it is mounted. */
export const LOOK_CLASS = "original-look";

export const LOOK_FONT =
  'system-ui, -apple-system, "Segoe UI", Avenir, Helvetica, Arial, sans-serif';

const LARGE = [
  "card",
  "alert",
  "dropdown-menu-content",
  "dropdown-menu-sub-content",
  "popover-content",
  "select-content",
  "dialog-content",
  "alert-dialog-content",
  "sheet-content",
];
const MEDIUM = [
  "button",
  "input",
  "textarea",
  "select-trigger",
  "sidebar-input",
  "segmented",
  "view-toggle",
  "tabs-list",
  "tooltip-content",
];
const SMALL = [
  "badge",
  "dropdown-menu-item",
  "dropdown-menu-checkbox-item",
  "dropdown-menu-radio-item",
  "dropdown-menu-sub-trigger",
  "select-item",
  "tabs-trigger",
];

function group(scope: string, slots: string[], radius: string): string {
  const selectors = slots.map((slot) => `${scope} [data-slot="${slot}"]`);
  return `${selectors.join(",\n")} {\n  border-radius: ${radius};\n}`;
}

/**
 * The look rules under a selector, like ".original-dark" or
 * "html.original-look". `accent` is the color highlights use.
 */
export function lookCss(scope: string, accent: string): string {
  return [
    `${scope} {\n  --font-ui: ${LOOK_FONT} !important;\n  --accent-brand: ${accent} !important;\n}`,
    group(scope, LARGE, "0.625rem"),
    group(scope, MEDIUM, "0.5rem"),
    group(scope, SMALL, "0.375rem"),
    `${scope} [data-slot="segmented"] > * {\n  border-radius: 0.375rem;\n}`,
    `${scope} [data-slot="checkbox"] {\n  border-radius: 0.25rem;\n}`,
    // Plain controls that did not pick their own corners, or picked square.
    `${scope} :is(button, select, textarea, [role="combobox"], input:not([type="checkbox"]):not([type="radio"]):not([type="range"])):is(:not([class*="rounded-"]), [class*="rounded-none"]) {\n  border-radius: 0.5rem;\n}`,
    // Sub-tabs as the old rounded group: the open one a raised box, no underline.
    `${scope} [data-slot="tab-strip-list"],\n${scope} [data-slot="tabs-list"] {\n  gap: 2px;\n  padding: 3px;\n  border: 1px solid var(--border);\n  border-radius: 0.5rem;\n  background: var(--original-field, var(--muted));\n}`,
    `${scope} [data-slot="tab-strip-list"] {\n  margin: 4px 0;\n}`,
    `${scope} button[data-slot="tab-strip-tab"],\n${scope} button[data-slot="tabs-trigger"] {\n  border: 0 !important;\n  border-radius: 0.375rem !important;\n}`,
    `${scope} button[data-slot="tab-strip-tab"][data-state="active"],\n${scope} button[data-slot="tabs-trigger"][data-state="active"] {\n  background: var(--background);\n  color: var(--foreground);\n  box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);\n}`,
    `${scope} button[role="switch"],\n${scope} button[role="switch"] > span,\n${scope} [data-slot="switch"],\n${scope} [data-slot="switch-thumb"] {\n  border-radius: 9999px;\n}`,
  ].join("\n\n");
}

/**
 * The layout's own shades for any theme, made from its background the way
 * v2.2.1 stepped them. :where() keeps it weak, so the Original themes win.
 */
export function shadeDefaults(): string {
  const mix = (percent: number, to: "black" | "white") =>
    `color-mix(in oklab, var(--background) ${percent}%, ${to})`;
  const block = (selector: string, shades: Record<string, string>) =>
    `${selector} {\n${Object.entries(shades)
      .map(([name, value]) => `  ${name}: ${value};`)
      .join("\n")}\n}`;
  const border = "color-mix(in oklab, var(--border) 80%, white)";
  return [
    block(`:where(html.${LOOK_CLASS})`, {
      "--original-page": mix(50, "black"),
      "--original-deepest": mix(50, "black"),
      "--original-elevated": mix(62, "black"),
      "--original-header": mix(80, "black"),
      "--original-field": mix(94, "white"),
      "--original-button": mix(91, "white"),
      "--original-button-hover": mix(86, "white"),
      "--original-button-border": border,
    }),
    block(`:where(html.${LOOK_CLASS}[${TONE_ATTR}="light"])`, {
      "--original-page": mix(94, "black"),
      "--original-deepest": "var(--background)",
      "--original-elevated": "var(--background)",
      "--original-header": mix(95, "black"),
      "--original-field": "var(--background)",
      "--original-button": mix(97, "black"),
      "--original-button-hover": mix(93, "black"),
      "--original-button-border": "var(--border)",
    }),
  ].join("\n\n");
}

/** Marks <html> light or dark from the theme's background. */
export const TONE_ATTR = "data-original-tone";

export function toneOf(color: string): "light" | "dark" {
  const parts = color.match(/[\d.]+/g)?.map(Number) ?? [];
  if (color.startsWith("oklch") || color.startsWith("oklab")) {
    const l = parts[0] ?? 0;
    return (l > 1 ? l / 100 : l) > 0.6 ? "light" : "dark";
  }
  const [r = 0, g = 0, b = 0] = parts;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 140 ? "light" : "dark";
}

const STYLE_ID = "original-layout-look";

/** Puts the look on the page. Returns how to take it off again. */
export function applyLook(): () => void {
  const root = document.documentElement;
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `${shadeDefaults()}\n\n${lookCss(`html.${LOOK_CLASS}`, "var(--foreground)")}`;
    document.head.appendChild(style);
  }
  root.classList.add(LOOK_CLASS);

  // A theme switch only changes the class on <html>, so watch for it.
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:absolute;width:0;height:0;visibility:hidden;background:var(--background)";
  document.body.appendChild(probe);
  const markTone = () => {
    const tone = toneOf(getComputedStyle(probe).backgroundColor);
    if (root.getAttribute(TONE_ATTR) !== tone)
      root.setAttribute(TONE_ATTR, tone);
  };
  markTone();
  // The new theme's stylesheet can land a moment after the class does.
  let later = 0;
  const watcher = new MutationObserver(() => {
    markTone();
    window.clearTimeout(later);
    later = window.setTimeout(markTone, 400);
  });
  watcher.observe(root, {
    attributes: true,
    attributeFilter: ["class", "style"],
  });

  return () => {
    watcher.disconnect();
    window.clearTimeout(later);
    probe.remove();
    root.classList.remove(LOOK_CLASS);
    root.removeAttribute(TONE_ATTR);
    document.getElementById(STYLE_ID)?.remove();
  };
}
