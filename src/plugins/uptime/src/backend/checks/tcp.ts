import net from "node:net";
import type { CheckResult } from "../../shared/types.js";
import { resolveTarget } from "../target-guard.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckEnv,
  type CheckTarget,
} from "./types.js";

export async function checkTcp(
  target: CheckTarget,
  env: CheckEnv,
): Promise<CheckResult> {
  const { target: host = "", port = 0 } = target.config;
  try {
    const { address } = await resolveTarget(host, env.allowPrivate);
    const started = performance.now();
    await new Promise<void>((resolve, reject) => {
      const socket = net.connect({ host: address, port });
      const finish = (error?: Error) => {
        clearTimeout(timer);
        env.signal.removeEventListener("abort", stop);
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      const stop = () => finish(new Error("Stopped"));
      const timer = setTimeout(
        () => finish(new Error(`No answer in ${target.timeoutSec} s`)),
        target.timeoutSec * 1000,
      );
      env.signal.addEventListener("abort", stop, { once: true });
      socket.once("connect", () => finish());
      socket.once("error", finish);
    });
    return passed(`Port ${port} answered`, round(performance.now() - started));
  } catch (error) {
    return failed(errorText(error));
  }
}
