/**
 * Large downloads as a run of ranged GETs. ctx.fetch hands back a whole body
 * at once in a plugin process, so one GET for a big object would sit in
 * memory whole.
 */
export const CHUNK_BYTES = 8 * 1024 * 1024;

type RangedGet = (range: string) => Promise<Response>;

function parseRange(
  range: string | undefined,
): { start: number; end?: number } | null {
  const match = range?.trim().match(/^bytes=(\d+)-(\d*)$/);
  if (!match) return null;
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : undefined;
  if (end !== undefined && end < start) return null;
  return { start, end };
}

function totalOf(contentRange: string | null): number | null {
  const match = contentRange?.match(/\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

/**
 * Answers like one GET would: 200 for the whole object, 206 for a range.
 * Suffix and multi ranges, and stores that ignore ranges, get a single GET.
 */
export async function chunkedGet(
  get: RangedGet,
  range?: string,
  chunk = CHUNK_BYTES,
): Promise<Response> {
  const asked = parseRange(range);
  if (range && !asked) return get(range);
  const start = asked?.start ?? 0;
  const firstEnd =
    asked?.end !== undefined
      ? Math.min(asked.end, start + chunk - 1)
      : start + chunk - 1;
  const first = await get(`bytes=${start}-${firstEnd}`);
  if (first.status !== 206) return first;
  const total = totalOf(first.headers.get("content-range"));
  if (total === null) return first;

  const end = Math.min(asked?.end ?? total - 1, total - 1);
  const headers = new Headers(first.headers);
  headers.set("content-length", String(end - start + 1));
  if (asked) headers.set("content-range", `bytes ${start}-${end}/${total}`);
  else headers.delete("content-range");

  let pending: Response | null = first;
  let next = firstEnd + 1;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        let response = pending;
        pending = null;
        if (!response) {
          if (next > end) {
            controller.close();
            return;
          }
          const to = Math.min(next + chunk - 1, end);
          response = await get(`bytes=${next}-${to}`);
          if (response.status !== 206) {
            throw new Error(
              `The store answered ${response.status} mid download`,
            );
          }
          next = to + 1;
        }
        controller.enqueue(new Uint8Array(await response.arrayBuffer()));
      } catch (error) {
        controller.error(error);
      }
    },
  });
  return new Response(body, { status: asked ? 206 : 200, headers });
}
