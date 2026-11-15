/**
 * Runs frame-audit.ts once per plugin with that plugin turned off, then puts
 * every plugin back the way it was. Writes summary.json in <outDir> with the
 * problem counts of each run.
 *
 *   TERMIX_API_KEY=tmx_... npx tsx scripts/frame-audit-matrix.ts <outDir>
 *     [--api http://localhost:30001] [--only acme-ssl,ai]
 *     [--sections dashboard,rail,host-tools] [--from <id>]
 *
 * Point it at `npm run dev` with every plugin on.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { arg } from "./audit-lib";

const outDir = resolve(process.argv[2] ?? "");
const API = arg("api") ?? "http://localhost:30001";
const KEY = process.env.TERMIX_API_KEY;
const ONLY = arg("only")?.split(",");
const FROM = arg("from");
const SECTIONS = arg("sections") ?? "dashboard,rail,host-tools";
if (!process.argv[2] || !KEY) {
  console.error(
    "Usage: TERMIX_API_KEY=... tsx scripts/frame-audit-matrix.ts <outDir>",
  );
  process.exit(1);
}

interface PluginRow {
  id: string;
  enabled: boolean;
  state: string;
}

async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} ${response.status}`);
  }
  return response.json();
}

async function plugins(): Promise<PluginRow[]> {
  const body = await api("/plugins");
  return (body.plugins ?? body) as PluginRow[];
}

async function setEnabled(id: string, enabled: boolean) {
  await api(`/plugins/${id}/state`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });
}

/** Puts every plugin back to its saved state, then waits until they settle. */
async function restore(saved: PluginRow[]) {
  const now = new Map((await plugins()).map((p) => [p.id, p]));
  // Turn on first so a plugin's dependencies are up before it.
  for (const p of saved) {
    if (p.enabled && !now.get(p.id)?.enabled) {
      await setEnabled(p.id, true).catch((e) => console.log(String(e)));
    }
  }
  for (const p of saved) {
    if (!p.enabled && now.get(p.id)?.enabled) {
      await setEnabled(p.id, false).catch((e) => console.log(String(e)));
    }
  }
  for (let i = 0; i < 60; i++) {
    const rows = await plugins();
    if (rows.every((p) => !p.enabled || p.state !== "loading")) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function counts(dir: string) {
  const file = join(dir, "report.json");
  if (!existsSync(file)) return { missing: true };
  const views = JSON.parse(readFileSync(file, "utf8")) as Array<
    Record<string, unknown[]>
  >;
  const sum = (key: string) =>
    views.reduce((n, v) => n + (v[key]?.length ?? 0), 0);
  return {
    views: views.length,
    console: sum("console"),
    refused: sum("refused"),
    notReady: sum("notReady"),
    zeroFrames: sum("zeroFrames"),
    blankFrames: sum("blankFrames"),
  };
}

async function main() {
  mkdirSync(outDir, { recursive: true });
  const saved = await plugins();
  writeFileSync(join(outDir, "states.json"), JSON.stringify(saved, null, 1));
  const summaryFile = join(outDir, "summary.json");
  const summary: Record<string, unknown> = existsSync(summaryFile)
    ? JSON.parse(readFileSync(summaryFile, "utf8"))
    : {};
  let started = !FROM;
  const stop = async () => {
    await restore(saved);
    process.exit(1);
  };
  process.on("SIGINT", () => void stop());
  try {
    for (const plugin of saved) {
      if (plugin.id === FROM) started = true;
      if (!started || !plugin.enabled) continue;
      if (ONLY && !ONLY.includes(plugin.id)) continue;
      const dir = join(outDir, `off-${plugin.id}`);
      console.log(`== ${plugin.id} off`);
      try {
        await setEnabled(plugin.id, false);
        const off = (await plugins())
          .filter(
            (p) => !p.enabled && saved.find((s) => s.id === p.id)?.enabled,
          )
          .map((p) => p.id);
        const run = spawnSync(
          "npx",
          [
            "tsx",
            "scripts/frame-audit.ts",
            dir,
            "--no-click",
            "--sections",
            SECTIONS,
          ],
          { stdio: "inherit", shell: true, timeout: 20 * 60_000 },
        );
        summary[plugin.id] = { off, exit: run.status, ...counts(dir) };
      } catch (error) {
        summary[plugin.id] = { error: String(error) };
      } finally {
        await restore(saved);
        writeFileSync(summaryFile, JSON.stringify(summary, null, 1));
      }
    }
  } finally {
    await restore(saved);
  }
}

void main();
