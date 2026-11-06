import { useState } from "react";
import { User, UserCog } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListRow,
  PanelList,
  PanelSearch,
  Segmented,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { UsersList, UsersStatus } from "../shared/types";
import { UserBadges } from "./badges";

type Filter = "people" | "system" | "all";

export function UsersView({
  list,
  onOpen,
}: {
  list: UsersList;
  status: UsersStatus;
  onOpen: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("people");

  const needle = search.trim().toLowerCase();
  const visible = list.users
    .filter(
      (user) =>
        (filter === "all" ||
          (filter === "system" ? user.system : !user.system)) &&
        (!needle ||
          user.name.toLowerCase().includes(needle) ||
          user.comment.toLowerCase().includes(needle)),
    )
    .sort((a, b) => a.uid - b.uid);
  const people = list.users.filter((user) => !user.system).length;

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("users.search")}
          className="min-w-40 flex-1"
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "people", label: t("users.people"), count: people },
            {
              value: "system",
              label: t("users.systemFilter"),
              count: list.users.length - people,
            },
            { value: "all", label: t("users.all"), count: list.users.length },
          ]}
        />
      </ToolbarBand>
      {visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("users.empty")}
        </p>
      ) : (
        <PanelList>
          {visible.map((user, index) => (
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
                  : user.password === "empty"
                    ? "warning"
                    : user.canLogin
                      ? "brand"
                      : "muted"
              }
              dimmed={!user.canLogin}
              title={user.name}
              badges={<UserBadges user={user} />}
              meta={[
                `uid ${user.uid}`,
                user.comment,
                user.shell,
                user.groups.length ? user.groups.join(", ") : "",
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => onOpen(user.name)}
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
