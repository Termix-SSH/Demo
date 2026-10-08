import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosAdapter,
  type InternalAxiosRequestConfig,
} from "axios";
import { dispatch, type Method } from "./router";

const LATENCY_MS = [40, 160];

export function latency(): Promise<void> {
  const [min, max] = LATENCY_MS;
  return new Promise((r) => setTimeout(r, min + Math.random() * (max - min)));
}

function fullUrl(config: InternalAxiosRequestConfig): string {
  const base = config.baseURL ?? "";
  const url = config.url ?? "";
  if (/^https?:\/\//.test(url)) return url;
  if (!base) return url;
  return `${base.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`;
}

function parseBody(data: unknown): unknown {
  if (typeof data !== "string") return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

export const demoAdapter: AxiosAdapter = async (config) => {
  await latency();
  const method = (config.method ?? "get").toUpperCase() as Method;
  const { status, data } = await dispatch(
    method,
    fullUrl(config),
    parseBody(config.data),
    (config.params ?? {}) as Record<string, unknown>,
  );
  let body: unknown = data;
  if (
    status < 400 &&
    config.responseType === "blob" &&
    !(data instanceof Blob)
  ) {
    body = new Blob([typeof data === "string" ? data : JSON.stringify(data)], {
      type: typeof data === "string" ? "text/plain" : "application/json",
    });
  } else if (
    status < 400 &&
    config.responseType === "text" &&
    typeof data !== "string"
  ) {
    body = JSON.stringify(data);
  }
  const response = {
    data: body,
    status,
    statusText: status < 400 ? "OK" : "Error",
    headers: new AxiosHeaders({ "content-type": "application/json" }),
    config,
    request: {},
  };
  if (status >= 400) {
    throw new AxiosError(
      `Request failed with status code ${status}`,
      status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      {},
      response,
    );
  }
  return response;
};

// Every axios instance core creates inherits this from the defaults.
axios.defaults.adapter = demoAdapter;
