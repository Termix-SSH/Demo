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
await page
  .getByRole("button", { name: "Hosts" })
  .first()
  .click()
  .catch(() => {});
await page.waitForTimeout(1500);
const ids = await page.evaluate(
  `[...document.querySelectorAll("[data-host-id]")].map(e=>e.getAttribute("data-host-id")+":"+e.textContent.trim().slice(0,30))`,
);
console.log(ids);
await page.screenshot({ path: out.replace(".png", "-0.png") });
const row = page.locator(`[data-host-id="9"]`).first();
await row.click({ button: "right", timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);
const items = await page.locator('[role="menuitem"]').allTextContents();
console.log("menu:", items.join(" | "));
const hp = page.locator('[role="menuitem"]', { hasText: /host page/i }).first();
if (await hp.count()) await hp.click();
else await page.keyboard.press("Escape");
await page.waitForTimeout(4000);
const nav = await page.evaluate(
  `(() => { const n = [...document.querySelectorAll('nav.w-44')].pop(); if (!n) return null; return [...n.children].map(c => { const r = c.getBoundingClientRect(); return c.textContent.trim() + ' @' + Math.round(r.top) + ' h' + Math.round(r.height) + ' ' + c.innerHTML.slice(0,120); }); })()`,
);
console.log(JSON.stringify(nav, null, 1));
await page.screenshot({ path: out });
await browser.close();
