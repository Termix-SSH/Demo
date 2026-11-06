import { DriverError, type DriverIo, type Target } from "./types.js";
import { send } from "./http.js";

const MAX_BUFFER = 16 * 1024 * 1024;
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);

/**
 * Splits a multipart MJPEG stream into JPEG frames. Uses the part's
 * Content-Length when there is one, else the JPEG start and end markers.
 */
export function createMjpegParser(onFrame: (jpeg: Buffer) => void) {
  let buffer: Buffer = Buffer.alloc(0);

  function next(): boolean {
    const start = buffer.indexOf(SOI);
    if (start === -1) {
      // Keep one byte in case a marker is split across chunks
      buffer = buffer.subarray(Math.max(0, buffer.length - 1));
      return false;
    }
    const header = buffer.subarray(0, start).toString("latin1");
    const length = /content-length:\s*(\d+)/i.exec(header)?.[1];
    if (length) {
      const size = Number(length);
      if (buffer.length < start + size) {
        buffer = buffer.subarray(start);
        return false;
      }
      onFrame(buffer.subarray(start, start + size));
      buffer = buffer.subarray(start + size);
      return true;
    }
    const end = buffer.indexOf(EOI, start + 2);
    if (end === -1) {
      buffer = buffer.subarray(start);
      return false;
    }
    onFrame(buffer.subarray(start, end + 2));
    buffer = buffer.subarray(end + 2);
    return true;
  }

  return {
    push(chunk: Buffer) {
      buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
      if (buffer.length > MAX_BUFFER) {
        buffer = Buffer.alloc(0);
        throw new DriverError("The KVM video stream is not valid MJPEG");
      }
      while (next());
    },
  };
}

export interface MjpegStream {
  close: () => void;
}

/** Opens an MJPEG stream and calls back for every frame. */
export async function openMjpeg(
  target: Target,
  io: DriverIo,
  url: string,
  headers: Record<string, string>,
  onFrame: (jpeg: Buffer) => void,
  onEnd: (reason?: string) => void,
): Promise<MjpegStream> {
  const controller = new AbortController();
  const response = await send(target, io, url, {
    headers,
    signal: controller.signal,
  });
  if (!response.ok || !response.body) {
    throw new DriverError(`The KVM video stream answered ${response.status}`);
  }
  const parser = createMjpegParser(onFrame);
  const reader = response.body.getReader();
  let closed = false;
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parser.push(Buffer.from(value));
      }
      if (!closed) onEnd("The video stream ended");
    } catch (error) {
      if (!closed) {
        onEnd(error instanceof Error ? error.message : String(error));
      }
    }
  })();
  return {
    close() {
      closed = true;
      controller.abort();
      void reader.cancel().catch(() => {});
    },
  };
}

/** The first frame of a stream. */
export async function firstFrame(
  target: Target,
  io: DriverIo,
  url: string,
  headers: Record<string, string>,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    let stream: MjpegStream | null = null;
    let done = false;
    const timer = setTimeout(
      () => finish(null, "No picture from the KVM"),
      10_000,
    );
    function finish(frame: Buffer | null, reason?: string) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream?.close();
      if (frame) resolve(Buffer.from(frame));
      else reject(new DriverError(reason ?? "No picture from the KVM"));
    }
    openMjpeg(
      target,
      io,
      url,
      headers,
      (frame) => finish(frame),
      (reason) => finish(null, reason),
    )
      .then((opened) => {
        stream = opened;
        if (done) opened.close();
      })
      .catch((error: unknown) =>
        finish(null, error instanceof Error ? error.message : String(error)),
      );
  });
}
