import { useState } from "react";
import { Trash2, User, UsersRound } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelShell,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { GroupView, UserView, UsersStatus } from "../shared/types";
import { deleteGroup, errorMessage, setMember } from "./api";

/** One group: who is in it, add and remove members, delete it. */
export function GroupDetail({
  hostId,
  status,
  group,
  users,
  onBack,
  reload,
}: {
  hostId: number;
  status: UsersStatus;
  group: GroupView;
  users: UserView[];
  onBack: () => void;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const canEdit = status.canEdit && status.root;
  const isSudo = group.name === status.sudoGroup;

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true);
    try {
      await work();
      toast.success(done);
      await reload();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, t("groups.failed")));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    if (isSudo) {
      const ok = await confirm({
        title: t("detail.sudoTitle", { name: pick }),
        description: t("detail.sudoDesc", { group: group.name }),
        confirmLabel: t("detail.sudoGrant"),
      });
      if (!ok) return;
    }
    if (
      await run(
        () => setMember(hostId, group.name, pick, true),
        t("groups.memberAdded", { name: pick, group: group.name }),
      )
    ) {
      setPick("");
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("groups.deleteTitle", { name: group.name }),
      description: t("groups.deleteDesc"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    if (
      await run(
        () => deleteGroup(hostId, group.name),
        t("groups.deleted", { name: group.name }),
      )
    ) {
      onBack();
    }
  };

  const candidates = users
    .filter((user) => !user.system && !group.members.includes(user.name))
    .map((user) => user.name);

  return (
    <PanelShell
      icon={<UsersRound className="size-4" />}
      leading={<BackButton onClick={onBack} label={t("common.back")} />}
      title={group.name}
      status={`gid ${group.gid}`}
      actions={
        canEdit && group.primaryOf.length === 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            <Trash2 className="size-4" />
            {t("common.delete")}
          </Button>
        ) : undefined
      }
    >
      <div className="flex flex-col">
        {canEdit && (
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Select value={pick} onValueChange={setPick}>
              <SelectTrigger
                size="sm"
                className="w-48"
                aria-label={t("groups.addMember")}
              >
                <SelectValue placeholder={t("groups.pickUser")} />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!pick || busy}
              onClick={() => void add()}
            >
              {t("groups.addMember")}
            </Button>
          </div>
        )}
        {group.primaryOf.length === 0 && group.members.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            {t("groups.noMembers")}
          </p>
        ) : (
          <PanelList>
            {group.primaryOf.map((name, index) => (
              <ListRow
                key={`main-${name}`}
                stripe={index}
                icon={<User className="size-4" />}
                title={name}
                badges={<ListBadge>{t("groups.mainGroup")}</ListBadge>}
                meta={t("groups.mainGroupHint")}
              />
            ))}
            {group.members.map((name, index) => {
              const self = users.find((u) => u.name === name)?.self;
              return (
                <ListRow
                  key={name}
                  stripe={group.primaryOf.length + index}
                  icon={<User className="size-4" />}
                  title={name}
                  actions={
                    canEdit && !(isSudo && (self || name === "root")) ? (
                      <ListRowAction
                        label={t("groups.removeMember")}
                        tone="destructive"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => setMember(hostId, group.name, name, false),
                            t("groups.memberRemoved", {
                              name,
                              group: group.name,
                            }),
                          )
                        }
                      >
                        <Trash2 className="size-4" />
                      </ListRowAction>
                    ) : undefined
                  }
                />
              );
            })}
          </PanelList>
        )}
      </div>
    </PanelShell>
  );
}
