import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { enabled } from "./format";
import { UpsPanel } from "./UpsPanel";

/** The UPS card Host Metrics shows in its manager cards. */
export function UpsManagerCard({ hostId }: { hostId: number | null }) {
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
      <UpsPanel hostId={Number(host.id)} isVisible />
    </div>
  );
}
