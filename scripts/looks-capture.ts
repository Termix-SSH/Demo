/**
 * Screenshots of every theme and main view, so a layout change can be
 * checked against the UI as it was. Needs the built demo served first:
 *
 *   npm run build && npx vite preview --port 4173
 *   npx tsx scripts/looks-capture.ts .looks-baseline
 *   npx tsx scripts/looks-capture.ts .looks-after --compare .looks-baseline
 *
 * Flags: --url <demo url>, --theme <id>, --view <id>, --viewport desktop|mobile.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";
import { chromium, type Browser, type Page } from "playwright";

const THEMES = [
  "dark",
  "light",
  "dracula",
  "catppuccin",
  "nord",
  "solarized",
  "tokyo-night",
  "one-dark",
  "gruvbox",
];

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  mobile: { width: 390, height: 844 },
} as const;
type ViewportId = keyof typeof VIEWPORTS;

interface View {
  id: string;
  desktopOnly?: boolean;
  run: (page: Page, viewport: ViewportId) => Promise<void>;
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const outDir =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;
if (!outDir) {
  console.error(
    "Usage: tsx scripts/looks-capture.ts <outDir> [--compare <dir>]",
  );
  process.exit(1);
}
const DEMO_URL = arg("url") ?? "http://localhost:4173/";
const stateFile = join(outDir, ".state.json");

async function settle(page: Page, ms = 800) {
  await page.waitForTimeout(ms);
}

async function palette(page: Page) {
  await page.keyboard.press("Control+k");
  await page
    .locator("[cmdk-input], input[placeholder]")
    .filter({ visible: true })
    .last()
    .waitFor();
  await settle(page, 400);
}

async function openHost(page: Page, host: string) {
  await palette(page);
  await page.keyboard.type(host);
  await settle(page, 400);
  await page.keyboard.press("Enter");
  await page.locator(".xterm").filter({ visible: true }).first().waitFor();
  await settle(page, 1500);
}

async function openMobileMenu(page: Page, label: string) {
  const nav = page.getByRole("navigation", { name: "Navigation" });
  const direct = nav.getByRole("button", { name: label, exact: true });
  if (await direct.count()) {
    await direct.first().click();
    return;
  }
  await nav.getByRole("button", { name: "More", exact: true }).click();
  await page
    .getByText(label, { exact: true })
    .filter({ visible: true })
    .first()
    .click();
}

async function openSettings(page: Page, viewport: ViewportId) {
  if (viewport === "mobile") await openMobileMenu(page, "Settings");
  else
    await page
      .locator('[title="Open settings"], [aria-label="Open settings"]')
      .first()
      .click();
  await settle(page, 1200);
}

const VIEWS: View[] = [
  { id: "dashboard", run: async () => {} },
  {
    id: "terminal",
    run: async (page) => openHost(page, "db-primary"),
  },
  {
    id: "split",
    desktopOnly: true,
    run: async (page) => {
      await openHost(page, "db-primary");
      await page.getByLabel("Split screen").first().click();
      await page.getByText("Split right").first().click();
      await settle(page);
      await openHost(page, "web-01");
    },
  },
  {
    id: "hosts-sidebar",
    run: async (page, viewport) => {
      if (viewport === "mobile") {
        await openMobileMenu(page, "Hosts");
      } else {
        const rail = page.locator("[data-rail-item][title^='Hosts']").first();
        const open = await page.locator('[title="Collapse sidebar"]').count();
        if (!open) await rail.click();
      }
      await settle(page);
    },
  },
  {
    id: "rail-right",
    desktopOnly: true,
    run: async (page) => {
      await page.getByLabel("Toggle right dock").first().click();
      await settle(page);
    },
  },
  {
    id: "manage",
    run: async (page) => {
      await page.evaluate(() =>
        window.dispatchEvent(new Event("manage:request")),
      );
      await settle(page, 1500);
    },
  },
  {
    id: "settings",
    run: async (page, viewport) => openSettings(page, viewport),
  },
  {
    id: "palette",
    run: async (page) => {
      await palette(page);
    },
  },
];

async function prepareState(browser: Browser) {
  const context = await browser.newContext({ viewport: VIEWPORTS.desktop });
  await context.addInitScript(() =>
    localStorage.setItem("termix-demo-recording", "1"),
  );
  const page = await context.newPage();
  await page.goto(DEMO_URL);
  await page.locator("input[type=password]").waitFor();
  await page.locator("input").first().fill("demo");
  await page.locator("input[type=password]").fill("demo");
  await page.locator("button[type=submit]").click();
  await page.getByText("Turn all on").click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Skip setup").click();
  await page.getByText("Host Status").waitFor();
  await settle(page, 1000);
  await context.storageState({ path: stateFile });
  await context.close();
}

async function capture(
  browser: Browser,
  viewport: ViewportId,
  theme: string,
  view: View,
  file: string,
) {
  const context = await browser.newContext({
    viewport: VIEWPORTS[viewport],
    storageState: stateFile,
    reducedMotion: "reduce",
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await context.addInitScript((id) => {
    localStorage.setItem("termix-demo-recording", "1");
    localStorage.setItem("vite-ui-theme", id);
  }, theme);
  const page = await context.newPage();
  try {
    await page.goto(DEMO_URL);
    await page.getByText("Host Status").first().waitFor({ timeout: 30_000 });
    await settle(page, 1500);
    await view.run(page, viewport);
    // Away from the rail, which expands on hover.
    const size = VIEWPORTS[viewport];
    await page.mouse.move(size.width - 2, Math.round(size.height / 2));
    await settle(page, 600);
    await page.screenshot({
      path: file,
      animations: "disabled",
      caret: "hide",
    });
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message.split("\n")[0]
      : String(error);
  } finally {
    await context.close();
  }
}

/** Shots whose pixels differ by more than a small share, with a diff image each. */
function compare(baseDir: string, shots: string[]) {
  const changed: string[] = [];
  for (const shot of shots) {
    const before = join(baseDir, shot);
    if (!existsSync(before)) {
      changed.push(`${shot} (no baseline)`);
      continue;
    }
    const a = PNG.sync.read(readFileSync(before));
    const b = PNG.sync.read(readFileSync(join(outDir!, shot)));
    if (a.width !== b.width || a.height !== b.height) {
      changed.push(`${shot} (size changed)`);
      continue;
    }
    const diff = new PNG({ width: a.width, height: a.height });
    const pixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
      threshold: 0.1,
    });
    const share = pixels / (a.width * a.height);
    if (share > 0.001) {
      const diffFile = join(outDir!, "diff", shot);
      mkdirSync(dirname(diffFile), { recursive: true });
      writeFileSync(diffFile, PNG.sync.write(diff));
      changed.push(`${shot} (${(share * 100).toFixed(2)}%)`);
    }
  }
  return changed;
}

async function main() {
  mkdirSync(outDir!, { recursive: true });
  const browser = await chromium.launch({ args: ["--hide-scrollbars"] });
  await prepareState(browser);

  const themes = arg("theme") ? [arg("theme")!] : THEMES;
  const views = arg("view") ? VIEWS.filter((v) => v.id === arg("view")) : VIEWS;
  const viewports = (
    arg("viewport") ? [arg("viewport")] : Object.keys(VIEWPORTS)
  ) as ViewportId[];

  const shots: string[] = [];
  const failures: Record<string, string> = {};
  for (const viewport of viewports) {
    for (const theme of themes) {
      mkdirSync(join(outDir!, viewport, theme), { recursive: true });
      for (const view of views) {
        if (view.desktopOnly && viewport === "mobile") continue;
        const shot = `${viewport}/${theme}/${view.id}.png`;
        const error = await capture(
          browser,
          viewport,
          theme,
          view,
          join(outDir!, shot),
        );
        if (error) failures[shot] = error;
        else shots.push(shot);
        console.log(error ? `fail ${shot}: ${error}` : `ok   ${shot}`);
      }
    }
  }
  await browser.close();

  writeFileSync(
    join(outDir!, "manifest.json"),
    JSON.stringify(
      { url: DEMO_URL, takenAt: new Date().toISOString(), shots, failures },
      null,
      2,
    ),
  );

  const base = arg("compare");
  if (base) {
    const changed = compare(resolve(base), shots);
    console.log(
      changed.length ? `\nChanged:\n${changed.join("\n")}` : "\nNo changes.",
    );
    if (changed.length) process.exitCode = 1;
  }
  if (Object.keys(failures).length) process.exitCode = 1;
}

void main();
