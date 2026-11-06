import { HostScriptError } from "@termix-ssh/plugin-sdk/host-scripts";
import type {
  ActionResult,
  AppAction,
  LogsView,
  LogTarget,
  ManagersView,
  ProcessDetail,
  ProcessList,
  SignalName,
  StatusView,
} from "../shared/types.js";
import type { HostSettings } from "./host-settings.js";
import {
  parseDetail,
  parsePm2,
  parseProcessList,
  parseStatus,
  parseSupervisor,
  sections,
  supervisorBroken,
} from "./parse.js";
import type { Remote } from "./remote.js";
import {
  LIST_SCRIPT,
  STATUS_SCRIPT,
  SUPERVISOR_REFRESH_SCRIPT,
  appActionScript,
  cleanComm,
  detailScript,
  logScript,
  SUPERVISOR_LIST_SCRIPT,
  pm2ListScript,
  reniceScript,
  signalScript,
} from "./scripts.js";
import type { ManagerKind } from "../shared/types.js";

/** Everything the plugin does on a host, shared by routes and operations. */
export function createService(remote: Remote) {
  const out = (stdout: string, stderr: string) =>
    (stdout || stderr).trim().slice(0, 4000);

  return {
    async status(
      hostId: number,
      settings: HostSettings,
      canEdit: boolean,
    ): Promise<StatusView> {
      const { stdout } = await remote.plain(hostId, STATUS_SCRIPT);
      return parseStatus(stdout, canEdit, settings.readOnly);
    },

    async processes(
      hostId: number,
      settings: HostSettings,
    ): Promise<ProcessList> {
      const { stdout } = await remote.read(hostId, settings.sudo, LIST_SCRIPT, {
        timeoutMs: 20_000,
      });
      return parseProcessList(stdout);
    },

    async detail(
      hostId: number,
      settings: HostSettings,
      pid: number,
    ): Promise<ProcessDetail> {
      const { stdout } = await remote.read(
        hostId,
        settings.sudo,
        detailScript(pid),
        { timeoutMs: 20_000 },
      );
      return parseDetail(pid, stdout);
    },

    /** Root when it can be had, so other users' processes can be signalled. */
    async signal(
      hostId: number,
      settings: HostSettings,
      pid: number,
      signal: SignalName,
      comm: string,
    ): Promise<ActionResult> {
      const r = await remote.read(
        hostId,
        settings.sudo,
        signalScript(pid, signal, cleanComm(comm)),
      );
      return { ok: true, output: out(r.stdout, r.stderr) };
    },

    async renice(
      hostId: number,
      settings: HostSettings,
      pid: number,
      nice: number,
      comm: string,
    ): Promise<ActionResult> {
      const r = await remote.read(
        hostId,
        settings.sudo,
        reniceScript(pid, nice, cleanComm(comm)),
      );
      return { ok: true, output: out(r.stdout, r.stderr) };
    },

    async managers(
      hostId: number,
      settings: HostSettings,
    ): Promise<ManagersView> {
      // pm2 belongs to one user: the login user unless a pm2 user is set.
      const [pm2Out, supOut] = await Promise.all([
        settings.pm2User
          ? remote.root(
              hostId,
              settings.sudo,
              pm2ListScript(settings.pm2User),
              {
                allowFail: true,
              },
            )
          : remote.plain(hostId, pm2ListScript(""), { allowFail: true }),
        remote.read(hostId, settings.sudo, SUPERVISOR_LIST_SCRIPT, {
          allowFail: true,
        }),
      ]);
      const pm2Text = pm2Out.stdout;
      const supervisorText = supOut.stdout;
      const pm2 = !pm2Text.includes("@@none");
      const supervisor = !supervisorText.includes("@@none");
      const apps = [
        ...(pm2 ? parsePm2(pm2Text) : []),
        ...(supervisor ? parseSupervisor(supervisorText) : []),
      ];
      return {
        pm2,
        supervisor,
        apps,
        ...(supervisor && !apps.some((a) => a.manager === "supervisor")
          ? { supervisorError: supervisorBroken(supervisorText) }
          : {}),
      };
    },

    async appAction(
      hostId: number,
      settings: HostSettings,
      manager: ManagerKind,
      key: string,
      action: AppAction | "delete" | "flush",
    ): Promise<ActionResult> {
      const script = appActionScript(manager, key, action, settings.pm2User);
      const useRoot = manager === "supervisor" || !!settings.pm2User;
      const r = useRoot
        ? await remote.root(hostId, settings.sudo, script, { allowFail: true })
        : await remote.plain(hostId, script, { allowFail: true });
      return { ok: r.code === 0, output: out(r.stdout, r.stderr) };
    },

    async supervisorRefresh(
      hostId: number,
      settings: HostSettings,
    ): Promise<ActionResult> {
      const r = await remote.root(
        hostId,
        settings.sudo,
        SUPERVISOR_REFRESH_SCRIPT,
        { allowFail: true },
      );
      return { ok: r.code === 0, output: out(r.stdout, r.stderr) };
    },

    async logs(
      hostId: number,
      settings: HostSettings,
      target: LogTarget,
      lines: number,
      grep: string,
    ): Promise<LogsView> {
      const script = logScript(target, {
        lines,
        follow: false,
        grep,
        runUser: settings.pm2User,
      });
      const opts = { allowFail: true, maxOutputBytes: 2_000_000 };
      // pm2 logs belong to the pm2 user, never to root by accident.
      const r =
        target.kind === "pm2"
          ? settings.pm2User
            ? await remote.root(hostId, settings.sudo, script, opts)
            : await remote.plain(hostId, script, opts)
          : await remote.read(hostId, settings.sudo, script, opts);
      if (r.code !== 0 && !r.stdout.trim()) {
        throw new HostScriptError(
          out(r.stdout, r.stderr) || "Could not read the log",
        );
      }
      const text = r.stdout.replace(/\r/g, "");
      return { text, lines: text ? text.split("\n").length : 0 };
    },
  };
}

export type ProcessService = ReturnType<typeof createService>;
