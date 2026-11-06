import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { enabled } from "./format";
import { StoragePanel } from "./StoragePanel";

/** The storage card Host Metrics shows in its manager cards. */
export function StorageManagerCard({ hostId }: { hostId: number | null }) {
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
  return (
    <div className="flex h-[360px] min-h-0 flex-col">
      <StoragePanel hostId={Number(host.id)} isVisible />
    </div>
  );
}
