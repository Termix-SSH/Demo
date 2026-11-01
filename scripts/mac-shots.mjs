// Mac App Store screenshots: captures the demo, frames it like the mobile store slides.
// Usage: node scripts/mac-shots.mjs <outDir>   (demo served on 4173)
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright";

const out = resolve(process.argv[2] ?? "mac-shots");
mkdirSync(out, { recursive: true });
const URL = "http://localhost:4173/";
const ACCENT = "#f59145";
const W = 2560;
const H = 1600;
const fontDir = resolve("node_modules/@fontsource/jetbrains-mono/files");
const logo = resolve("../Mobile/store/public/brand/logo.svg");

const settle = (p, ms = 800) => p.waitForTimeout(ms);

async function palette(page) {
  await page.keyboard.press("Control+k");
  await page
    .locator("[cmdk-input], input[placeholder]")
    .filter({ visible: true })
    .last()
    .waitFor();
  await settle(page, 400);
}
async function openHost(page, host) {
  await palette(page);
  await page.keyboard.type(host);
  await settle(page, 400);
  await page.keyboard.press("Enter");
  await page.locator(".xterm").filter({ visible: true }).first().waitFor();
  await settle(page, 1500);
}

const SLIDES = [
  {
    id: "dashboard",
    title: "All your servers, *one app*",
    subtitle: "Status, activity and quick access at a glance",
    logo: true,
    run: async () => {},
  },
  {
    id: "terminal",
    title: "A fast *real terminal*",
    subtitle: "SSH sessions with tabs, themes and split view",
    run: (p) => openHost(p, "db-primary"),
  },
  {
    id: "split",
    title: "Work in *split view*",
    subtitle: "Run more than one session side by side",
    run: async (p) => {
      await openHost(p, "db-primary");
      await p.getByLabel("Split screen").first().click();
      await p.getByText("Split right").first().click();
      await settle(p);
      await openHost(p, "web-01");
    },
  },
  {
    id: "hosts",
    title: "Every host *in reach*",
    subtitle: "Folders, tags and search for big fleets",
    run: async (p) => {
      const rail = p.locator("[data-rail-item][title^='Hosts']").first();
      if (!(await p.locator('[title="Collapse sidebar"]').count()))
        await rail.click();
      await settle(p);
    },
  },
  {
    id: "manage",
    title: "Manage hosts *and logins*",
    subtitle: "Share access and keep credentials in one place",
    run: async (p) => {
      await p.evaluate(() => window.dispatchEvent(new Event("manage:request")));
      await settle(p, 1500);
    },
  },
  {
    id: "settings",
    title: "Make it *yours*",
    subtitle: "Themes, layouts and plugins for what you need",
    run: async (p) => {
      await p
        .locator('[title="Open settings"], [aria-label="Open settings"]')
        .first()
        .click();
      await settle(p, 1200);
    },
  },
];

const browser = await chromium.launch();

// Sign in once and keep the state
const state = join(out, ".state.json");
{
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await ctx.addInitScript(() =>
    localStorage.setItem("termix-demo-recording", "1"),
  );
  const page = await ctx.newPage();
  await page.goto(URL);
  await page.locator("input[type=password]").waitFor();
  await page.locator("input").first().fill("demo");
  await page.locator("input[type=password]").fill("demo");
  await page.locator("button[type=submit]").click();
  await page.getByText("Turn all on").click();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Skip setup").click();
  await page.getByText("Host Status").waitFor();
  await settle(page, 1000);
  await ctx.storageState({ path: state });
  await ctx.close();
}

const winW = 1960;
const winH = Math.round(winW * (900 / 1440)); // 1375
const frameHtml = (
  s,
  raw,
) => `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:JB;font-weight:400;src:url("${pathToFileURL(join(fontDir, "jetbrains-mono-latin-400-normal.woff2"))}")}
@font-face{font-family:JB;font-weight:800;src:url("${pathToFileURL(join(fontDir, "jetbrains-mono-latin-800-normal.woff2"))}")}
html,body{margin:0;width:${W}px;height:${H}px;background:#09090b;font-family:JB,monospace;overflow:hidden}
.wrap{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center}
.head{margin-top:${s.logo ? 36 : 60}px;text-align:center;color:#f9f9f9}
.logo{display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:22px}
.logo img{width:56px;height:56px}.logo span{font-weight:800;font-size:38px;letter-spacing:-1px}
h1{margin:0;font-weight:800;font-size:76px;letter-spacing:-2.6px;line-height:1.1}
h1 b{color:${ACCENT};font-weight:800}
p{margin:16px 0 0;font-size:34px;color:#a1a1aa}
.win{position:absolute;bottom:56px;left:${(W - winW) / 2}px;width:${winW}px;height:${winH}px;box-sizing:border-box;border:6px solid #303034;border-radius:26px;background:#000;padding:10px;overflow:hidden}
.win img{width:100%;height:100%;border-radius:14px;display:block}
</style></head><body><div class="wrap"><div class="head">
${s.logo ? `<div class="logo"><img src="${pathToFileURL(logo)}"><span>Termix</span></div>` : ""}
<h1>${s.title.replace(/\*([^*]+)\*/g, "<b>$1</b>")}</h1><p>${s.subtitle}</p></div>
<div class="win"><img src="${pathToFileURL(raw)}"></div></div></body></html>`;

for (const [i, s] of SLIDES.entries()) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState: state,
    reducedMotion: "reduce",
    colorScheme: "dark",
    locale: "en-US",
    timezoneId: "UTC",
  });
  await ctx.addInitScript(() => {
    localStorage.setItem("termix-demo-recording", "1");
    localStorage.setItem("vite-ui-theme", "dark");
  });
  const page = await ctx.newPage();
  const raw = join(out, `raw-${s.id}.png`);
  try {
    await page.goto(URL);
    await page.getByText("Host Status").first().waitFor({ timeout: 30000 });
    await settle(page, 1500);
    await s.run(page);
    await page.mouse.move(1438, 450);
    await settle(page, 600);
    await page.screenshot({ path: raw, animations: "disabled", caret: "hide" });
  } catch (e) {
    console.log("capture failed", s.id, String(e).split("\n")[0]);
    await ctx.close();
    continue;
  }
  await ctx.close();

  const htmlFile = join(out, `frame-${s.id}.html`);
  writeFileSync(htmlFile, frameHtml(s, raw));
  const fctx = await browser.newContext({ viewport: { width: W, height: H } });
  const fp = await fctx.newPage();
  await fp.goto(pathToFileURL(htmlFile).href);
  await fp.evaluate(() => document.fonts.ready);
  await settle(fp, 400);
  await fp.screenshot({
    path: join(out, `${String(i + 1).padStart(2, "0")}-${s.id}.png`),
  });
  await fctx.close();
  console.log("ok", s.id);
}
await browser.close();
