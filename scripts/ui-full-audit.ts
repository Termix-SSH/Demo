/**
 * Walks every palette screen and every host tool on a running Termix at
 * several window sizes. Saves a screenshot per screen plus a report with
 * layout problems, console errors, page errors and failed requests.
 *
 *   npx tsx scripts/ui-full-audit.ts <outDir> [--url http://localhost:5173]
 *     [--sizes 1920x1080,390x844] [--only <text>] [--host 9] [--theme dark]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, firefox, webkit, type Page } from "playwright";
import {
  arg,
  DESTRUCTIVE,
  login as signIn,
  openPalette,
  paletteItems,
  settle,
  SKIP,
  slug,
} from "./audit-lib";

const outDir =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;
if (!outDir) {
  console.error("Usage: tsx scripts/ui-full-audit.ts <outDir>");
  process.exit(1);
}
const URL_BASE = arg("url") ?? "http://localhost:5173/";
const USER = arg("user") ?? "test";
const PASS = arg("pass") ?? "test123";
const ONLY_LIST = arg("only")?.toLowerCase().split(",");
const ONLY = ONLY_LIST?.[0];
const matches = (text: string) =>
  !ONLY_LIST || ONLY_LIST.some((o) => text.toLowerCase().includes(o));
const HOST = arg("host") ?? "9";
const BROWSER = arg("browser") ?? "chromium";
const SIZES = (
  arg("sizes") ?? "1920x1080,1366x768,1280x720,1024x768,768x1024,390x844"
)
  .split(",")
  .map((s) => s.split("x").map(Number) as [number, number]);
const login = (page: Page) => signIn(page, URL_BASE, USER, PASS);

const CHECKS = [
  readFileSync(join(import.meta.dirname, "ui-audit-check.js"), "utf8"),
  readFileSync(join(import.meta.dirname, "ui-audit-extra.js"), "utf8"),
];

async function check(page: Page): Promise<string[]> {
  const out: string[] = [];
  for (const code of CHECKS) {
    try {
      out.push(...((await page.evaluate(code)) as string[]));
    } catch (error) {
      out.push(`check failed: ${String(error).slice(0, 80)}`);
    }
  }
  return [...new Set(out)];
}

type Noise = { console: string[]; failed: string[] };

function watch(page: Page): Noise {
  const noise: Noise = { console: [], failed: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error")
      noise.console.push(msg.text().replace(/\s+/g, " ").slice(0, 200));
  });
  page.on("pageerror", (error) =>
    noise.console.push(`PAGE ERROR ${String(error).slice(0, 200)}`),
  );
  page.on("response", (res) => {
    const status = res.status();
    if (status >= 500 || status === 404)
      noise.failed.push(
        `${status} ${res.request().method()} ${res.url().replace(/^https?:\/\/[^/]+/, "")}`,
      );
  });
  page.on("requestfailed", (req) => {
    const err = req.failure()?.errorText ?? "";
    if (!/ERR_ABORTED|NS_BINDING_ABORTED|cancelled/i.test(err))
      noise.failed.push(
        `FAILED ${req.method()} ${req.url().replace(/^https?:\/\/[^/]+/, "")} ${err}`,
      );
  });
  return noise;
}

function drain(noise: Noise) {
  const out = [
    ...[...new Set(noise.console)].map((c) => `console: ${c}`),
    ...[...new Set(noise.failed)].map((f) => `request: ${f}`),
  ];
  noise.console.length = 0;
  noise.failed.length = 0;
  return out;
}

async function shoot(page: Page, dir: string, name: string, noise: Noise) {
  await page.screenshot({ path: join(dir, `${name}.png`) });
  return [...(await check(page)), ...drain(noise)];
}

/** Clicks every safe looking control inside the tab and records new errors. */
async function clickPass(page: Page, noise: Noise): Promise<string[]> {
  const out: string[] = [];
  const buttons = page.locator(
    '[data-slot="tab-stage"] > :not([hidden]) button:visible',
  );
  const count = Math.min(await buttons.count(), 40);
  const labels: string[] = [];
  for (let i = 0; i < count; i++) {
    const b = buttons.nth(i);
    const text = (
      (await b.getAttribute("aria-label")) ||
      (await b.getAttribute("title")) ||
      (await b.textContent()) ||
      ""
    ).trim();
    labels.push(text);
  }
  for (let i = 0; i < labels.length; i++) {
    const text = labels[i];
    if (!text || DESTRUCTIVE.test(text)) continue;
    try {
      const b = buttons.nth(i);
      if (!(await b.isVisible()) || !(await b.isEnabled())) continue;
      await b.click({ timeout: 2000 });
      await settle(page, 700);
      const errs = drain(noise);
      if (errs.length)
        out.push(`after click "${text.slice(0, 30)}": ${errs.join(" ; ")}`);
      await page.keyboard.press("Escape");
      await settle(page, 200);
    } catch {
      // Detached or covered, skip.
    }
  }
  return out;
}

async function runSize(width: number, height: number, report: string[]) {
  const engine =
    BROWSER === "firefox" ? firefox : BROWSER === "webkit" ? webkit : chromium;
  const browser = await engine.launch();
  const phone = width < 600;
  const context = await browser.newContext({
    viewport: { width, height },
    isMobile: phone && BROWSER === "chromium",
    hasTouch: phone,
  });
  const page = await context.newPage();
  const noise = watch(page);
  const dir = join(outDir!, `${BROWSER}-${width}x${height}`);
  mkdirSync(dir, { recursive: true });
  report.push(`# ${BROWSER} ${width}x${height}`, "");
  try {
    await login(page);
  } catch (error) {
    report.push(`- login failed: ${String(error).slice(0, 150)}`, "");
    await browser.close();
    return;
  }
  report.push(
    "## Home",
    ...(await shoot(page, dir, "00-home", noise)).map((p) => `- ${p}`),
    "",
  );

  let items: string[] = [];
  try {
    items = await paletteItems(page);
  } catch (error) {
    report.push(`- palette did not open: ${String(error).slice(0, 120)}`, "");
  }
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !SKIP.test(item) &&
        matches(item) &&
        !process.argv.includes("--hosts-only"),
    );
  const deep = width === 1920 || process.argv.includes("--click");
  for (const { item, index } of targets) {
    try {
      await openPalette(page);
      await page.locator("[cmdk-item]").nth(index).click();
      await settle(page, 4000);
      const problems = await shoot(
        page,
        dir,
        `${String(index).padStart(3, "0")}-${slug(item)}`,
        noise,
      );
      if (deep) problems.push(...(await clickPass(page, noise)));
      report.push(`## ${item}`, ...problems.map((p) => `- ${p}`), "");
      console.log(`${width}x${height}`, item, problems.length);
    } catch (error) {
      report.push(
        `## ${item}`,
        `- could not open: ${String(error).slice(0, 120)}`,
        "",
      );
    }
  }

  // Host tools: every titled button on the test host's sidebar row.
  if (!phone) {
    // A palette item may have swapped the sidebar panel, so start clean.
    await page.goto(URL_BASE);
    await settle(page, 5000);
    const row = page.locator(`[data-host-id="${HOST}"]`).first();
    // Open folders until the test host shows up.
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
    if (await row.count()) {
      await row.hover();
      await settle(page, 400);
      const titles = await row
        .locator("button[title]")
        .evaluateAll((nodes) =>
          nodes.map((n) => n.getAttribute("title") ?? ""),
        );
      for (const title of titles) {
        if (ONLY && !process.argv.includes("--hosts-only") && !matches(title))
          continue;
        try {
          await row.hover();
          await row.locator(`button[title="${title}"]`).first().click();
          await settle(page, 5000);
          const problems = await shoot(page, dir, `host-${slug(title)}`, noise);
          if (deep) problems.push(...(await clickPass(page, noise)));
          report.push(
            `## Host tool: ${title}`,
            ...problems.map((p) => `- ${p}`),
            "",
          );
          console.log(`${width}x${height}`, "host", title, problems.length);
        } catch (error) {
          report.push(
            `## Host tool: ${title}`,
            `- could not open: ${String(error).slice(0, 120)}`,
            "",
          );
        }
      }
    } else {
      report.push(`- host row ${HOST} not found`, "");
    }
  }
  await browser.close();
}

async function main() {
  mkdirSync(outDir!, { recursive: true });
  const report: string[] = [];
  for (const [w, h] of SIZES) {
    await runSize(w, h, report);
    writeFileSync(join(outDir!, "report.md"), report.join("\n"));
  }
}

void main();
