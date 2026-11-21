import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

interface Channel {
  on(event: "data", fn: (chunk: Buffer) => void): Channel;
  on(event: "end" | "drain", fn: () => void): Channel;
  on(event: "exit", fn: (code: number | null) => void): Channel;
  on(event: "close", fn: (code?: number | null) => void): Channel;
  once(event: "drain", fn: () => void): Channel;
  stderr: { on(event: "data", fn: (chunk: Buffer) => void): unknown };
  write(data: string | Buffer): boolean;
  end(): void;
  close(): void;
  pause(): void;
  resume(): void;
}

interface ExecClient {
  exec(
    command: string,
    callback: (error: Error | undefined, stream: Channel) => void,
  ): void;
}

interface Side {
  code: number | null;
  /** The end of stderr, at most `stderrLimit` bytes. */
  stderr: string;
}

export interface RelayResult {
  source: Side;
  /** Null when the sink never started: the source sent nothing. */
  sink: Side | null;
  bytes: number;
  canceled: boolean;
}

export interface RelayOptions {
  sourceHost: number;
  sourceCommand: string;
  sourceStdin?: string;
  /** Picks where the stream goes, from its first bytes (up to 512). */
  sink: (head: Buffer) => { host: number; command: string };
  onBytes?: (total: number) => void;
  signal?: AbortSignal;
  stderrLimit?: number;
}

/** Bytes from the start of a stream that tell a tar archive from a plain file. */
export function looksLikeTar(head: Buffer): boolean {
  return head.length >= 262 && head.subarray(257, 262).toString() === "ustar";
}

function tail(text: string, chunk: Buffer, limit: number): string {
  const next = text + chunk.toString("utf8");
  return next.length > limit ? next.slice(next.length - limit) : next;
}

async function open(
  ctx: PluginContext,
  host: number,
  command: string,
): Promise<{ channel: Channel; dispose: () => void }> {
  const connection = await ctx.ssh.connect<ExecClient>(host, {
    purpose: "backups",
    profile: "stream",
  });
  try {
    const channel = await new Promise<Channel>((resolve, reject) => {
      connection.client.exec(command, (error, stream) =>
        error ? reject(error) : resolve(stream),
      );
    });
    return { channel, dispose: () => connection.dispose() };
  } catch (error) {
    connection.dispose();
    throw error;
  }
}

/** Waits for a channel to close and gives its exit code. */
function closed(channel: Channel): Promise<number | null> {
  return new Promise((resolve) => {
    let code: number | null = null;
    channel.on("exit", (c) => {
      code = typeof c === "number" ? c : null;
    });
    channel.on("close", (c) => {
      if (code === null && typeof c === "number") code = c;
      resolve(code);
    });
  });
}

/**
 * Runs a command on one host and pipes its stdout into a command on another,
 * through Termix. Neither host connects to the other. The sink starts on the
 * first bytes, or when the source ends cleanly with none.
 */
export async function relay(
  ctx: PluginContext,
  options: RelayOptions,
): Promise<RelayResult> {
  const limit = options.stderrLimit ?? 64 * 1024;
  const source = await open(ctx, options.sourceHost, options.sourceCommand);
  let sink: { channel: Channel; dispose: () => void } | null = null;
  let sinkStderr = "";
  let sourceStderr = "";
  let bytes = 0;
  let canceled = false;
  let head = Buffer.alloc(0);
  let sinkStarting: Promise<void> | null = null;
  let sinkFailed: unknown = null;
  let sinkDone: Promise<number | null> | null = null;
  let lastReport = 0;

  const stop = () => {
    canceled = true;
    source.channel.close();
    sink?.channel.close();
  };
  if (options.signal?.aborted) stop();
  options.signal?.addEventListener("abort", stop, { once: true });

  const startSink = (): Promise<void> => {
    if (sinkStarting) return sinkStarting;
    source.channel.pause();
    sinkStarting = (async () => {
      const target = options.sink(head);
      sink = await open(ctx, target.host, target.command);
      sink.channel.stderr.on("data", (chunk) => {
        sinkStderr = tail(sinkStderr, chunk, limit);
      });
      sink.channel.on("data", () => {});
      sinkDone = closed(sink.channel);
      // The sink quit early: stop reading the source too.
      void sinkDone.then(() => source.channel.close());
      if (canceled) {
        sink.channel.close();
        return;
      }
      if (head.length) sink.channel.write(head);
      head = Buffer.alloc(0);
    })().catch((error) => {
      sinkFailed = error;
      source.channel.close();
    });
    void sinkStarting.then(() => source.channel.resume());
    return sinkStarting;
  };

  const sourceDone = closed(source.channel);
  source.channel.stderr.on("data", (chunk) => {
    sourceStderr = tail(sourceStderr, chunk, limit);
  });
  source.channel.on("data", (chunk) => {
    bytes += chunk.length;
    const now = Date.now();
    if (options.onBytes && now - lastReport > 2000) {
      lastReport = now;
      options.onBytes(bytes);
    }
    if (!sink) {
      head = Buffer.concat([head, chunk]);
      if (head.length >= 512) void startSink();
      return;
    }
    if (!sink.channel.write(chunk)) {
      source.channel.pause();
      sink.channel.once("drain", () => source.channel.resume());
    }
  });
  if (options.sourceStdin) source.channel.write(options.sourceStdin);
  source.channel.end();

  let sourceCode: number | null = null;
  try {
    sourceCode = await sourceDone;
    if (
      !sink &&
      !sinkStarting &&
      !canceled &&
      (head.length || sourceCode === 0)
    ) {
      await startSink();
    }
    if (sinkStarting) await sinkStarting;
    const opened = sink as { channel: Channel; dispose: () => void } | null;
    if (opened) opened.channel.end();
    const sinkCode = sinkDone ? await sinkDone : null;
    if (sinkFailed) throw sinkFailed;
    options.onBytes?.(bytes);
    return {
      source: { code: sourceCode, stderr: sourceStderr },
      sink: opened ? { code: sinkCode, stderr: sinkStderr } : null,
      bytes,
      canceled,
    };
  } finally {
    options.signal?.removeEventListener("abort", stop);
    source.dispose();
    (sink as { dispose: () => void } | null)?.dispose();
  }
}
