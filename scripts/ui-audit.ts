/**
 * Opens plugin screens on a running Termix and checks them for layout drift:
 * toolbar controls of different heights, content flush against the panel
 * edge, raw spinners, small back buttons, doubled bottom lines and more than
 * one dot on a host row. Saves a screenshot per screen and a report.
 *
 *   npx tsx scripts/ui-audit.ts <outDir> [--url http://localhost:5173]
 *     [--user test --pass test123] [--only <text>] [--list]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Page } from "playwright";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

const outDir =
  process.argv[2] && !process.argv[2].startsWith("--")
    ? resolve(process.argv[2])
    : null;
if (!outDir) {
  console.error("Usage: tsx scripts/ui-audit.ts <outDir> [--url <url>]");
  process.exit(1);
}
const URL_BASE = arg("url") ?? "http://localhost:5173/";
const USER = arg("user") ?? "test";
const PASS = arg("pass") ?? "test123";
const ONLY = arg("only")?.toLowerCase();
const LIST = process.argv.includes("--list");

async function settle(page: Page, ms = 800) {
  await page.waitForTimeout(ms);
}

async function login(page: Page) {
  await page.goto(URL_BASE);
  await settle(page, 2500);
  const user = page.locator("#login-user");
  if (await user.count()) {
    await user.first().fill(USER);
    await page.locator("#login-pass").fill(PASS);
    await page.keyboard.press("Enter");
  }
  await page
    .locator('[data-slot="tab-stage"], main, #root > *')
    .first()
    .waitFor();
  await settle(page, 4000);
}

async function openPalette(page: Page) {
  const input = page.locator("[cmdk-input]").first();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  try {
    await input.waitFor({ timeout: 2500 });
  } catch {
    await page.mouse.click(20, 20);
    await input.waitFor({ timeout: 5000 });
  }
  await settle(page, 300);
}

async function paletteItems(page: Page, query = "") {
  await openPalette(page);
  if (query) await page.keyboard.type(query);
  await settle(page, 600);
  const items = await page
    .locator("[cmdk-item]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").trim().replace(/\s+/g, " ")),
    );
  await page.keyboard.press("Escape");
  return items;
}

const CHECK = readFileSync(
  join(import.meta.dirname, "ui-audit-check.js"),
  "utf8",
);

/** Layout checks run inside the page. Returns one line per problem. */
async function check(page: Page): Promise<string[]> {
  return page.evaluate(CHECK) as Promise<string[]>;
}

async function main() {
  mkdirSync(outDir!, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
  });
  await login(page);
  const items = await paletteItems(page);
  if (LIST) {
    console.log(items.join("\n"));
    await browser.close();
    return;
  }
  const report: string[] = [];
  const skip =
    /^(Reconnect|Split|GitHub|Discord|Report a bug|Documentation|Add New Host|Add Credential)|\d+\/\d+\/\d+|@/;
  const targets = items
    .map((item, index) => ({ item, index }))
    .filter(
      ({ item }) =>
        !skip.test(item) && (!ONLY || item.toLowerCase().includes(ONLY)),
    );
  for (const { item, index } of targets) {
    try {
      await openPalette(page);
      await page.locator("[cmdk-item]").nth(index).click();
      await settle(page, 4000);
      const file = `${String(index).padStart(2, "0")}-${item.replace(/[^a-z0-9]+/gi, "-").slice(0, 50)}`;
      await page.screenshot({ path: join(outDir!, `${file}.png`) });
      const problems = await check(page);
      report.push(`## ${item}`, ...problems.map((p) => `- ${p}`), "");
      console.log(item, problems.length);
    } catch (error) {
      report.push(
        `## ${item}`,
        `- could not open: ${String(error).slice(0, 120)}`,
        "",
      );
    }
  }
  writeFileSync(join(outDir!, "report.md"), report.join("\n"));
  await browser.close();
}

void main();
