import type { Backend } from "../../shared/types.js";
import { FirewallError } from "../errors.js";
import { firewalldModule } from "./firewalld.js";
import { iptablesModule, nftablesModule } from "./managed.js";
import type { BackendModule } from "./types.js";
import { ufwModule } from "./ufw.js";
import { WINDOWS_RAW, planWindows } from "./windows.js";

/** Windows Firewall: the manager runs its own arm, keep and undo scripts. */
const windowsModule: BackendModule = {
  plan: planWindows,
  backup: "",
  restore: "",
  raw: WINDOWS_RAW,
};

const MODULES: Record<Backend, BackendModule> = {
  ufw: ufwModule,
  firewalld: firewalldModule,
  nftables: nftablesModule,
  iptables: iptablesModule,
  windows: windowsModule,
};

export function moduleFor(backend: Backend | null): BackendModule {
  if (!backend) {
    throw new FirewallError(
      "This host has no firewall yet. Install one first.",
      409,
      {
        code: "none",
      },
    );
  }
  return MODULES[backend];
}
