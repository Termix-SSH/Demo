import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge } from "@termix-ssh/plugin-sdk/ui";
import type { UserView } from "../shared/types";

/** The small state badges a user row shows. */
export function UserBadges({ user }: { user: UserView }) {
  const { t } = useTranslation();
  return (
    <>
      {user.self && <ListBadge tone="brand">{t("users.you")}</ListBadge>}
      {user.sudo && <ListBadge tone="warning">{t("users.sudo")}</ListBadge>}
      {(user.expired || user.password === "locked") && (
        <ListBadge tone="destructive">{t("users.locked")}</ListBadge>
      )}
      {user.password === "empty" && (
        <ListBadge tone="destructive">{t("users.emptyPassword")}</ListBadge>
      )}
      {user.system && <ListBadge>{t("users.system")}</ListBadge>}
    </>
  );
}
