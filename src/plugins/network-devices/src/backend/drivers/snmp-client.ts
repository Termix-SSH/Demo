import * as snmp from "net-snmp";
import {
  DriverError,
  type SnmpClient,
  type SnmpValue,
  type Target,
} from "./types.js";

const TIMEOUT_MS = 4000;
const RETRIES = 1;
const MAX_REPETITIONS = 20;
// Stops a walk of a huge table (a core switch MAC table) from running away
const MAX_ROWS = 8000;

const AUTH: Record<string, number> = {
  md5: snmp.AuthProtocols.md5,
  sha: snmp.AuthProtocols.sha,
  sha224: snmp.AuthProtocols.sha224,
  sha256: snmp.AuthProtocols.sha256,
  sha384: snmp.AuthProtocols.sha384,
  sha512: snmp.AuthProtocols.sha512,
};

const PRIV: Record<string, number> = {
  des: snmp.PrivProtocols.des,
  aes: snmp.PrivProtocols.aes,
  aes256b: snmp.PrivProtocols.aes256b,
  aes256r: snmp.PrivProtocols.aes256r,
};

function fail(error: unknown): DriverError {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out/i.test(message)) {
    return new DriverError("The device did not answer SNMP");
  }
  return new DriverError(`SNMP failed: ${message}`);
}

function convert(varbind: { oid: string; value?: unknown }): SnmpValue | null {
  if (snmp.isVarbindError(varbind as never)) return null;
  const value = varbind.value;
  if (typeof value === "number" || Buffer.isBuffer(value)) {
    return { oid: varbind.oid, value };
  }
  if (typeof value === "bigint") return { oid: varbind.oid, value };
  return { oid: varbind.oid, value: String(value) };
}

function openSession(target: Target) {
  const { options, credentials } = target;
  const common = {
    port: target.port,
    timeout: target.timeoutMs ?? TIMEOUT_MS,
    retries: target.timeoutMs ? 0 : RETRIES,
    transport: "udp4" as const,
  };
  if (options.snmpVersion === "3") {
    const user: Record<string, unknown> = {
      name: credentials.username ?? "",
      level: snmp.SecurityLevel.noAuthNoPriv,
    };
    if (credentials.authKey) {
      user.level = snmp.SecurityLevel.authNoPriv;
      user.authProtocol = AUTH[credentials.authProtocol ?? "sha"] ?? AUTH.sha;
      user.authKey = credentials.authKey;
      if (credentials.privKey) {
        user.level = snmp.SecurityLevel.authPriv;
        user.privProtocol = PRIV[credentials.privProtocol ?? "aes"] ?? PRIV.aes;
        user.privKey = credentials.privKey;
      }
    }
    return snmp.createV3Session(
      target.address,
      user as never,
      { ...common, version: snmp.Version3 } as never,
    );
  }
  const version = options.snmpVersion === "1" ? snmp.Version1 : snmp.Version2c;
  return snmp.createSession(target.address, credentials.community ?? "", {
    ...common,
    version,
  } as never);
}

/** One SNMP session. Close it when the work is done. */
export function createSnmpClient(target: Target): SnmpClient {
  const session = openSession(target);
  let closed = false;
  // A socket error with no listener would crash the process
  session.on("error", () => {});

  return {
    get: (oids) =>
      new Promise((resolve, reject) => {
        session.get(oids, (error: Error | null, varbinds: never[]) => {
          if (error) return reject(fail(error));
          resolve(varbinds.map((varbind) => convert(varbind)));
        });
      }),

    walk: (oid) =>
      new Promise((resolve, reject) => {
        const rows: SnmpValue[] = [];
        let capped = false;
        session.subtree(
          oid,
          MAX_REPETITIONS,
          (varbinds: Array<{ oid: string; value?: unknown }>) => {
            for (const varbind of varbinds) {
              if (rows.length >= MAX_ROWS) {
                capped = true;
                // A true answer stops the walk
                return true;
              }
              const value = convert(varbind);
              if (value) rows.push(value);
            }
          },
          (error: Error | null) => {
            if (error && !capped) return reject(fail(error));
            resolve(rows);
          },
        );
      }),

    set: (oid, _type, value) =>
      new Promise((resolve, reject) => {
        session.set(
          [{ oid, type: snmp.ObjectType.Integer, value }],
          (
            error: Error | null,
            varbinds: Array<{ oid: string; value?: unknown }>,
          ) => {
            if (error) return reject(fail(error));
            const bad = varbinds?.find((varbind) =>
              snmp.isVarbindError(varbind as never),
            );
            if (bad) {
              return reject(
                new DriverError(
                  "The device refused the change. Check the write community.",
                ),
              );
            }
            resolve();
          },
        );
      }),

    close: () => {
      if (closed) return;
      closed = true;
      try {
        session.close();
      } catch {
        // already closed
      }
    },
  };
}
