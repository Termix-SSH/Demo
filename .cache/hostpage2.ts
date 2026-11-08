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
await row.click({ button: "right", timeout: 5000 });
await page.waitForTimeout(800);
const items = await page.locator('[role="menuitem"]').allTextContents();
console.log("menu:", items.join(" | "));
await page.keyboard.press("Escape");
await row.hover();
const titles = await row
  .locator("button")
  .evaluateAll((b) => b.map((x) => x.title || x.getAttribute("aria-label")));
console.log(titles);
const hp = row.locator('button[title*="ost page"]').first();
if (await hp.count()) await hp.click();
else {
  await page.keyboard.press("Control+k");
  await page.keyboard.type("Testing host page");
  await page.waitForTimeout(800);
  console.log(await page.locator("[cmdk-item]").allTextContents());
}
await page.waitForTimeout(5000);
const nav = await page.evaluate(
  `(() => { const n = [...document.querySelectorAll('nav.w-44')].pop(); if (!n) return null; return [...n.querySelectorAll(':scope > div > *')].map(c => { const r = c.getBoundingClientRect(); return (c.textContent.trim() || c.className) + ' @' + Math.round(r.top) + ' h' + Math.round(r.height) + ' bg=' + getComputedStyle(c).backgroundColor; }); })()`,
);
console.log(JSON.stringify(nav, null, 1));
await page.screenshot({
  path: out,
  clip: { x: 330, y: 100, width: 400, height: 220 },
});
for (const name of ["Uptime", "Tmux Monitor"]) {
  await page.locator("nav.w-44 button", { hasText: name }).last().click();
  await page.waitForTimeout(4000);
  await page.screenshot({
    path: out.replace(".png", "-" + name.replace(" ", "") + ".png"),
  });
}
await browser.close();
