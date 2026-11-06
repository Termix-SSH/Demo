import type { Backend, SourceView, UpsCommand } from "../shared/types.js";
import type { Engine } from "./engine.js";
import { UpsError } from "./errors.js";
import { listCommands, runCommand } from "./reader.js";
import type { Remote } from "./remote.js";
import type { SourceRow, Store } from "./store.js";

export interface Service {
  /** The source with this id on this host, or a 404. */
  source: (hostId: number, id: number) => Promise<SourceRow>;
  /** The id when given, else the first enabled source on the host. */
  pick: (hostId: number, id?: number) => Promise<SourceRow>;
  view: (row: SourceRow) => Promise<SourceView>;
  commands: (row: SourceRow) => Promise<UpsCommand[]>;
  send: (row: SourceRow, command: string) => Promise<string>;
  /** Runs the first command from `names` that the UPS supports. */
  sendFirst: (
    row: SourceRow,
    names: string[],
  ) => Promise<{ command: string; output: string }>;
}

export function createService(
  store: Store,
  engine: Engine,
  remote: Remote,
): Service {
  const target = (row: SourceRow) => ({
    hostId: row.hostId,
    backend: row.backend as Backend,
    target: row.target,
    snmpVersion: row.snmpVersion,
  });

  const service: Service = {
    async source(hostId, id) {
      const row = await store.get(id);
      if (!row || row.hostId !== hostId) {
        throw new UpsError("UPS not found", 404);
      }
      return row;
    },
    async pick(hostId, id) {
      if (id !== undefined) return service.source(hostId, id);
      const rows = (await store.forHost(hostId)).filter((r) => r.enabled);
      if (!rows.length) {
        throw new UpsError("This host has no UPS set up", 404, {
          code: "no-source",
        });
      }
      return rows[0];
    },
    async view(row) {
      const state = engine.state(row.id);
      const secrets = row.secrets ? await store.openSecrets(row) : {};
      return {
        id: row.id,
        hostId: row.hostId,
        backend: row.backend,
        label: row.label,
        target: row.target,
        snmpVersion: row.snmpVersion,
        lowCharge: row.lowCharge,
        lowRuntimeMin: row.lowRuntimeMin,
        alerts: row.alerts,
        enabled: row.enabled,
        hasSecrets: Object.keys(secrets).length > 0,
        reading: state?.reading ?? null,
        error: state?.error ?? "",
        readAt: state?.readAt ?? null,
      };
    },
    commands: (row) => listCommands(remote, target(row)),
    async send(row, command) {
      return runCommand(
        remote,
        target(row),
        command,
        await store.openSecrets(row),
      );
    },
    async sendFirst(row, names) {
      const have = new Set((await service.commands(row)).map((c) => c.name));
      const command = names.find((name) => have.has(name));
      if (!command) {
        throw new UpsError("This UPS does not support that", 400, {
          code: "unsupported",
        });
      }
      return { command, output: await service.send(row, command) };
    },
  };
  return service;
}
