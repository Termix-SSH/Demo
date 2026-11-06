import type { Response } from "express";
import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";
import { scriptShell, scrub } from "@termix-ssh/plugin-sdk/host-scripts";
import type { Env } from "./repo-env.js";
import { dumpScript } from "./scripts.js";

interface ExecStream {
  on(event: "data", fn: (chunk: Buffer) => void): ExecStream;
  on(event: "close", fn: (code: number | null) => void): ExecStream;
  stderr: { on(event: "data", fn: (chunk: Buffer) => void): unknown };
  write(text: string): boolean;
  end(): void;
  close(): void;
  pause(): void;
  resume(): void;
}

interface ExecClient {
  exec(
    command: string,
    callback: (error: Error | undefined, stream: ExecStream) => void,
  ): void;
}

function fileName(path: string, folder: boolean): string {
  const base = path.split("/").filter(Boolean).pop() || "snapshot";
  return folder ? `${base}.zip` : base;
}

/**
 * Streams a file, or a folder as zip, from a snapshot to the browser. The
 * response starts only once the first bytes arrive, so an error before that
 * is still answered as JSON.
 */
export async function streamDump(
  ctx: PluginContext,
  res: Response,
  options: {
    hostId: number;
    env: Env;
    snapshot: string;
    path: string;
    folder: boolean;
  },
): Promise<void> {
  const connection = await ctx.ssh.connect<ExecClient>(options.hostId, {
    purpose: "backups",
    profile: "stream",
  });
  await new Promise<void>((resolve) => {
    let started = false;
    let stderr = "";
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      connection.dispose();
      resolve();
    };
    connection.client.exec(scriptShell("root"), (error, stream) => {
      if (error) {
        res.status(500).json({ error: "Could not start the download" });
        finish();
        return;
      }
      res.on("close", () => {
        if (!done) stream.close();
        finish();
      });
      const begin = () => {
        if (started) return;
        started = true;
        const name = fileName(options.path, options.folder);
        res.status(200);
        res.setHeader(
          "Content-Type",
          options.folder ? "application/zip" : "application/octet-stream",
        );
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${name.replace(/[^\x20-\x7e]|"/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        );
      };
      stream.on("data", (chunk) => {
        begin();
        if (!res.write(chunk)) {
          stream.pause();
          res.once("drain", () => stream.resume());
        }
      });
      stream.stderr.on("data", (chunk) => {
        if (stderr.length < 4000) stderr += chunk.toString("utf8");
      });
      stream.on("close", (code) => {
        if (!started && code === 0) begin();
        if (started) {
          res.end();
        } else if (!res.headersSent) {
          res.status(400).json({
            error: scrub(stderr || "The download failed", 600),
          });
        }
        finish();
      });
      stream.write(
        dumpScript(options.env, options.snapshot, options.path, options.folder),
      );
      stream.end();
    });
  });
}
