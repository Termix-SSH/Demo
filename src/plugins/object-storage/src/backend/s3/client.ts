import { createHash } from "node:crypto";
import type { PluginFetch } from "@termix-ssh/plugin-sdk/backend";
import type { Listing, ObjectHead } from "../../shared/types.js";
import {
  EMPTY_HASH,
  encodePath,
  presignS3,
  sha256Hex,
  signS3,
} from "./sigv4.js";
import { all, child, childText, escapeXml, parseXml } from "./xml.js";

export const PART_SIZE = 8 * 1024 * 1024;

export class S3Error extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "S3Error";
  }
}

export interface S3Config {
  endpoint: string;
  region: string;
  pathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  ca?: string;
  // Only AWS wants a location constraint
  aws?: boolean;
}

export interface RequestOptions {
  bucket?: string;
  key?: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Buffer | string;
  /** Checked before the request. A signal can't cross to core, so it is not sent. */
  signal?: AbortSignal;
}

const md5 = (body: Buffer | string) =>
  createHash("md5").update(body).digest("base64");

/** One S3 compatible login, talking through the server's guarded fetch. */
export class S3Client {
  constructor(
    private readonly cfg: S3Config,
    private readonly fetchFn: PluginFetch,
  ) {}

  get region() {
    return this.cfg.region;
  }

  /** The address of a bucket or an object. */
  url(bucket?: string, key?: string, query: Record<string, string> = {}) {
    const base = new URL(this.cfg.endpoint);
    let host = base.host;
    let path = base.pathname.replace(/\/+$/, "");
    if (bucket) {
      if (this.cfg.pathStyle) path += `/${encodePath(bucket)}`;
      else host = `${bucket}.${base.host}`;
    }
    if (key !== undefined) path += `/${encodePath(key)}`;
    else if (bucket && !this.cfg.pathStyle) path += "/";
    const search = Object.entries(query)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    return `${base.protocol}//${host}${path || "/"}${search ? `?${search}` : ""}`;
  }

  private privateHosts(bucket?: string): string[] {
    const base = new URL(this.cfg.endpoint);
    const hosts = [base.hostname];
    if (bucket && !this.cfg.pathStyle) hosts.push(`${bucket}.${base.hostname}`);
    return hosts;
  }

  async send(method: string, options: RequestOptions = {}): Promise<Response> {
    const body = options.body;
    const url = this.url(options.bucket, options.key, options.query);
    const payloadHash =
      body === undefined ? EMPTY_HASH : sha256Hex(body as Buffer);
    const headers = signS3({
      method,
      url,
      region: this.cfg.region,
      headers: options.headers,
      payloadHash,
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      sessionToken: this.cfg.sessionToken,
    });
    delete headers.host;
    options.signal?.throwIfAborted();
    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method,
        headers,
        // The type says string, the guard hands a buffer to undici as is
        body: body as never,
        allowPrivateHosts: this.privateHosts(options.bucket),
        timeoutMs: 60_000,
        ...(this.cfg.ca ? { tls: { ca: this.cfg.ca } } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new S3Error(502, "Unreachable", message);
    }
    if (response.status >= 300) throw await toError(response);
    return response;
  }

  private async xml(method: string, options: RequestOptions = {}) {
    const response = await this.send(method, options);
    return parseXml(await response.text());
  }

  async listBuckets(): Promise<
    Array<{ name: string; createdAt: string | null }>
  > {
    const root = await this.xml("GET");
    return all(child(root, "Buckets"), "Bucket").map((node) => ({
      name: childText(node, "Name") ?? "",
      createdAt: childText(node, "CreationDate") ?? null,
    }));
  }

  async listObjects(
    bucket: string,
    options: {
      prefix?: string;
      delimiter?: string;
      token?: string;
      max?: number;
    },
  ): Promise<Listing> {
    const query: Record<string, string> = {
      "list-type": "2",
      "max-keys": String(options.max ?? 200),
    };
    if (options.delimiter !== "") query.delimiter = options.delimiter ?? "/";
    if (options.prefix) query.prefix = options.prefix;
    if (options.token) query["continuation-token"] = options.token;
    const root = await this.xml("GET", { bucket, query });
    return {
      prefix: options.prefix ?? "",
      folders: all(root, "CommonPrefixes")
        .map((node) => childText(node, "Prefix") ?? "")
        .filter(Boolean),
      objects: all(root, "Contents").map((node) => ({
        key: childText(node, "Key") ?? "",
        size: Number(childText(node, "Size") ?? 0),
        modifiedAt: childText(node, "LastModified") ?? null,
        etag: (childText(node, "ETag") ?? "").replace(/"/g, "") || null,
        storageClass: childText(node, "StorageClass") ?? null,
      })),
      next:
        childText(root, "IsTruncated") === "true"
          ? (childText(root, "NextContinuationToken") ?? null)
          : null,
    };
  }

  async head(bucket: string, key: string): Promise<ObjectHead> {
    const response = await this.send("HEAD", { bucket, key });
    const metadata: Record<string, string> = {};
    response.headers.forEach((value, name) => {
      if (name.startsWith("x-amz-meta-")) {
        metadata[name.slice("x-amz-meta-".length)] = value;
      }
    });
    return {
      key,
      size: Number(response.headers.get("content-length") ?? 0),
      contentType: response.headers.get("content-type"),
      modifiedAt: response.headers.get("last-modified"),
      etag: response.headers.get("etag")?.replace(/"/g, "") ?? null,
      metadata,
    };
  }

  get(bucket: string, key: string, range?: string, signal?: AbortSignal) {
    return this.send("GET", {
      bucket,
      key,
      headers: range ? { range } : undefined,
      signal,
    });
  }

  async put(
    bucket: string,
    key: string,
    body: Buffer,
    contentType = "application/octet-stream",
  ) {
    await this.send("PUT", {
      bucket,
      key,
      body,
      headers: { "content-type": contentType },
    });
  }

  async createFolder(bucket: string, prefix: string) {
    await this.put(
      bucket,
      prefix.endsWith("/") ? prefix : `${prefix}/`,
      Buffer.alloc(0),
    );
  }

  async startUpload(bucket: string, key: string, contentType: string) {
    const root = await this.xml("POST", {
      bucket,
      key,
      query: { uploads: "" },
      headers: { "content-type": contentType },
    });
    const id = childText(root, "UploadId");
    if (!id) throw new S3Error(502, "BadAnswer", "No upload id came back");
    return id;
  }

  async uploadPart(
    bucket: string,
    key: string,
    uploadId: string,
    number: number,
    body: Buffer,
  ): Promise<string> {
    const response = await this.send("PUT", {
      bucket,
      key,
      body,
      query: { partNumber: String(number), uploadId },
    });
    return response.headers.get("etag") ?? "";
  }

  async finishUpload(
    bucket: string,
    key: string,
    uploadId: string,
    parts: Array<{ number: number; etag: string }>,
  ) {
    const body = `<CompleteMultipartUpload>${parts
      .map(
        (part) =>
          `<Part><PartNumber>${part.number}</PartNumber><ETag>${escapeXml(part.etag)}</ETag></Part>`,
      )
      .join("")}</CompleteMultipartUpload>`;
    const response = await this.send("POST", {
      bucket,
      key,
      query: { uploadId },
      body,
      headers: { "content-type": "application/xml" },
    });
    // S3 can answer 200 with an error in the body
    const text = await response.text();
    if (text.includes("<Error>")) {
      const root = parseXml(text);
      throw new S3Error(
        502,
        childText(root, "Code") ?? "Error",
        childText(root, "Message") ?? "Upload failed",
      );
    }
  }

  async abortUpload(bucket: string, key: string, uploadId: string) {
    await this.send("DELETE", { bucket, key, query: { uploadId } }).catch(
      () => undefined,
    );
  }

  async remove(bucket: string, key: string) {
    await this.send("DELETE", { bucket, key });
  }

  async removeMany(bucket: string, keys: string[]): Promise<string[]> {
    const failed: string[] = [];
    for (let i = 0; i < keys.length; i += 1000) {
      const batch = keys.slice(i, i + 1000);
      const body = `<Delete><Quiet>true</Quiet>${batch
        .map((key) => `<Object><Key>${escapeXml(key)}</Key></Object>`)
        .join("")}</Delete>`;
      const root = await this.xml("POST", {
        bucket,
        query: { delete: "" },
        body,
        headers: {
          "content-type": "application/xml",
          "content-md5": md5(body),
        },
      });
      for (const node of all(root, "Error")) {
        failed.push(childText(node, "Key") ?? "");
      }
    }
    return failed;
  }

  async copy(
    bucket: string,
    key: string,
    sourceBucket: string,
    sourceKey: string,
  ) {
    const response = await this.send("PUT", {
      bucket,
      key,
      headers: {
        "x-amz-copy-source": `/${encodePath(sourceBucket)}/${encodePath(sourceKey)}`,
      },
    });
    const text = await response.text();
    if (text.includes("<Error>")) {
      const root = parseXml(text);
      throw new S3Error(
        502,
        childText(root, "Code") ?? "Error",
        childText(root, "Message") ?? "Copy failed",
      );
    }
  }

  async createBucket(bucket: string) {
    const body =
      this.cfg.aws && this.cfg.region !== "us-east-1"
        ? `<CreateBucketConfiguration><LocationConstraint>${escapeXml(this.cfg.region)}</LocationConstraint></CreateBucketConfiguration>`
        : undefined;
    await this.send("PUT", {
      bucket,
      body,
      headers: body ? { "content-type": "application/xml" } : undefined,
    });
  }

  async deleteBucket(bucket: string) {
    await this.send("DELETE", { bucket });
  }

  /** Reads a bucket sub resource as XML. */
  readSub(bucket: string, name: string) {
    return this.xml("GET", { bucket, query: { [name]: "" } });
  }

  /** Reads a bucket sub resource as text. */
  async readSubText(bucket: string, name: string) {
    const response = await this.send("GET", { bucket, query: { [name]: "" } });
    return response.text();
  }

  async writeSub(
    bucket: string,
    name: string,
    body: string,
    contentType = "application/xml",
  ) {
    await this.send("PUT", {
      bucket,
      query: { [name]: "" },
      body,
      headers: { "content-type": contentType, "content-md5": md5(body) },
    });
  }

  async deleteSub(bucket: string, name: string) {
    await this.send("DELETE", { bucket, query: { [name]: "" } });
  }

  /** A link that works without keys until it expires. */
  share(bucket: string, key: string, seconds: number): string {
    return presignS3({
      method: "GET",
      url: this.url(bucket, key),
      region: this.cfg.region,
      expiresSeconds: seconds,
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      sessionToken: this.cfg.sessionToken,
    });
  }
}

async function toError(response: Response): Promise<S3Error> {
  let code = `Http${response.status}`;
  let message = describe(response.status);
  try {
    const text = await response.text();
    if (text.includes("<Error")) {
      const root = parseXml(text);
      code = childText(root, "Code") ?? code;
      message = childText(root, "Message") || message;
    } else if (text.trim()) {
      message = text.trim().slice(0, 300);
    }
  } catch {
    // keep the status text
  }
  return new S3Error(response.status, code, message);
}

function describe(status: number): string {
  if (status === 401 || status === 403) return "The keys were refused";
  if (status === 404) return "Not found";
  if (status === 405 || status === 501) return "Not supported by this provider";
  return `The provider answered ${status}`;
}
