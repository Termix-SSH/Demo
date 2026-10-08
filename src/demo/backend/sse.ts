import { rawFetch } from "./fetch";

const encoder = new TextEncoder();

type Send = (event: string, data: unknown) => void;

/**
 * A server-sent event stream answered in the page. `open` gets a send
 * function and returns an optional cleanup for when the reader goes away.
 */
export function sse(
  matches: (path: string) => boolean,
  open: (send: Send, close: () => void, path: string) => void | (() => void),
): void {
  rawFetch(matches, async (path, init) => {
    let cleanup: (() => void) | undefined;
    let closed = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const close = () => {
          if (closed) return;
          closed = true;
          cleanup?.();
          try {
            controller.close();
          } catch {
            // Already closed by the reader.
          }
        };
        const send: Send = (event, data) => {
          if (closed) return;
          try {
            controller.enqueue(
              encoder.encode(
                `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
              ),
            );
          } catch {
            close();
          }
        };
        cleanup = open(send, close, path) || undefined;
        init?.signal?.addEventListener("abort", close);
      },
      cancel() {
        closed = true;
        cleanup?.();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
  });
}
