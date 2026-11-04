import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { FirewallPanel } from "./FirewallCompanion";

function enabled(host: object | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.firewall?.enableFirewall === true;
}

/** The firewall card Host Metrics shows in its manager cards. */
export function FirewallManagerCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  if (!host) return null;
  if (!enabled(host)) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t("manager.disabled")}
      </p>
    );
  }
  return <FirewallPanel host={host as never} isVisible />;
}
