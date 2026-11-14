/**
 * Walks every screen of a running Termix (dev build, every plugin on) and
 * records what plugin frames do on each: console errors, core requests the
 * frame policy refused, frames that stay 0 px, blank or never get ready,
 * reads of other plugins' parts a frame can't see, and the visible labels
 * (headings, tabs, cards) for a before and after diff.
 *
 *   npx tsx scripts/frame-audit.ts <outDir> [--url http://localhost:5173]
 *     [--host 9] [--host-name Testing] [--only <text>] [--no-click]
 *
 * The refused, ready and read lines come from the shell's dev-only logs, so
 * point it at `npm run dev`, never a production build.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Frame, type Locator, type Page } from "playwright";
import {
  arg,
  DESTRUCTIVE,
  login,
  openPalette as openPaletteKeys,
  paletteItems as paletteItemsKeys,
  settle,
  SKIP,
  slug,
} from "./audit-lib";

const outDir =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;
if (!outDir) {
  console.error("Usage: tsx scripts/frame-audit.ts <outDir>");
  process.exit(1);
}
const URL_BASE = arg("url") ?? "http://localhost:5173/";
const HOST = arg("host") ?? "9";
const HOST_NAME = arg("host-name") ?? "Testing";
const ONLY = arg("only")?.toLowerCase().split(",");
const CLICK = !process.argv.includes("--no-click");
const SUB_LIMIT = 30;

/** Ctrl+K, else the rail's search button (focus may sit inside a frame). */
async function openPalette(page: Page) {
  try {
    await page.mouse.click(960, 3);
    await openPaletteKeys(page);
  } catch {
    await page.keyboard.press("Escape");
    await page.locator("button").first().click({ timeout: 4000, force: true });
    await page.locator("[cmdk-input]").first().waitFor({ timeout: 5000 });
  }
}

async function paletteItems(page: Page) {
  await openPalette(page);
  await page.keyboard.press("Escape");
  return paletteItemsKeys(page);
}

const matches = (text: string) =>
  !ONLY || ONLY.some((o) => text.toLowerCase().includes(o));

interface FrameInfo {
  plugin: string;
  key: string;
  width: number;
  height: number;
  /** Drew nothing while it has room. */
  blank: boolean;
  /** Its page has text or controls. */
  content: boolean;
}

interface ViewRecord {
  section: string;
  name: string;
  shot: string;
  console: string[];
  refused: string[];
  emptyReads: string[];
  notReady: string[];
  zeroFrames: string[];
  blankFrames: string[];
  frames: FrameInfo[];
  labels: string[];
}

type Noise = {
  errors: string[];
  refused: string[];
  reads: string[];
  ready: string[];
};

function watch(page: Page): Noise {
  const noise: Noise = { errors: [], refused: [], reads: [], ready: [] };
  page.on("console", (msg) => {
    const text = msg.text().replace(/\s+/g, " ").slice(0, 300);
    if (text.startsWith("[frame-policy] refused")) noise.refused.push(text);
    else if (text.startsWith("[frame-read]")) noise.reads.push(text);
    else if (/^\[frame\] .* never reported ready/.test(text)) {
      noise.ready.push(text);
    } else if (
      msg.type() === "error" &&
      !text.startsWith("Failed to load resource")
    ) {
      noise.errors.push(text);
    }
  });
  page.on("pageerror", (error) =>
    noise.errors.push(`PAGE ERROR ${String(error).slice(0, 300)}`),
  );
  // Name the request behind a "Failed to load resource" line.
  page.on("response", (response) => {
    const status = response.status();
    if (status < 400 || status === 401) return;
    noise.errors.push(
      `${status} ${response.request().method()} ${response
        .url()
        .replace(/^https?:\/\/[^/]+/, "")
        .replace(/^\/__termix_api\/\d+/, "")
        .slice(0, 200)}`,
    );
  });
  return noise;
}

/** A frame that hangs (a busy page, a dialog) must not stop the walk. */
function within<T>(work: Promise<T>, fallback: T, ms = 4000): Promise<T> {
  return Promise.race([
    work.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

/** View frames by their URL, without a round trip per frame. */
function viewFrames(page: Page): Frame[] {
  return page
    .frames()
    .filter((frame) => /[#&]role=view(&|$)/.test(frame.url()));
}

function take(list: string[]): string[] {
  const out = [...new Set(list)];
  list.length = 0;
  return out;
}

/** Visible view frames on the page, with their size and whether they drew anything. */
async function frameInfo(page: Page): Promise<FrameInfo[]> {
  const out: FrameInfo[] = [];
  for (const frame of viewFrames(page)) {
    const element = await within(frame.frameElement(), null);
    if (!element) continue;
    const meta = (await within(
      element.evaluate((node) => {
        const el = node as HTMLIFrameElement;
        if (!el.dataset.pluginFrame || el.dataset.frameRole === "background") {
          return null;
        }
        // Frames in hidden tabs don't count.
        if (
          !el.checkVisibility({ visibilityProperty: true }) ||
          (el.style.position === "absolute" &&
            el.style.pointerEvents === "none")
        ) {
          return null;
        }
        const rect = el.getBoundingClientRect();
        let key = "";
        try {
          const url = new URL(el.src);
          key =
            new URLSearchParams(url.hash.slice(1)).get("key") ??
            url.searchParams.get("key") ??
            "";
        } catch {
          // No key.
        }
        return {
          plugin: el.dataset.pluginFrame,
          key,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }),
      null,
    )) as Omit<FrameInfo, "blank" | "content"> | null;
    if (!meta) continue;
    const content = await within(
      frame.evaluate(
        `(() => {
          const body = document.body;
          if (!body) return false;
          if ((body.innerText || "").trim()) return true;
          for (const node of body.querySelectorAll("svg,canvas,img,video,input,button,textarea,select")) {
            const rect = node.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) return true;
            // In a 0 px frame nothing has a box; count what would show.
            if (node.checkVisibility && node.checkVisibility() && getComputedStyle(node).display !== "none") return true;
          }
          return false;
        })()`,
      ),
      false,
    ).then(Boolean);
    const blank = meta.width > 0 && meta.height > 0 && !content;
    out.push({ ...meta, blank, content });
  }
  return out;
}

const LABELS = `(() => {
  const pick = [
    "h1", "h2", "h3", "h4", "[role=tab]", "th",
    "button[class*='border-b-2']", "nav[class*='w-44'] button",
    "[data-tg-card] > :first-child", "[data-rail-item]",
  ].join(",");
  const out = [];
  for (const node of document.querySelectorAll(pick)) {
    if (node.closest("[hidden], [aria-hidden=true]")) continue;
    if (node.checkVisibility && !node.checkVisibility()) continue;
    const text = (node.textContent || "").trim().replace(/\\s+/g, " ");
    if (text && text.length <= 60 && !/^\\d[\\d.,:% ]*$/.test(text)) out.push(text);
  }
  return out;
})()`;

async function labels(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const frame of [page.mainFrame(), ...viewFrames(page)]) {
    if (frame !== page.mainFrame()) {
      const element = await within(frame.frameElement(), null);
      const visible = element
        ? await within(
            element.evaluate(
              (node) =>
                (node as HTMLElement).dataset.frameRole !== "background" &&
                (node as HTMLElement).checkVisibility(),
            ),
            false,
          )
        : false;
      if (!visible) continue;
    }
    const found = (await within(frame.evaluate(LABELS), [])) as string[];
    out.push(...found);
  }
  return [...new Set(out)].sort();
}

/**
 * A framed plugin's overlay covers the page until it closes, and Escape in
 * the page doesn't reach it. Sends Escape inside it; returns the plugin id
 * when one was open.
 */
async function clearOverlay(page: Page): Promise<string | null> {
  for (const frame of page.frames()) {
    if (!/[#&]role=background(&|$)/.test(frame.url())) continue;
    const element = await within(frame.frameElement(), null);
    if (!element) continue;
    const id = await within(
      element.evaluate((node) => {
        const el = node as HTMLElement;
        return el.dataset.frameRole === "background" &&
          el.style.pointerEvents === "auto"
          ? (el.dataset.pluginFrame ?? "?")
          : null;
      }),
      null,
    );
    if (!id) continue;
    await within(frame.locator("body").press("Escape"), undefined);
    await settle(page, 500);
    return id;
  }
  return null;
}

const report: ViewRecord[] = [];
let lastLog = Date.now();

async function record(
  page: Page,
  noise: Noise,
  section: string,
  name: string,
): Promise<ViewRecord> {
  // A frame that never gets ready says so after 15 s.
  await settle(page, 1500);
  const shot = `${String(report.length).padStart(3, "0")}-${slug(section)}-${slug(name)}.png`;
  const t0 = Date.now();
  await page
    .screenshot({ path: join(outDir!, "shots", shot), timeout: 10_000 })
    .catch(() => {});
  const t1 = Date.now();
  const frames = await frameInfo(page);
  const t2 = Date.now();
  const entry: ViewRecord = {
    section,
    name,
    shot,
    console: take(noise.errors),
    refused: take(noise.refused),
    emptyReads: take(noise.reads),
    notReady: take(noise.ready),
    zeroFrames: frames
      .filter((f) => (f.width === 0 || f.height === 0) && f.content)
      .map((f) => `${f.plugin}:${f.key} ${f.width}x${f.height}`),
    blankFrames: frames
      .filter((f) => f.blank)
      .map((f) => `${f.plugin}:${f.key}`),
    frames,
    labels: await labels(page),
  };
  if (process.env.AUDIT_TIMING) {
    console.log(
      `  shot ${t1 - t0} ms, frames ${t2 - t1} ms, labels ${Date.now() - t2} ms`,
    );
  }
  const overlay = await clearOverlay(page);
  if (overlay) entry.console.push(`overlay from ${overlay} stayed open`);
  report.push(entry);
  const problems =
    entry.console.length +
    entry.refused.length +
    entry.emptyReads.length +
    entry.notReady.length +
    entry.zeroFrames.length +
    entry.blankFrames.length;
  console.log(
    `${section} | ${name} | ${problems} | ${((Date.now() - lastLog) / 1000).toFixed(0)}s`,
  );
  lastLog = Date.now();
  save();
  return entry;
}

function save() {
  writeFileSync(join(outDir!, "report.json"), JSON.stringify(report, null, 1));
}

const SUB_SELECTORS = [
  "nav[class*='w-44'] button:not([aria-label])",
  "button[class*='border-b-2']",
  "[role=tab]",
];

/** Side navs and tab strips inside the open view, in the page and its frames. */
async function subViews(
  page: Page,
  noise: Noise,
  section: string,
  parent: string,
) {
  if (!CLICK) return;
  const scopes: Array<Page | Frame> = [page];
  for (const frame of viewFrames(page)) {
    const element = await within(frame.frameElement(), null);
    const ok = element
      ? await within(
          element.evaluate(
            (node) =>
              (node as HTMLElement).dataset.frameRole !== "background" &&
              (node as HTMLElement).checkVisibility(),
          ),
          false,
        )
      : false;
    if (ok) scopes.push(frame);
  }
  const seen = new Set<string>();
  for (const scope of scopes) {
    for (const selector of SUB_SELECTORS) {
      const base =
        scope === page
          ? page.locator(`[data-slot="tab-stage"] > :not([hidden]) ${selector}`)
          : scope.locator(selector);
      const count = Math.min(await within(base.count(), 0), SUB_LIMIT);
      const names: string[] = [];
      for (let i = 0; i < count; i++) {
        names.push(
          ((await within(base.nth(i).textContent({ timeout: 2000 }), "")) ?? "")
            .trim()
            .replace(/\s+/g, " "),
        );
      }
      for (let i = 0; i < names.length; i++) {
        const text = names[i];
        if (!text || seen.has(text) || DESTRUCTIVE.test(text)) continue;
        seen.add(text);
        const target: Locator = base.nth(i);
        try {
          if (!(await target.isVisible())) continue;
          await target.click({ timeout: 2000 });
          await settle(page, 1500);
          await record(page, noise, section, `${parent} > ${text}`);
        } catch {
          // Gone after an earlier click.
        }
      }
    }
  }
}

async function home(page: Page) {
  await page.goto(URL_BASE);
  await settle(page, 5000);
}

async function walkDashboard(page: Page, noise: Noise) {
  await home(page);
  await record(page, noise, "Dashboard", "Dashboard");
  const homepage = page.getByRole("button", { name: "Homepage", exact: true });
  if (await homepage.count()) {
    await homepage.first().click();
    await settle(page, 4000);
    await record(page, noise, "Dashboard", "Homepage");
    await page
      .getByRole("button", { name: "Dashboard", exact: true })
      .first()
      .click()
      .catch(() => {});
    await settle(page, 2000);
  }
}

async function walkRail(page: Page, noise: Noise) {
  await home(page);
  const items = page.locator("[data-rail-item]");
  const names = await items.evaluateAll((nodes) =>
    nodes.map(
      (n) =>
        (n.getAttribute("aria-label") || n.getAttribute("title") || "")
          .split("\n")[0]
          .trim() || (n.textContent ?? "").trim(),
    ),
  );
  for (let i = 0; i < names.length; i++) {
    if (!matches(names[i])) continue;
    try {
      await items.nth(i).click({ timeout: 3000 });
      await settle(page, 3000);
      await record(page, noise, "Rail", names[i]);
    } catch (error) {
      console.log("rail", names[i], String(error).slice(0, 80));
    }
  }
}

async function walkPalette(page: Page, noise: Noise) {
  await home(page);
  const items = await paletteItems(page).catch(() => [] as string[]);
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (SKIP.test(item) || !matches(item)) continue;
    try {
      await openPalette(page);
      await page.locator("[cmdk-item]").nth(index).click({ timeout: 3000 });
      await settle(page, 4000);
      await record(page, noise, "Palette", item);
      await subViews(page, noise, "Palette", item);
    } catch (error) {
      console.log("palette", item, String(error).slice(0, 80));
    }
  }
}

async function hostRow(page: Page): Promise<Locator | null> {
  await home(page);
  // The sidebar may be closed or show another rail panel.
  const search = page.getByPlaceholder(/search hosts/i).first();
  if (!(await within(search.isVisible(), false))) {
    await page
      .locator("[data-rail-item]")
      .first()
      .click({ timeout: 3000 })
      .catch(() => {});
  }
  await page.mouse.move(900, 500);
  await settle(page, 1000);
  const row = page.locator(`[data-host-id="${HOST}"]`).first();
  for (let i = 0; i < 4 && !(await row.count()); i++) {
    const folders = page.locator('svg[class*="lucide-folder"]:visible');
    const n = await folders.count();
    for (let f = 0; f < n && !(await row.count()); f++) {
      await folders
        .nth(f)
        .click({ timeout: 3000 })
        .catch(() => {});
      await settle(page, 400);
    }
  }
  return (await row.count()) ? row : null;
}

async function walkHostTools(page: Page, noise: Noise) {
  const row = await hostRow(page);
  if (!row) {
    console.log(`host row ${HOST} not found`);
    return;
  }
  await row.hover();
  await settle(page, 400);
  const titles = await row
    .locator("button[title]")
    .evaluateAll((nodes) => nodes.map((n) => n.getAttribute("title") ?? ""));
  for (const title of titles) {
    if (!matches(title)) continue;
    try {
      const again = await hostRow(page);
      if (!again) break;
      await again.hover();
      await again.locator(`button[title="${title}"]`).first().click();
      await settle(page, 5000);
      await record(page, noise, "Host tool", title);
      await subViews(page, noise, "Host tool", title);
      if (/terminal|ssh/i.test(title)) await walkCompanions(page, noise, title);
    } catch (error) {
      console.log("host tool", title, String(error).slice(0, 80));
    }
  }
}

/** Companion toggles on the edge of a host tab, then the tab's own panel buttons. */
async function walkCompanions(page: Page, noise: Noise, tool: string) {
  const stage = page.locator('[data-slot="tab-stage"] > :not([hidden])');
  const toggles = stage.locator("button[aria-pressed][title]");
  const titles = await toggles.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("title") ?? ""),
  );
  for (const title of [...new Set(titles)]) {
    try {
      await stage
        .locator(`button[aria-pressed][title="${title}"]`)
        .first()
        .click({ timeout: 2000 });
      await settle(page, 3000);
      await record(page, noise, "Companion", `${tool} > ${title}`);
    } catch {
      // Not there any more.
    }
  }
  if (!CLICK) return;
  const buttons = stage.locator("button[title]:visible");
  const names = await buttons.evaluateAll((nodes) =>
    nodes.map((n) => n.getAttribute("title") ?? ""),
  );
  for (const name of [...new Set(names)].slice(0, SUB_LIMIT)) {
    if (!name || DESTRUCTIVE.test(name) || titles.includes(name)) continue;
    try {
      await stage.locator(`button[title="${name}"]`).first().click({
        timeout: 2000,
      });
      await settle(page, 2000);
      await record(page, noise, "Terminal panel", `${tool} > ${name}`);
      await page.keyboard.press("Escape");
    } catch {
      // Covered or gone.
    }
  }
}

async function walkHostEditor(page: Page, noise: Noise) {
  await home(page);
  await openPalette(page);
  await page.locator("[cmdk-input]").fill(HOST_NAME);
  await settle(page, 1200);
  const item = page
    .locator("[cmdk-item]")
    .filter({ hasText: HOST_NAME })
    .first();
  await item.hover().catch(() => {});
  const edit = item.locator("button[title*='dit' i]").first();
  if (!(await edit.count())) {
    console.log("no edit button for", HOST_NAME);
    await page.keyboard.press("Escape");
    return;
  }
  await edit.click();
  await settle(page, 5000);
  await record(page, noise, "Host editor", HOST_NAME);
  // One scrolling form: step through it so lazy sections mount.
  const scroller = page.locator(
    '[data-slot="tab-stage"] > :not([hidden]) [class*="overflow-auto"], [data-slot="tab-stage"] > :not([hidden]) [class*="overflow-y-auto"]',
  );
  for (let step = 1; step <= 8; step++) {
    await scroller
      .first()
      .evaluate((el, s) => el.scrollTo(0, (el.scrollHeight * s) / 8), step)
      .catch(() => {});
    await settle(page, 1200);
  }
  await record(page, noise, "Host editor", `${HOST_NAME} (scrolled)`);
  await subViews(page, noise, "Host editor", HOST_NAME);
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
  const noise = watch(page);
  await login(page, URL_BASE);
  for (const [name, walk] of [
    ["dashboard", walkDashboard],
    ["rail", walkRail],
    ["palette", walkPalette],
    ["host-tools", walkHostTools],
    ["host-editor", walkHostEditor],
  ] as const) {
    try {
      await walk(page, noise);
    } catch (error) {
      console.log(`${name} stopped: ${String(error).slice(0, 200)}`);
    }
  }
  save();
  await browser.close();
}

void main();
