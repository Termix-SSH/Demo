import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { webServersEnabled } from "./enabled";
import { WebServersPanel } from "./WebServersPanel";

/** The Web Servers card Host Metrics shows in its manager cards. */
export function ManagerCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  if (!host) return null;
  if (!webServersEnabled(host)) {
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t("manager.disabled")}
      </p>
    );
  }
  return <WebServersPanel host={host as never} isVisible />;
}
