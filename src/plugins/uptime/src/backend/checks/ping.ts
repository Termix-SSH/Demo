import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import type { CheckResult } from "../../shared/types.js";
import { resolveTarget } from "../target-guard.js";
import { errorText, failed, passed, round, type CheckTarget } from "./types.js";

export const PING_UNAVAILABLE =
  "ping is not available here, use a TCP check or Check from a host";

const RESTART_GAP_MS = 60_000;
const REFRESH_MS = 6 * 3_600_000;
const MAX_GAP_SEC = 30;

export function parsePingLine(
  line: string,
): { kind: "reply"; ms: number } | { kind: "lost" } | null {
  const reply = /time[=<]([\d.]+)\s*ms/.exec(line);
  if (reply) return { kind: "reply", ms: Number(reply[1]) };
  if (/no answer yet/i.test(line)) return { kind: "lost" };
  return null;
}

interface Runner {
  stamp: string;
  stop: () => void;
  lastReplyAt: number;
  lastMs: number | null;
  gapSec: number;
  error: string;
  startedAt: number;
  ended: boolean;
}

/**
 * One long running ping per monitor. ctx.process.run writes an audit line per
 * start, so a ping per check would fill the audit log.
 */
export class PingPool {
  private readonly runners = new Map<number, Runner>();

  constructor(
    private readonly ctx: Pick<PluginContext, "process">,
    private readonly platform: string = process.platform,
    private readonly now: () => number = Date.now,
    private readonly settleMs = 1500,
  ) {}

  private async start(
    target: CheckTarget,
    stamp: string,
    allowPrivate: boolean,
  ): Promise<Runner> {
    const gapSec = Math.min(target.intervalSec, MAX_GAP_SEC);
    const runner: Runner = {
      stamp,
      stop: () => undefined,
      lastReplyAt: 0,
      lastMs: null,
      gapSec,
      error: "",
      startedAt: this.now(),
      ended: false,
    };
    this.runners.set(target.id, runner);
    try {
      const { address } = await resolveTarget(
        target.config.target ?? "",
        allowPrivate,
      );
      const handle = await this.ctx.process.run("ping", [
        "-n",
        "-O",
        "-i",
        String(gapSec),
        "-W",
        String(Math.min(target.timeoutSec, 10)),
        address,
      ]);
      runner.stop = () => handle.kill();
      let tail = "";
      handle.onStdout((chunk) => {
        const lines = (tail + chunk).split("\n");
        tail = lines.pop() ?? "";
        for (const line of lines) {
          const parsed = parsePingLine(line);
          if (parsed?.kind === "reply") {
            runner.lastReplyAt = this.now();
            runner.lastMs = parsed.ms;
          }
        }
      });
      handle.exited.then(
        () => {
          runner.ended = true;
          if (!runner.lastReplyAt) runner.error = PING_UNAVAILABLE;
        },
        () => {
          runner.ended = true;
          runner.error = PING_UNAVAILABLE;
        },
      );
    } catch (error) {
      runner.ended = true;
      runner.error = errorText(error);
    }
    return runner;
  }

  private needsStart(runner: Runner | undefined, stamp: string): boolean {
    if (!runner || runner.stamp !== stamp) return true;
    const age = this.now() - runner.startedAt;
    return (runner.ended && age > RESTART_GAP_MS) || age > REFRESH_MS;
  }

  async check(
    target: CheckTarget,
    allowPrivate: boolean,
  ): Promise<CheckResult> {
    if (this.platform !== "linux") return failed(PING_UNAVAILABLE);
    const stamp = `${target.config.target}|${target.intervalSec}|${target.timeoutSec}|${allowPrivate}`;
    let runner = this.runners.get(target.id);
    if (this.needsStart(runner, stamp)) {
      runner?.stop();
      runner = await this.start(target, stamp, allowPrivate);
      // The first reply takes a moment.
      await new Promise((done) => setTimeout(done, this.settleMs));
    }
    const current = runner as Runner;
    if (current.error) return failed(current.error);
    const window = (current.gapSec * 2 + target.timeoutSec) * 1000;
    if (current.lastReplyAt && this.now() - current.lastReplyAt <= window) {
      return passed(
        "Ping answered",
        current.lastMs === null ? null : round(current.lastMs),
      );
    }
    return failed("No ping reply");
  }

  drop(monitorId: number): void {
    this.runners.get(monitorId)?.stop();
    this.runners.delete(monitorId);
  }

  stopAll(): void {
    for (const id of [...this.runners.keys()]) this.drop(id);
  }
}
