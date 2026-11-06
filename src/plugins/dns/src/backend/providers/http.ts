import { ProviderError, type PluginFetch } from "./types.js";

export function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "The provider refused the keys";
  if (status === 404) return "The provider could not find it";
  if (status === 429) return "The provider is rate limiting requests";
  return `The provider answered ${status}`;
}

export interface SendInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}

export async function send(
  fetch: PluginFetch,
  url: string,
  init: SendInit = {},
): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, { timeoutMs: 30_000, ...init });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ProviderError(`Could not reach the provider: ${message}`);
  }
  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.text()).slice(0, 300);
    } catch {
      // body already gone
    }
    throw new ProviderError(
      `${describeStatus(response.status)}${detail ? `: ${detail}` : ""}`,
      response.status,
    );
  }
  return response;
}

/** JSON request with an optional JSON body. An empty answer gives null. */
export async function jsonCall<T = unknown>(
  fetch: PluginFetch,
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<T> {
  const response = await send(fetch, url, {
    method: init.method,
    headers: {
      accept: "application/json",
      ...(init.body === undefined
        ? {}
        : { "content-type": "application/json" }),
      ...init.headers,
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await response.text();
  if (!text.trim()) return null as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ProviderError("The provider sent an answer that is not JSON");
  }
}

/** Runs the tasks a few at a time. */
export async function pool<T, R>(
  items: T[],
  size: number,
  run: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, () =>
    (async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        results[current] = await run(items[current]);
      }
    })(),
  );
  await Promise.all(workers);
  return results;
}

export const MAX_PAGES = 200;
