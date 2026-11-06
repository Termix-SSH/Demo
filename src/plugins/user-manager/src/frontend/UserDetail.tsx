import { useCallback, useEffect, useState } from "react";
import {
  Info,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  User,
  UserCog,
} from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Field,
  Button,
  InfoGrid,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelShell,
  SecretField,
  SectionCard,
  SelectField,
  SwitchRow,
  TagInput,
  TextAreaField,
  TextField,
  TileStack,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  GroupView,
  UserDetail as Detail,
  UserView,
  UsersStatus,
} from "../shared/types";
import {
  addKey,
  deleteUser,
  errorMessage,
  expirePassword,
  getUserDetail,
  removeKey,
  setLocked,
  setPassword,
  setSudo,
  updateUser,
} from "./api";
import { UserBadges } from "./badges";

/** One account: its details, password, access, SSH keys and delete. */
export function UserDetail({
  hostId,
  status,
  user,
  groups,
  onBack,
  reload,
}: {
  hostId: number;
  status: UsersStatus;
  user: UserView;
  groups: GroupView[];
  onBack: () => void;
  reload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailError, setDetailError] = useState("");
  const [comment, setComment] = useState(user.comment);
  const [shell, setShell] = useState(user.shell);
  const [memberOf, setMemberOf] = useState(user.groups);
  const [groupInput, setGroupInput] = useState("");
  const [password, setPasswordValue] = useState("");
  const [newKey, setNewKey] = useState("");
  const [removeHome, setRemoveHome] = useState(false);
  const [busy, setBusy] = useState("");

  const loadDetail = useCallback(async () => {
    try {
      setDetail(await getUserDetail(hostId, user.name));
      setDetailError("");
    } catch (e) {
      setDetailError(errorMessage(e, t("detail.loadFailed")));
    }
  }, [hostId, user.name, t]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const canEdit = status.canEdit && status.root;
  const protectedUser = user.self || user.uid === 0;
  const locked = user.expired || user.password === "locked";

  const run = async (
    key: string,
    work: () => Promise<unknown>,
    done: string,
    after: () => Promise<void> = reload,
  ) => {
    setBusy(key);
    try {
      await work();
      toast.success(done);
      await after();
      return true;
    } catch (e) {
      toast.error(errorMessage(e, t("detail.failed")));
      return false;
    } finally {
      setBusy("");
    }
  };

  const changed =
    comment !== user.comment ||
    shell !== user.shell ||
    memberOf.join(",") !== user.groups.join(",");

  const shells = [...new Set([...status.shells, user.shell])].filter(Boolean);
  const knownGroups = new Set(groups.map((g) => g.name));
  const unknownGroups = memberOf.filter((g) => !knownGroups.has(g));

  const save = () =>
    run(
      "save",
      () =>
        updateUser(hostId, user.name, {
          comment,
          shell: shell !== user.shell ? shell : undefined,
          groups: memberOf,
        }),
      t("detail.saved"),
    );

  const lock = async () => {
    if (!locked) {
      const ok = await confirm({
        title: t("detail.lockTitle", { name: user.name }),
        description: t("detail.lockDesc"),
        confirmLabel: t("detail.lock"),
        destructive: true,
      });
      if (!ok) return;
    }
    await run(
      "lock",
      () => setLocked(hostId, user.name, !locked),
      locked ? t("detail.unlocked") : t("detail.locked"),
    );
  };

  const sudo = async (on: boolean) => {
    if (on) {
      const ok = await confirm({
        title: t("detail.sudoTitle", { name: user.name }),
        description: t("detail.sudoDesc", { group: status.sudoGroup }),
        confirmLabel: t("detail.sudoGrant"),
      });
      if (!ok) return;
    }
    await run(
      "sudo",
      () => setSudo(hostId, user.name, on),
      on ? t("detail.sudoOn") : t("detail.sudoOff"),
    );
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("detail.deleteTitle", { name: user.name }),
      description: removeHome
        ? t("detail.deleteDescHome", { home: user.home })
        : t("detail.deleteDesc"),
      confirmLabel: t("detail.delete"),
      destructive: true,
    });
    if (!ok) return;
    const done = await run(
      "delete",
      () => deleteUser(hostId, user.name, removeHome),
      t("detail.deleted", { name: user.name }),
      async () => undefined,
    );
    if (done) onBack();
  };

  const passwordLabel = t(`password.${user.password}`);

  return (
    <PanelShell
      icon={
        user.sudo ? <UserCog className="size-4" /> : <User className="size-4" />
      }
      leading={<BackButton onClick={onBack} label={t("common.back")} />}
      title={user.name}
      status={<UserBadges user={user} />}
    >
      <TileStack>
        <SectionCard title={t("detail.info")} icon={<Info />}>
          <InfoGrid
            className="py-2"
            items={[
              { label: t("detail.fullName"), value: user.comment },
              {
                label: t("detail.uid"),
                value: `${user.uid} / ${user.gid}`,
                mono: true,
              },
              { label: t("detail.mainGroup"), value: user.group, mono: true },
              { label: t("detail.home"), value: user.home, mono: true },
              { label: t("detail.shell"), value: user.shell, mono: true },
              {
                label: t("detail.groups"),
                value: user.groups.join(", ") || t("detail.none"),
              },
              { label: t("detail.password"), value: passwordLabel },
              {
                label: t("detail.passwordChanged"),
                value: user.passwordChanged,
              },
              {
                label: t("detail.lastLogin"),
                value: detail
                  ? detail.lastLogin ||
                    (detail.loginKnown
                      ? t("detail.never")
                      : t("detail.unknown"))
                  : detailError || t("common.loading"),
                mono: !!detail?.lastLogin,
              },
            ]}
          />
        </SectionCard>

        {canEdit && (
          <SectionCard title={t("detail.account")} icon={<User />}>
            <div className="flex flex-col gap-3 py-2">
              <TextField
                label={t("detail.fullName")}
                value={comment}
                onChange={setComment}
              />
              {shells.length > 0 && (
                <SelectField
                  label={t("detail.shell")}
                  value={shell}
                  onChange={setShell}
                  options={shells.map((value) => ({ value, label: value }))}
                />
              )}
              <Field
                label={t("detail.groups")}
                error={
                  unknownGroups.length > 0
                    ? t("detail.unknownGroups", {
                        groups: unknownGroups.join(", "),
                      })
                    : undefined
                }
              >
                <TagInput
                  tags={memberOf}
                  input={groupInput}
                  placeholder={t("detail.groupsPlaceholder")}
                  onTagsChange={setMemberOf}
                  onInputChange={setGroupInput}
                />
              </Field>
              <div>
                <Button
                  size="sm"
                  disabled={!changed || busy !== "" || unknownGroups.length > 0}
                  onClick={() => void save()}
                >
                  {t("common.save")}
                </Button>
              </div>
            </div>
          </SectionCard>
        )}

        {canEdit && (
          <SectionCard title={t("detail.passwordSection")} icon={<KeyRound />}>
            <div className="flex flex-col gap-3 py-2">
              <SecretField
                label={t("detail.newPassword")}
                value={password}
                onChange={setPasswordValue}
                hint={t("detail.newPasswordHint")}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={!password || busy !== ""}
                  onClick={async () => {
                    if (
                      await run(
                        "password",
                        () => setPassword(hostId, user.name, password),
                        t("detail.passwordSet"),
                      )
                    ) {
                      setPasswordValue("");
                    }
                  }}
                >
                  {t("detail.setPassword")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== "" || user.password === "none"}
                  onClick={() =>
                    void run(
                      "expire",
                      () => expirePassword(hostId, user.name),
                      t("detail.expired"),
                    )
                  }
                >
                  {t("detail.expirePassword")}
                </Button>
              </div>
            </div>
          </SectionCard>
        )}

        {canEdit && (
          <SectionCard title={t("detail.access")} icon={<ShieldCheck />}>
            <div className="flex flex-col gap-2 py-2">
              {status.sudoGroup && (
                <SwitchRow
                  label={t("detail.sudo")}
                  description={
                    protectedUser && user.sudo
                      ? t("detail.sudoProtected")
                      : t("detail.sudoHint", { group: status.sudoGroup })
                  }
                  checked={user.sudo}
                  disabled={
                    busy !== "" || user.uid === 0 || (user.self && user.sudo)
                  }
                  onChange={(on) => void sudo(on)}
                />
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== "" || (protectedUser && !locked)}
                  onClick={() => void lock()}
                >
                  <Lock className="size-4" />
                  {locked ? t("detail.unlock") : t("detail.lock")}
                </Button>
                <span className="text-xs text-muted-foreground">
                  {protectedUser ? t("detail.protected") : t("detail.lockHint")}
                </span>
              </div>
            </div>
          </SectionCard>
        )}

        <SectionCard
          title={t("keys.title")}
          icon={<KeyRound />}
          action={
            detail ? (
              <span className="text-[10px] text-muted-foreground">
                {detail.keys.length}
              </span>
            ) : undefined
          }
        >
          {!detail ? (
            detailError ? (
              <p className="py-2 text-xs text-destructive">{detailError}</p>
            ) : (
              <LoadingState />
            )
          ) : (
            <div className="-mx-3 flex flex-col">
              {detail.keysError && (
                <p className="px-3 py-2 text-xs text-muted-foreground">
                  {t("keys.denied")}
                </p>
              )}
              {detail.keys.length === 0 && !detail.keysError ? (
                <p className="px-3 py-2 text-xs text-muted-foreground/60">
                  {t("keys.empty")}
                </p>
              ) : (
                <PanelList>
                  {detail.keys.map((key, index) => (
                    <ListRow
                      key={`${key.line}-${key.fingerprint}`}
                      stripe={index}
                      icon={<KeyRound className="size-4" />}
                      title={key.comment || key.type}
                      badges={
                        <>
                          <ListBadge>{key.type}</ListBadge>
                          {key.options && (
                            <ListBadge tone="warning">
                              {t("keys.options")}
                            </ListBadge>
                          )}
                        </>
                      }
                      meta={
                        <span className="font-mono">{key.fingerprint}</span>
                      }
                      actions={
                        canEdit ? (
                          <ListRowAction
                            label={t("keys.remove")}
                            tone="destructive"
                            disabled={busy !== ""}
                            onClick={async () => {
                              const ok = await confirm({
                                title: t("keys.removeTitle"),
                                description: key.comment || key.fingerprint,
                                confirmLabel: t("keys.remove"),
                                destructive: true,
                              });
                              if (!ok) return;
                              setBusy("key");
                              try {
                                setDetail(
                                  await removeKey(
                                    hostId,
                                    user.name,
                                    key.line,
                                    key.fingerprint,
                                  ),
                                );
                                toast.success(t("keys.removed"));
                              } catch (e) {
                                toast.error(
                                  errorMessage(e, t("detail.failed")),
                                );
                              } finally {
                                setBusy("");
                              }
                            }}
                          >
                            <Trash2 className="size-4" />
                          </ListRowAction>
                        ) : undefined
                      }
                    />
                  ))}
                </PanelList>
              )}
              {canEdit && (
                <div className="flex flex-col gap-2 border-t border-border px-3 py-2">
                  <TextAreaField
                    label={t("keys.add")}
                    hint={t("keys.addHint")}
                    value={newKey}
                    onChange={setNewKey}
                    placeholder="ssh-ed25519 AAAA... user@laptop"
                    rows={2}
                    mono
                  />
                  <div>
                    <Button
                      size="sm"
                      disabled={!newKey.trim() || busy !== ""}
                      onClick={async () => {
                        setBusy("key");
                        try {
                          setDetail(await addKey(hostId, user.name, newKey));
                          setNewKey("");
                          toast.success(t("keys.added"));
                        } catch (e) {
                          toast.error(errorMessage(e, t("detail.failed")));
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      {t("keys.addButton")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </SectionCard>

        {canEdit && !protectedUser && (
          <SectionCard title={t("detail.danger")} icon={<Trash2 />}>
            <div className="flex flex-col gap-2 py-2">
              <SwitchRow
                label={t("detail.removeHome")}
                description={t("detail.removeHomeHint", { home: user.home })}
                checked={removeHome}
                onChange={setRemoveHome}
              />
              <div>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  disabled={busy !== ""}
                  onClick={() => void remove()}
                >
                  <Trash2 className="size-4" />
                  {t("detail.delete")}
                </Button>
              </div>
            </div>
          </SectionCard>
        )}
      </TileStack>
    </PanelShell>
  );
}
