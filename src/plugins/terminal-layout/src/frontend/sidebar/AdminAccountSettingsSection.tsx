import { useEffect, useState } from "react";
import { isAdminHoldTicket } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { UserCog } from "lucide-react";
import { toast } from "sonner";
import { AccordionSection, AdminToggle } from "./AdminSettingsShared";
import { hasUserAdminApi, requireUserAdminApi } from "./user-admin-api";

function SettingRow({
  title,
  description,
  on,
  onToggle,
}: {
  title: string;
  description: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-border last:border-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[10px] text-muted-foreground">{description}</span>
      </div>
      <AdminToggle on={on} onToggle={onToggle} />
    </div>
  );
}

/** Admin host access and the approval queue for new external accounts. */
export function AdminAccountSettingsSection({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const supported = hasUserAdminApi(
    "getAdminHostBypass",
    "updateAdminHostBypass",
    "getExternalSignupApproval",
    "updateExternalSignupApproval",
  );
  const [bypass, setBypass] = useState(true);
  const [approval, setApproval] = useState(false);

  useEffect(() => {
    if (!supported || !open) return;
    const api = requireUserAdminApi();
    api
      .getAdminHostBypass()
      .then((r) => setBypass(r.enabled))
      .catch(() => {});
    api
      .getExternalSignupApproval()
      .then((r) => setApproval(r.enabled))
      .catch(() => {});
  }, [supported, open]);

  if (!supported) return null;

  async function toggleBypass() {
    const next = !bypass;
    setBypass(next);
    try {
      const answer: unknown =
        await requireUserAdminApi().updateAdminHostBypass(next);
      if (isAdminHoldTicket(answer)) {
        setBypass(!next);
        toast.info(t("admin.changeHeld", { minutes: answer.minutes }));
      }
    } catch {
      setBypass(!next);
      toast.error(t("admin.updateSettingFailed"));
    }
  }

  async function toggleApproval() {
    const next = !approval;
    setApproval(next);
    try {
      await requireUserAdminApi().updateExternalSignupApproval(next);
    } catch {
      setApproval(!next);
      toast.error(t("admin.updateSettingFailed"));
    }
  }

  return (
    <AccordionSection
      label={t("admin.sectionAccountSettings")}
      icon={<UserCog className="size-3.5" />}
      open={open}
      onToggle={onToggle}
    >
      <div className="flex flex-col pt-1">
        <SettingRow
          title={t("admin.adminHostBypass")}
          description={t("admin.adminHostBypassDesc")}
          on={bypass}
          onToggle={() => void toggleBypass()}
        />
        <SettingRow
          title={t("admin.signupApproval")}
          description={t("admin.signupApprovalDesc")}
          on={approval}
          onToggle={() => void toggleApproval()}
        />
      </div>
    </AccordionSection>
  );
}
