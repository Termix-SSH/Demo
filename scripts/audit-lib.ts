/** Shared pieces of the UI audit scripts: args, login and the palette. */
import type { Page } from "playwright";

export function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index > 0 ? process.argv[index + 1] : undefined;
}

export const SKIP =
  /^(Reconnect|Split|GitHub|Discord|Report a bug|Documentation|Sign out|Log out|Lock|Restart|Shut ?down|Reboot|Delete|Remove|Disconnect)|\d+\/\d+\/\d+|@/i;
export const DESTRUCTIVE =
  /delete|remove|reboot|restart|shut|power|stop|kill|wipe|reset|revoke|uninstall|disable|turn off|sign out|log ?out|lock|drop|purge|vacuum|format|rotate|apply|deploy|run|start|wake|sleep|kick|end session/i;

export const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-").slice(0, 50);

export async function settle(page: Page, ms = 800) {
  await page.waitForTimeout(ms);
}

export async function login(
  page: Page,
  url: string,
  user = "test",
  pass = "test123",
) {
  await page.goto(url);
  await settle(page, 2500);
  const field = page.locator("#login-user");
  if (await field.count()) {
    await field.first().fill(user);
    await page.locator("#login-pass").fill(pass);
    await page.keyboard.press("Enter");
  }
  await page
    .locator('[data-slot="tab-stage"], main, #root > *')
    .first()
    .waitFor({ timeout: 30000 });
  await settle(page, 4000);
}

export async function openPalette(page: Page) {
  const input = page.locator("[cmdk-input]").first();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  try {
    await input.waitFor({ timeout: 2500 });
  } catch {
    await page.mouse.click(5, 5);
    await page.keyboard.press("Control+k");
    await input.waitFor({ timeout: 5000 });
  }
  await settle(page, 300);
}

export async function paletteItems(page: Page) {
  await openPalette(page);
  await settle(page, 800);
  const items = await page
    .locator("[cmdk-item]")
    .evaluateAll((nodes) =>
      nodes.map((node) => (node.textContent ?? "").trim().replace(/\s+/g, " ")),
    );
  await page.keyboard.press("Escape");
  return items;
}
