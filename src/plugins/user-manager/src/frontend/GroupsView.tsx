import { useState } from "react";
import { UsersRound } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Input,
  ListBadge,
  ListRow,
  PanelList,
  PanelSearch,
  Segmented,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { UsersList } from "../shared/types";
import { createGroup, errorMessage } from "./api";

type Filter = "people" | "system" | "all";
const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

export function GroupsView({
  hostId,
  list,
  creating,
  onCreating,
  onOpen,
  reload,
}: {
  hostId: number;
  list: UsersList;
  creating: boolean;
  onCreating: (open: boolean) => void;
  onOpen: (name: string) => void;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("people");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

  const needle = search.trim().toLowerCase();
  const visible = list.groups
    .filter(
      (group) =>
        (filter === "all" ||
          (filter === "system" ? group.system : !group.system)) &&
        (!needle ||
          group.name.toLowerCase().includes(needle) ||
          group.members.some((m) => m.includes(needle))),
    )
    .sort((a, b) => a.gid - b.gid);
  const people = list.groups.filter((group) => !group.system).length;

  const create = async () => {
    setSaving(true);
    try {
      await createGroup(hostId, name);
      toast.success(t("groups.created", { name }));
      setName("");
      onCreating(false);
      await reload();
    } catch (e) {
      toast.error(errorMessage(e, t("groups.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {creating && (
        <ToolbarBand>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase())}
            placeholder={t("groups.namePlaceholder")}
            aria-label={t("groups.name")}
            className="h-8 flex-1 font-mono text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && NAME_RE.test(name)) void create();
              if (e.key === "Escape") onCreating(false);
            }}
          />
          <Button
            size="sm"
            disabled={!NAME_RE.test(name) || saving}
            onClick={() => void create()}
          >
            {t("groups.create")}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onCreating(false)}>
            {t("common.cancel")}
          </Button>
        </ToolbarBand>
      )}
      <ToolbarBand>
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("groups.search")}
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
              count: list.groups.length - people,
            },
            { value: "all", label: t("users.all"), count: list.groups.length },
          ]}
        />
      </ToolbarBand>
      {visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("groups.empty")}
        </p>
      ) : (
        <PanelList>
          {visible.map((group, index) => {
            const all = [...new Set([...group.primaryOf, ...group.members])];
            return (
              <ListRow
                key={group.name}
                stripe={index}
                icon={<UsersRound className="size-4" />}
                tone={
                  group.name === "sudo" || group.name === "wheel"
                    ? "warning"
                    : "brand"
                }
                title={group.name}
                badges={
                  <>
                    {(group.name === "sudo" || group.name === "wheel") && (
                      <ListBadge tone="warning">{t("users.sudo")}</ListBadge>
                    )}
                    {group.system && <ListBadge>{t("users.system")}</ListBadge>}
                  </>
                }
                meta={[
                  `gid ${group.gid}`,
                  all.length ? all.join(", ") : t("groups.noMembers"),
                ].join(" | ")}
                onClick={() => onOpen(group.name)}
              />
            );
          })}
        </PanelList>
      )}
    </div>
  );
}
