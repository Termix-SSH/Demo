import {
  isPrivateAddress,
  resolveTarget as guardedTarget,
  TargetRefusedError,
  type ResolvedTarget,
  type TargetGuardOptions,
} from "@termix-ssh/plugin-sdk/net-guard";

export { isPrivateAddress, type ResolvedTarget };

export class BlockedTargetError extends Error {
  readonly code = "private_target";
  constructor(target: string) {
    super(`${target} is a private address, which you are not allowed to check`);
  }
}

/**
 * The SDK target guard with Uptime's private targets permission. Connect to
 * the address it returns, so the name can't change between check and use.
 */
export async function resolveTarget(
  host: string,
  allowPrivate: boolean,
  lookup?: TargetGuardOptions["lookup"],
): Promise<ResolvedTarget> {
  try {
    return await guardedTarget(host, {
      allowPrivateHosts: allowPrivate ? [host] : [],
      lookup,
    });
  } catch (error) {
    if (error instanceof TargetRefusedError) throw new BlockedTargetError(host);
    throw error;
  }
}
