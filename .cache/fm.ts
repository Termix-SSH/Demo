import { chromium } from "playwright";
const out = process.argv[2];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.goto("http://localhost:5173/");
await page.waitForTimeout(2500);
if (await page.locator("#login-user").count()) {
  await page.locator("#login-user").fill("test");
  await page.locator("#login-pass").fill("test123");
  await page.keyboard.press("Enter");
}
await page.waitForTimeout(5000);
await page.keyboard.press("Escape");
await page.getByText("Homelab", { exact: true }).first().click();
await page.waitForTimeout(1000);
const row = page.locator(`[data-host-id="9"]`).first();
await row.hover();
await row.locator('button[title="Files"]').first().click();
await page.waitForTimeout(8000);
const search = page.getByPlaceholder(/search files/i).last();
const bar = search.locator(
  "xpath=ancestor::div[contains(@class,'border-b')][1]",
);
const file = bar.locator("xpath=following::*[contains(text(),'.')][1]");
await page.keyboard.press("Control+a").catch(() => {});
await page
  .locator("[data-file-path], [data-path]")
  .first()
  .click({ modifiers: ["Control"] })
  .catch(() => {});
await page.waitForTimeout(800);
const sizes = await page.evaluate(
  `(() => { const s = [...document.querySelectorAll('input[placeholder]')].filter(i => /search files/i.test(i.placeholder)).pop(); const row = s.closest('.flex-row') || s.parentElement.parentElement; return [...row.querySelectorAll(':scope > *, :scope > * > *')].map(e => (e.textContent||e.tagName).trim().slice(0,20) + ' h' + Math.round(e.getBoundingClientRect().height)); })()`,
);
console.log(sizes);
const box = await bar.boundingBox();
await page.screenshot({
  path: out,
  clip: box
    ? { x: box.x, y: box.y, width: box.width, height: box.height }
    : undefined,
});
await browser.close();
