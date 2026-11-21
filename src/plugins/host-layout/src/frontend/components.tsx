import { useShellController } from "@termix-ssh/plugin-sdk/ui";
import { HostsPanel } from "./sidebar/HostsPanel";
import type { ShellApi } from "@termix-ssh/plugin-sdk/frontend";
import { DashboardView } from "./tabs";

/**
 * The host list with its search, folders and actions, for other layouts to
 * place. It reads the shell itself, so it needs no props.
 */
export function HostTreeComponent() {
  const shell = useShellController();
  const { tabs, hosts } = shell;
  return (
    <HostsPanel
      onOpenTab={(host, type, options) => tabs.connectHost(host, type, options)}
      onEditHost={hosts.edit}
      hostTree={hosts.tree ?? undefined}
      loading={hosts.loading}
    />
  );
}

/** The Dashboard, for other layouts to place. It needs no props. */
export function DashboardComponent() {
  const { callbacks } = useShellController();
  return <DashboardView isVisible shell={callbacks as unknown as ShellApi} />;
}
