import { createHash } from "node:crypto";
import { errLine, shellQuote } from "@termix-ssh/plugin-sdk/host-scripts";

export { errLine, shellQuote };

/** Quotes each word for a shell command line. */
export function words(args: string[]): string {
  return args
    .map((arg) =>
      /^[A-Za-z0-9_./:=@%+,-]+$/.test(arg) ? arg : shellQuote(arg),
    )
    .join(" ");
}

/** A short stable id for a piece of text. */
export function hashId(text: string): string {
  return createHash("sha1").update(text).digest("hex").slice(0, 12);
}

/**
 * A script line that writes text to a file through base64, so nothing in it
 * is parsed. `path` is a fixed path or one built on a script variable like
 * $T, never user input.
 */
export function writeFile(path: string, content: string, mode = "600"): string {
  const data = Buffer.from(content, "utf8").toString("base64");
  return `printf '%s' ${shellQuote(data)} | base64 -d > "${path}" && chmod ${mode} "${path}"`;
}
