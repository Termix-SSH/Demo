import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge } from "@termix-ssh/plugin-sdk/ui";

export type ExpiryTone = "destructive" | "warning" | "success" | "muted";

export function expiryTone(
  daysLeft: number | null,
  warnDays: number,
): ExpiryTone {
  if (daysLeft === null) return "muted";
  if (daysLeft < 0) return "destructive";
  if (daysLeft <= warnDays) return "warning";
  return "success";
}

/** Days left as a colored badge. */
export function ExpiryBadge({
  daysLeft,
  warnDays,
}: {
  daysLeft: number | null;
  warnDays: number;
}) {
  const { t } = useTranslation();
  return (
    <ListBadge tone={expiryTone(daysLeft, warnDays)}>
      {daysLeft === null
        ? t("expiry.unknown")
        : daysLeft < 0
          ? t("expiry.expired")
          : t("expiry.days", { count: daysLeft })}
    </ListBadge>
  );
}

/** An ISO time as a plain date. */
export function formatDate(iso: string | null, language: string): string {
  if (!iso) return "";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return new Intl.DateTimeFormat(language || undefined, {
    dateStyle: "medium",
  }).format(at);
}
