import crypto from "node:crypto";
import net from "node:net";
import { Client } from "ssh2";
import { resolveTarget } from "@termix-ssh/plugin-sdk/net-guard";
import { DriverError, type Target } from "./types.js";

const TIMEOUT_MS = 30_000;
const MAX_OUTPUT = 8 * 1024 * 1024;
const IDLE_MS = 3_000;

/** Runs lines in a device's interactive shell and gives back what it printed. */
export type ShellRunner = (target: Target, lines: string[]) => Promise<string>;

/** SHA256 of a host key, as ssh-keygen -l prints it. */
export function fingerprint(key: Buffer): string {
  return `SHA256:${crypto.createHash("sha256").update(key).digest("base64").replace(/=+$/, "")}`;
}

/**
 * The shell over SSH. Older network gear only knows older algorithms, so
 * those are added after the modern ones. A pinned host key is checked.
 */
export const sshShell: ShellRunner = async (target, lines) => {
  const resolved = await resolveTarget(target.address, {
    allowPrivateHosts: [target.address.replace(/^\[|\]$/g, "")],
  });
  const pinned = target.credentials.hostKey?.trim();
  return new Promise<string>((resolve, reject) => {
    const client = new Client();
    let output = "";
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      client.end();
      if (error) reject(error);
      else resolve(output);
    };
    const timer = setTimeout(
      () => finish(new DriverError("The device took too long to answer")),
      TIMEOUT_MS,
    );
    const socket = net.connect({
      host: resolved.address,
      port: target.port,
      family: resolved.family,
    });
    socket.on("error", (error) =>
      finish(new DriverError(`Could not reach the device: ${error.message}`)),
    );
    client.on("error", (error) => {
      const message = error.message || String(error);
      finish(
        new DriverError(
          /authentication/i.test(message)
            ? "The device refused the login"
            : `SSH failed: ${message}`,
        ),
      );
    });
    client.on("ready", () => {
      client.shell({ term: "vt100", cols: 511, rows: 24 }, (error, stream) => {
        if (error) {
          finish(new DriverError(`Could not open a shell: ${error.message}`));
          return;
        }
        let lastData = Date.now();
        stream.on("data", (chunk: Buffer) => {
          lastData = Date.now();
          output += chunk.toString("utf8");
          if (output.length > MAX_OUTPUT) {
            finish(new DriverError("The device sent too much output"));
          }
        });
        stream.stderr.on("data", (chunk: Buffer) => {
          output += chunk.toString("utf8");
        });
        stream.on("close", () => finish());
        // Lines go one at a time, so a slow prompt never eats the next one.
        let i = 0;
        const next = () => {
          if (i >= lines.length) {
            // Some devices keep the session after exit: stop once they go quiet.
            const idle = setInterval(() => {
              if (Date.now() - lastData >= IDLE_MS) {
                clearInterval(idle);
                finish();
              }
            }, 250);
            return;
          }
          stream.write(`${lines[i++]}\n`);
          setTimeout(next, 150);
        };
        next();
      });
    });
    client.connect({
      sock: socket,
      username: target.credentials.username ?? "",
      password: target.credentials.password ?? "",
      tryKeyboard: true,
      readyTimeout: TIMEOUT_MS,
      hostVerifier: (key: Buffer) => !pinned || fingerprint(key) === pinned,
      algorithms: {
        kex: {
          append: [
            "diffie-hellman-group14-sha1",
            "diffie-hellman-group-exchange-sha1",
            "diffie-hellman-group1-sha1",
          ],
        },
        cipher: {
          append: ["aes128-cbc", "aes192-cbc", "aes256-cbc", "3des-cbc"],
        },
        serverHostKey: { append: ["ssh-rsa"] },
        hmac: { append: ["hmac-sha1"] },
      } as never,
    });
    client.on("keyboard-interactive", (_name, _instr, _lang, prompts, reply) =>
      reply(prompts.map(() => target.credentials.password ?? "")),
    );
  });
};
