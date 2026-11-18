import type { NextFunction, Request, Response } from "express";

const LIMIT_BYTES = 2 * 1024 * 1024;
const JSON_TYPES = /^application\/(scim\+)?json\b/i;

/** Parses JSON and SCIM JSON bodies, since the router gets them raw. */
export function jsonBody(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  // Already read by a parser in front, or not JSON at all.
  const consumed =
    (req as { _body?: boolean })._body === true || req.readableEnded;
  if (consumed || !JSON_TYPES.test(req.headers["content-type"] ?? "")) {
    req.body ??= {};
    next();
    return;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  let done = false;
  const finish = (status: number | null) => {
    if (done) return;
    done = true;
    if (status !== null) {
      res
        .status(status)
        .json({ error: status === 413 ? "Body is too large" : "Bad JSON" });
      return;
    }
    const text = Buffer.concat(chunks).toString("utf8");
    try {
      req.body = text.trim() ? JSON.parse(text) : {};
    } catch {
      res.status(400).json({ error: "Bad JSON" });
      return;
    }
    next();
  };
  req.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > LIMIT_BYTES) {
      finish(413);
      req.destroy();
      return;
    }
    chunks.push(chunk);
  });
  req.on("end", () => finish(null));
  req.on("error", () => finish(400));
}
