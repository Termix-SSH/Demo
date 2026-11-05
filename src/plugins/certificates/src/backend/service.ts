import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ActionResult,
  AcmeClient,
  CertStatus,
  CertView,
  InspectResult,
  IssueBody,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import { parseInspect, parseList, parseStatus } from "./parse.js";
import type { Remote } from "./remote.js";
import {
  LIST_SCRIPT,
  STATUS_SCRIPT,
  cleanEndpoint,
  cleanIssue,
  cleanPath,
  deleteScript,
  inspectFileScript,
  inspectRemoteScript,
  installCertbotScript,
  issueScript,
  renewScript,
  revokeScript,
} from "./scripts.js";

const OUTPUT_LIMIT = 8000;

type Status = Omit<
  CertStatus,
  "watching" | "warnDays" | "canEdit" | "readOnly"
>;

export interface CertService {
  status: (hostId: number, s: HostSettings) => Promise<Status>;
  list: (hostId: number, s: HostSettings) => Promise<CertView[]>;
  inspectFile: (
    hostId: number,
    s: HostSettings,
    path: unknown,
  ) => Promise<InspectResult>;
  inspectRemote: (
    hostId: number,
    s: HostSettings,
    host: unknown,
    port: unknown,
  ) => Promise<InspectResult>;
  issue: (
    hostId: number,
    s: HostSettings,
    body: IssueBody,
  ) => Promise<ActionResult>;
  renew: (
    hostId: number,
    s: HostSettings,
    client: AcmeClient,
    name: string | null,
    options?: { dryRun?: boolean; force?: boolean },
  ) => Promise<ActionResult>;
  revoke: (
    hostId: number,
    s: HostSettings,
    client: AcmeClient,
    name: string,
  ) => Promise<ActionResult>;
  remove: (
    hostId: number,
    s: HostSettings,
    client: AcmeClient,
    name: string,
  ) => Promise<ActionResult>;
  installCertbot: (hostId: number, s: HostSettings) => Promise<ActionResult>;
}

export function createService(remote: Remote): CertService {
  const status = async (hostId: number, s: HostSettings) =>
    parseStatus((await remote.read(hostId, s.sudo, STATUS_SCRIPT)).stdout);

  /** Runs a change as root and keeps the end of its output. */
  const change = async (
    hostId: number,
    s: HostSettings,
    script: string,
    timeoutMs = 300_000,
  ): Promise<ActionResult> => {
    const result = await remote.root(hostId, s.sudo, script, {
      timeoutMs,
      maxOutputBytes: 2_000_000,
      allowFail: true,
    });
    const output = result.stdout.trim();
    const tail =
      output.length > OUTPUT_LIMIT ? output.slice(-OUTPUT_LIMIT) : output;
    if (result.code !== 0) {
      if (/password is required|a terminal is required/i.test(result.stderr)) {
        throw new HostScriptError(
          "This host needs a root login, passwordless sudo or a saved Sudo Password",
          400,
          { code: "sudo" },
        );
      }
      const own = tail.match(/SCRIPT_ERR:(.*)/)?.[1];
      throw new HostScriptError(
        (own || tail || result.stderr || "The command failed").slice(-1500),
        400,
        { output: own ? "" : tail },
      );
    }
    return { ok: true, output: tail };
  };

  return {
    status,
    list: async (hostId, s) =>
      parseList(
        (await remote.read(hostId, s.sudo, LIST_SCRIPT, { timeoutMs: 60_000 }))
          .stdout,
      ),
    inspectFile: async (hostId, s, path) => {
      const file = cleanPath(path, "file");
      const { stdout } = await remote.read(
        hostId,
        s.sudo,
        inspectFileScript(file),
      );
      return parseInspect(stdout, file);
    },
    inspectRemote: async (hostId, s, host, port) => {
      const target = cleanEndpoint(host, port);
      const { stdout } = await remote.read(
        hostId,
        s.sudo,
        inspectRemoteScript(target.connect, target.sni),
        { timeoutMs: 30_000 },
      );
      return parseInspect(stdout, target.connect);
    },
    issue: (hostId, s, body) =>
      change(hostId, s, issueScript(cleanIssue(body))),
    renew: (hostId, s, client, name, options = {}) =>
      change(hostId, s, renewScript(client, name, options)),
    revoke: (hostId, s, client, name) =>
      change(hostId, s, revokeScript(client, name), 120_000),
    remove: (hostId, s, client, name) =>
      change(hostId, s, deleteScript(client, name), 120_000),
    installCertbot: async (hostId, s) => {
      const st = await status(hostId, s);
      return change(hostId, s, installCertbotScript(st.manager), 600_000);
    },
  };
}
