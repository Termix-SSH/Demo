import { useCallback, useEffect, useState } from "react";
import { User, UserCog, Users } from "lucide-react";
import {
  useHosts,
  useTabs,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  ListRow,
  ManagerCardShell,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { UserView } from "../shared/types";
import { errorMessage, getUsers } from "./api";
import { UserBadges } from "./badges";
import { usersEnabled } from "./enabled";

/** The Users card Host Metrics shows in its manager cards. */
export function UsersCard({ hostId }: { hostId: number | null }) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const { hosts } = useHosts();
  const host = hosts.find((h) => Number(h.id) === hostId);
  const on = !!host && usersEnabled(host);
  const [users, setUsers] = useState<UserView[] | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!on || hostId == null) return;
    setLoading(true);
    try {
      const list = await getUsers(hostId);
      setUsers(list.users.filter((user) => !user.system));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("users.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [on, hostId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!host || hostId == null) return null;

  return (
    <ManagerCardShell
      title={t("manager.title")}
      icon={<Users className="size-3.5" />}
      loading={loading}
      error={failed ? { message: failed } : null}
      onRefresh={() => void load()}
      empty={!on || users?.length === 0}
      emptyMessage={on ? t("users.empty") : t("manager.disabled")}
    >
      <PanelList>
        {(users ?? []).map((user, index) => (
          <ListRow
            key={user.name}
            stripe={index}
            icon={
              user.sudo ? (
                <UserCog className="size-4" />
              ) : (
                <User className="size-4" />
              )
            }
            tone={
              user.expired || user.password === "locked"
                ? "destructive"
                : "brand"
            }
            title={user.name}
            badges={<UserBadges user={user} />}
            meta={[`uid ${user.uid}`, user.shell].join(" | ")}
            onClick={() => tabs.openTab(host as never, "user-manager")}
          />
        ))}
      </PanelList>
    </ManagerCardShell>
  );
}
