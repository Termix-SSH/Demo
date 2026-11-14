/**
 * Checks other plugins' parts inside framed plugins (S27) on a running
 * Termix: every placeholder a frame reports has a view the shell draws over
 * it, at the same spot, clipped to the frame, before and after a scroll, a
 * resize, an edit mode and a theme change. Screenshots at each width.
 *
 *   npx tsx scripts/foreign-audit.ts <outDir> [--url http://localhost:5173]
 *     [--host 9] [--sizes 1440x900,1920x1080,390x844]
 *
 * Point it at `npm run dev` with every plugin on.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { arg, login, settle, slug } from "./audit-lib";

const outDir =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;
if (!outDir) {
  console.error("Usage: tsx scripts/foreign-audit.ts <outDir>");
  process.exit(1);
}
const URL_BASE = arg("url") ?? "http://localhost:5173/";
const HOST = arg("host") ?? "9";
const SIZES = (arg("sizes") ?? "1440x900,1920x1080,390x844")
  .split(",")
  .map((size) => size.split("x").map(Number) as [number, number]);
/** Off by more than this many px counts as misplaced. */
const SLACK = 2;

interface Spot {
  id: string;
  frame: string;
  /** Placeholder rect in the page: frame rect plus its rect in the frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  shown: boolean;
}

interface ViewBox {
  id: string;
  plugin: string;
  x: number;
  y: number;
  width: number;
  height: number;
  hidden: boolean;
  /** The layer's box, which every view is clipped to. */
  layer: { x: number; y: number; width: number; height: number };
}

interface Check {
  size: string;
  screen: string;
  step: string;
  placeholders: number;
  views: number;
  shown: number;
  misplaced: string[];
  missing: string[];
  outside: string[];
  shot: string;
}

const checks: Check[] = [];

function within<T>(work: Promise<T>, fallback: T, ms = 3000): Promise<T> {
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((done) => setTimeout(() => done(fallback), ms)),
  ]);
}

async function placeholders(page: Page): Promise<Spot[]> {
  const out: Spot[] = [];
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    const element = await within(frame.frameElement(), null);
    if (!element) continue;
    const role = await within(element.getAttribute("data-frame-role"), null);
    if (role === "background") continue;
    const box = await within(element.boundingBox(), null);
    if (!box || box.width === 0) continue;
    const plugin =
      (await within(element.getAttribute("data-plugin-frame"), null)) ?? "?";
    const spots = await within(
      frame.evaluate(`[...document.querySelectorAll("[data-foreign-id]")].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.getAttribute("data-foreign-id"), x: r.left, y: r.top, width: r.width, height: r.height,
          shown: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight };
      })`),
      [] as Spot[],
    );
    for (const spot of spots as Spot[]) {
      out.push({
        ...spot,
        frame: plugin,
        x: box.x + spot.x,
        y: box.y + spot.y,
      });
    }
  }
  return out;
}

async function views(page: Page): Promise<ViewBox[]> {
  return (await page.evaluate(`[...document.querySelectorAll("#termix-foreign-views [data-foreign-id]")].map((el) => {
    const r = el.getBoundingClientRect();
    const l = el.parentElement.getBoundingClientRect();
    return { id: el.getAttribute("data-foreign-id"), plugin: el.getAttribute("data-foreign-view"),
      x: r.left, y: r.top, width: r.width, height: r.height,
      hidden: getComputedStyle(el).visibility === "hidden" || getComputedStyle(el.parentElement).display === "none",
      layer: { x: l.left, y: l.top, width: l.width, height: l.height } };
  })`)) as ViewBox[];
}

async function check(page: Page, size: string, screen: string, step: string) {
  await settle(page, 1500);
  const spots = await placeholders(page);
  const drawn = await views(page);
  const byId = new Map(drawn.map((view) => [view.id, view]));
  const misplaced: string[] = [];
  const missing: string[] = [];
  const outside: string[] = [];
  for (const spot of spots) {
    const view = byId.get(spot.id);
    if (!view) {
      missing.push(`${spot.frame}:${spot.id}`);
      continue;
    }
    if (view.hidden) continue;
    const off =
      Math.abs(view.x - spot.x) > SLACK ||
      Math.abs(view.y - spot.y) > SLACK ||
      Math.abs(view.width - spot.width) > SLACK;
    if (off) {
      misplaced.push(
        `${view.plugin} in ${spot.frame}: view ${Math.round(view.x)},${Math.round(view.y)} spot ${Math.round(spot.x)},${Math.round(spot.y)}`,
      );
    }
    // The visible part of a view never leaves its layer.
    const { layer } = view;
    if (layer.width > 0 && (layer.x < -SLACK || layer.y < -SLACK)) {
      outside.push(`${view.plugin} layer at ${layer.x},${layer.y}`);
    }
  }
  const shot = `${slug(size)}-${slug(screen)}-${slug(step)}.png`;
  await page.screenshot({ path: join(outDir!, "shots", shot) });
  const entry: Check = {
    size,
    screen,
    step,
    placeholders: spots.length,
    views: drawn.length,
    shown: drawn.filter((view) => !view.hidden).length,
    misplaced,
    missing,
    outside,
    shot,
  };
  checks.push(entry);
  console.log(
    `${size} ${screen} / ${step}: ${spots.length} spots, ${entry.shown}/${drawn.length} views shown, ${misplaced.length} misplaced, ${missing.length} missing`,
  );
}

/** Scrolls the first scroll box in every plugin frame. */
async function scrollFrames(page: Page, by: number) {
  for (const frame of page.frames()) {
    if (frame === page.mainFrame()) continue;
    await within(
      frame.evaluate(`(() => {
        const boxes = [...document.querySelectorAll("*")].filter((el) => {
          const s = getComputedStyle(el);
          return /(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 4;
        });
        if (boxes[0]) boxes[0].scrollTop += ${by};
      })()`),
      undefined,
    );
  }
}

async function home(page: Page) {
  await page.goto(URL_BASE);
  await page
    .locator("[data-rail-item]")
    .first()
    .waitFor({ timeout: 60_000 })
    .catch(() => {});
  await settle(page, 3000);
}

async function openHomepage(page: Page) {
  await home(page);
  const button = page
    .locator("button, [role=tab]")
    .filter({ hasText: /^Homepage$/ });
  if (!(await button.count())) return false;
  await button.first().click();
  await settle(page, 6000);
  return true;
}

async function homepageEdit(page: Page, size: string) {
  for (const frame of page.frames()) {
    const customize = frame
      .locator("button")
      .filter({ hasText: /^\s*Customize\s*$/ });
    if (await within(customize.count(), 0)) {
      await customize
        .first()
        .click()
        .catch(() => {});
      await check(page, size, "Homepage", "customize");
      const pointer = await page.evaluate(
        `[...document.querySelectorAll("#termix-foreign-views [data-foreign-id]")].map((el) => getComputedStyle(el).pointerEvents)`,
      );
      checks[checks.length - 1].misplaced.push(
        ...(pointer as string[])
          .filter((value) => value !== "none")
          .map(() => "a widget still takes clicks in customize"),
      );
      await customize
        .first()
        .click()
        .catch(() => {});
      return;
    }
  }
}

async function hostTool(page: Page, title: RegExp) {
  await home(page);
  const search = page.getByPlaceholder(/search hosts/i).first();
  if (!(await search.isVisible().catch(() => false))) {
    await page
      .locator("[data-rail-item]")
      .first()
      .click()
      .catch(() => {});
  }
  await settle(page, 800);
  const row = page.locator(`[data-host-id="${HOST}"]`).first();
  // Hosts sit in folders that start closed.
  for (let i = 0; i < 3 && !(await row.count()); i++) {
    const folders = page.locator("svg.lucide-folder:visible");
    const n = await folders.count();
    for (let f = 0; f < n && !(await row.count()); f++) {
      await folders
        .nth(f)
        .click({ timeout: 3000 })
        .catch(() => {});
      await settle(page, 400);
    }
  }
  if (!(await row.count())) return false;
  await row.hover();
  const buttons = row.locator("button[title]");
  const titles = await buttons.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("title") ?? ""),
  );
  const index = titles.findIndex((value) => title.test(value));
  if (index < 0) return false;
  await buttons.nth(index).click();
  await settle(page, 7000);
  return true;
}

async function switchTheme(page: Page) {
  // Flip the shell between the light and dark look the way the theme menu does.
  await page.evaluate(`(() => {
    const root = document.documentElement;
    root.classList.toggle("light");
    root.classList.toggle("dark");
  })()`);
}

async function runSize(page: Page, width: number, height: number) {
  const size = `${width}x${height}`;
  await page.setViewportSize({ width, height });

  if (await openHomepage(page)) {
    await check(page, size, "Homepage", "open");
    await scrollFrames(page, 400);
    await check(page, size, "Homepage", "scrolled");
    await homepageEdit(page, size);
    await switchTheme(page);
    await check(page, size, "Homepage", "theme");
    await switchTheme(page);
  }

  const tools: Array<[string, RegExp, string[]]> = [
    ["Host Metrics", /metrics/i, ["Customize"]],
    ["Host page", /host page|operations/i, []],
    ["Terminal", /terminal|ssh/i, []],
    ["Files", /file/i, []],
    ["Tmux", /tmux/i, []],
    ["Proxmox", /proxmox/i, []],
  ];
  for (const [screen, title, edit] of tools) {
    if (!(await hostTool(page, title).catch(() => false))) {
      console.log(`${size} ${screen}: no host tool`);
      continue;
    }
    await check(page, size, screen, "open");
    if (screen === "Terminal") {
      // The assistant's button on the terminal, else its shortcut.
      let opened = false;
      for (const frame of page.frames()) {
        const button = frame.locator('button[title*="Ctrl+Shift+A"]');
        if (await within(button.count(), 0)) {
          await button
            .first()
            .click()
            .catch(() => {});
          opened = true;
          break;
        }
      }
      if (!opened) await page.keyboard.press("Control+Shift+A").catch(() => {});
      await check(page, size, screen, "side panel");
    }
    await scrollFrames(page, 400);
    await check(page, size, screen, "scrolled");
    for (const label of edit) {
      for (const frame of page.frames()) {
        const button = frame.locator(`button[title="${label}"]`);
        if (await within(button.count(), 0)) {
          await button
            .first()
            .click()
            .catch(() => {});
          await check(page, size, screen, "edit");
          await button
            .first()
            .click()
            .catch(() => {});
          break;
        }
      }
    }
  }
}

async function main() {
  mkdirSync(join(outDir!, "shots"), { recursive: true });
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  page.on("dialog", (dialog) => void dialog.dismiss().catch(() => {}));
  await login(page, URL_BASE);
  for (const [width, height] of SIZES) {
    try {
      await runSize(page, width, height);
    } catch (error) {
      console.log(`${width}x${height} stopped: ${String(error).slice(0, 200)}`);
    }
  }
  writeFileSync(join(outDir!, "foreign.json"), JSON.stringify(checks, null, 2));
  const bad = checks.filter(
    (entry) =>
      entry.misplaced.length || entry.missing.length || entry.outside.length,
  );
  const lines = [
    "| Size | Screen | Step | Spots | Views shown | Problems | Shot |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...checks.map(
      (entry) =>
        `| ${entry.size} | ${entry.screen} | ${entry.step} | ${entry.placeholders} | ${entry.shown}/${entry.views} | ${
          [
            ...entry.misplaced,
            ...entry.missing.map((m) => `missing ${m}`),
            ...entry.outside,
          ].join("; ") || "none"
        } | shots/${entry.shot} |`,
    ),
  ];
  writeFileSync(join(outDir!, "foreign.md"), `${lines.join("\n")}\n`);
  console.log(`${checks.length} checks, ${bad.length} with problems`);
  await browser.close();
}

void main();
