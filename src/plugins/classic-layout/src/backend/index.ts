import type { PluginContext } from "@termix-ssh/plugin-sdk/backend";

/** The layout is all frontend. There is nothing to start on the server. */
export function activate(ctx: PluginContext): void {
  ctx.log.info("Classic layout ready");
}
