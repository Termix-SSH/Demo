import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Select2,
  useConfirm,
  roleLabel,
  type Role,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Copy, Link2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AccordionSection, AdminToggle } from "./AdminSettingsShared";
import {
  hasUserAdminApi,
  requireUserAdminApi,
  type UserInvite,
} from "./user-admin-api";

type ApiErrorLike = { response?: { data?: { error?: string } } };

function apiErrorMessage(error: unknown, fallback: string) {
  return (error as ApiErrorLike).response?.data?.error || fallback;
}

const EXPIRY_HOURS = [24, 72, 168, 720];

export function AdminInvitesSection({
  open,
  onToggle,
  roles,
  canManage,
  isAdmin,
}: {
  open: boolean;
  onToggle: () => void;
  roles: Role[];
  canManage: boolean;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const supported = hasUserAdminApi(
    "listUserInvites",
    "createUserInvite",
    "revokeUserInvite",
    "inviteLink",
  );
  const [invites, setInvites] = useState<UserInvite[]>([]);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [roleId, setRoleId] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [maxUses, setMaxUses] = useState("1");
  const [hours, setHours] = useState("72");
  const [createdLink, setCreatedLink] = useState<string | null>(null);

  const customRoles = roles.filter((role) => !role.isSystem);

  function load() {
    if (!supported) return;
    requireUserAdminApi()
      .listUserInvites()
      .then(setInvites)
      .catch(() => {});
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!supported) return null;

  async function create() {
    setSaving(true);
    try {
      const api = requireUserAdminApi();
      const created = await api.createUserInvite({
        note: note.trim() || undefined,
        roleIds: roleId ? [Number(roleId)] : [],
        makeAdmin,
        maxUses: Math.max(1, Number(maxUses) || 1),
        expiresInHours: Number(hours),
      });
      setCreatedLink(api.inviteLink(created.token));
      setCreating(false);
      setNote("");
      setRoleId("");
      setMakeAdmin(false);
      setMaxUses("1");
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("admin.inviteCreateFailed")));
    } finally {
      setSaving(false);
    }
  }

  async function revoke(invite: UserInvite) {
    const ok = await confirm({
      title: t("admin.inviteRevokeConfirm"),
      confirmLabel: t("admin.inviteRevoke"),
    });
    if (!ok) return;
    try {
      await requireUserAdminApi().revokeUserInvite(invite.id);
      load();
    } catch (error) {
      toast.error(apiErrorMessage(error, t("admin.inviteRevokeFailed")));
    }
  }

  function copy(link: string) {
    void navigator.clipboard
      ?.writeText(link)
      .then(() => toast.success(t("admin.inviteCopied")))
      .catch(() => {});
  }

  const roleName = (id: number) => {
    const role = roles.find((r) => r.id === id);
    return role ? roleLabel(t, role.displayName) : String(id);
  };

  return (
    <AccordionSection
      label={t("admin.sectionInvites")}
      icon={<Link2 className="size-3.5" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-col pt-2">
        <div className="flex items-center justify-between py-2 border-b border-border">
          <span className="text-[10px] text-muted-foreground">
            {t("admin.invitesDescription")}
          </span>
          {canManage && !creating && (
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-3" />
              {t("admin.inviteCreate")}
            </Button>
          )}
        </div>

        {createdLink && (
          <div className="flex flex-col gap-1.5 py-2.5 border-b border-border">
            <span className="text-[10px] text-muted-foreground">
              {t("admin.inviteCreatedNotice")}
            </span>
            <div className="flex items-center gap-1">
              <Input readOnly value={createdLink} className="h-7 text-xs" />
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                title={t("admin.inviteCopy")}
                aria-label={t("admin.inviteCopy")}
                onClick={() => copy(createdLink)}
              >
                <Copy className="size-3" />
              </Button>
            </div>
          </div>
        )}

        {creating && (
          <div className="flex flex-col gap-2 py-2.5 border-b border-border">
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("admin.inviteNotePlaceholder")}
              className="h-7 text-xs"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select2
                value={roleId}
                onChange={(e) => setRoleId(e.target.value)}
                aria-label={t("admin.inviteRole")}
                className="h-7 border border-border bg-(--field) px-2 text-xs text-foreground outline-none"
              >
                <option value="">{t("admin.inviteNoRole")}</option>
                {customRoles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {roleLabel(t, role.displayName)}
                  </option>
                ))}
              </Select2>
              <Select2
                value={hours}
                onChange={(e) => setHours(e.target.value)}
                aria-label={t("admin.inviteExpires")}
                className="h-7 border border-border bg-(--field) px-2 text-xs text-foreground outline-none"
              >
                {EXPIRY_HOURS.map((h) => (
                  <option key={h} value={h}>
                    {t("admin.inviteExpiresIn", { count: Math.round(h / 24) })}
                  </option>
                ))}
              </Select2>
              <label className="flex items-center gap-1.5 text-xs">
                {t("admin.inviteUses")}
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  className="h-7 w-16 text-xs"
                />
              </label>
              {isAdmin && (
                <label className="flex items-center gap-1.5 text-xs">
                  <AdminToggle
                    on={makeAdmin}
                    onToggle={() => setMakeAdmin((v) => !v)}
                  />
                  {t("admin.inviteMakeAdmin")}
                </label>
              )}
            </div>
            <div className="flex justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setCreating(false)}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={saving}
                onClick={() => void create()}
              >
                {t("admin.inviteCreate")}
              </Button>
            </div>
          </div>
        )}

        {invites.map((invite) => (
          <div
            key={invite.id}
            className="flex items-center justify-between gap-2 py-2.5 border-b border-border last:border-0"
          >
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate text-xs font-semibold">
                {invite.note || t("admin.inviteUntitled")}
              </span>
              <span className="text-[10px] text-muted-foreground">
                {[
                  t(`admin.inviteState_${invite.state}`),
                  t("admin.inviteUsesOf", {
                    uses: invite.uses,
                    max: invite.maxUses,
                  }),
                  invite.makeAdmin ? t("admin.adminBadge") : null,
                  ...invite.roleIds.map(roleName),
                  invite.createdBy,
                ]
                  .filter(Boolean)
                  .join(" | ")}
              </span>
            </div>
            {canManage && invite.state === "active" && (
              <Button
                variant="ghost"
                size="icon"
                className="size-6 text-muted-foreground hover:text-destructive"
                title={t("admin.inviteRevoke")}
                aria-label={t("admin.inviteRevoke")}
                onClick={() => void revoke(invite)}
              >
                <Trash2 className="size-3" />
              </Button>
            )}
          </div>
        ))}
        {invites.length === 0 && !creating && (
          <div className="py-4 text-center text-[10px] text-muted-foreground">
            {t("admin.invitesEmpty")}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}
