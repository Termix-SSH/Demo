import { useEffect, useState } from "react";
import { Button, Input, getUserInfo } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import { hasUserAdminApi, requireUserAdminApi } from "./user-admin-api";

type ApiErrorLike = { response?: { data?: { error?: string } } };

/** The signed in user's display name and email. */
export function ProfileDetailsForm() {
  const { t } = useTranslation();
  const supported = hasUserAdminApi("updateMyProfile");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!supported) return;
    getUserInfo()
      .then((info) => {
        const extra = info as {
          display_name?: string | null;
          email?: string | null;
        };
        setDisplayName(extra.display_name ?? "");
        setEmail(extra.email ?? "");
      })
      .catch(() => {});
  }, [supported]);

  if (!supported) return null;

  async function save() {
    setSaving(true);
    try {
      await requireUserAdminApi().updateMyProfile({
        displayName: displayName.trim() || null,
        email: email.trim() || null,
      });
      toast.success(t("newUi.sidebar.userProfile.profileSaved"));
    } catch (error) {
      toast.error(
        (error as ApiErrorLike).response?.data?.error ||
          t("newUi.sidebar.userProfile.profileSaveFailed"),
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 py-2 border-b border-border">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            {t("newUi.sidebar.userProfile.displayNameLabel")}
          </span>
          <Input
            className="h-8 text-xs"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">
            {t("newUi.sidebar.userProfile.emailLabel")}
          </span>
          <Input
            className="h-8 text-xs"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 self-end text-xs"
        disabled={saving}
        onClick={() => void save()}
      >
        {t("common.save")}
      </Button>
    </div>
  );
}
