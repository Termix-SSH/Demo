import {
  containerCommand,
  isContainerId,
  isUnit,
  shellQuote,
} from "@termix-ssh/plugin-sdk/host-scripts";
import type { CheckResult } from "../../shared/types.js";
import { keywordProblem } from "./http.js";
import {
  errorText,
  failed,
  passed,
  round,
  type CheckTarget,
  type RemoteResult,
  type RemoteRun,
} from "./types.js";

export const INSPECT_FORMAT = `'{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}'`;

/** Empty when the container is fine, else what is wrong. */
export function judgeContainer(stdout: string, name: string): string {
  const [state = "", health = ""] = stdout.trim().split("|");
  if (state !== "running") return `${name} is ${state || "not found"}`;
  if (health === "unhealthy") return `${name} is unhealthy`;
  return "";
}

type Exec = (command: string) => Promise<RemoteResult>;

async function timed(
  target: CheckTarget,
  run: RemoteRun,
  body: (exec: Exec) => Promise<string>,
): Promise<CheckResult> {
  const hostId = target.hostId;
  if (!hostId) return failed("This monitor has no host");
  const started = performance.now();
  try {
    const problem = await body((command) =>
      run(hostId, target.runAs, command, undefined, target.timeoutSec * 1000),
    );
    const latency = round(performance.now() - started);
    return problem ? failed(problem, latency) : passed("Running", latency);
  } catch (error) {
    return failed(errorText(error));
  }
}

export function checkDocker(
  target: CheckTarget,
  run: RemoteRun,
): Promise<CheckResult> {
  const name = target.config.container ?? "";
  if (!isContainerId(name)) {
    return Promise.resolve(failed("The container name is not valid"));
  }
  return timed(target, run, async (exec) => {
    const result = await exec(
      containerCommand(
        "docker",
        `inspect --format ${INSPECT_FORMAT} ${shellQuote(name)}`,
      ),
    );
    if (result.code === 127) return "Docker is not installed on this host";
    if (result.code !== 0) return `${name} was not found`;
    return judgeContainer(result.stdout, name);
  });
}

export function checkSystemd(
  target: CheckTarget,
  run: RemoteRun,
): Promise<CheckResult> {
  const unit = target.config.unit ?? "";
  if (!isUnit(unit)) {
    return Promise.resolve(failed("The unit name is not valid"));
  }
  return timed(target, run, async (exec) => {
    const result = await exec(`systemctl is-active -- ${shellQuote(unit)}`);
    if (result.code === 127) return "systemd is not on this host";
    const state = result.stdout.trim();
    return state === "active" ? "" : `${unit} is ${state || "unknown"}`;
  });
}

export function checkCommand(
  target: CheckTarget,
  run: RemoteRun,
): Promise<CheckResult> {
  const { command = "", keyword, keywordAbsent } = target.config;
  return timed(target, run, async (exec) => {
    const result = await exec(command);
    if (result.timedOut) return "The command ran out of time";
    if (result.code !== 0) return `Exit code ${result.code}`;
    return keywordProblem(result.stdout, keyword, keywordAbsent);
  });
}
