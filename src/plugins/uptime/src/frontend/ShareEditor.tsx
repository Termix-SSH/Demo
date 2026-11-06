import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  FormFooter,
  InlineView,
  SelectField,
} from "@termix-ssh/plugin-sdk/ui";
import type { ShareGrant } from "../shared/types";
import {
  errorMessage,
  getShareTargets,
  getShares,
  saveShares,
  type ShareTargets,
} from "./api";

const PICK = "pick";

/** Who else can see or edit a monitor. */
export function ShareEditor({
  open,
  monitorId,
  onClose,
}: {
  open: boolean;
  monitorId: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<ShareTargets>({
    users: [],
    roles: [],
  });
  const [shares, setShares] = useState<ShareGrant[]>([]);
  const [choice, setChoice] = useState(PICK);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    void Promise.all([getShares(monitorId), getShareTargets()])
      .then(([list, found]) => {
        setShares(list);
        setTargets(found);
      })
      .catch((e) => setError(errorMessage(e, t("shares.loadFailed"))));
  }, [open, monitorId, t]);

  const nameOf = (share: ShareGrant) => {
    if (share.userId) {
      const user = targets.users.find((item) => item.id === share.userId);
      return user?.username ?? share.userId;
    }
    const role = targets.roles.find((item) => item.id === share.roleId);
    return role?.displayName || role?.name || String(share.roleId);
  };

  const options = [
    { value: PICK, label: t("shares.pick") },
    ...targets.users.map((user) => ({
      value: `user:${user.id}`,
      label: t("shares.user", { name: user.username }),
    })),
    ...targets.roles.map((role) => ({
      value: `role:${role.id}`,
      label: t("shares.role", { name: role.displayName || role.name }),
    })),
  ];

  const add = () => {
    if (choice === PICK) return;
    const [kind, value] = [
      choice.slice(0, choice.indexOf(":")),
      choice.slice(choice.indexOf(":") + 1),
    ];
    const share: ShareGrant =
      kind === "user"
        ? { userId: value, level: "view" }
        : { roleId: Number(value), level: "view" };
    const same = (item: ShareGrant) =>
      (item.userId ?? null) === (share.userId ?? null) &&
      (item.roleId ?? null) === (share.roleId ?? null);
    if (!shares.some(same)) setShares([...shares, share]);
    setChoice(PICK);
  };

  const save = async () => {
    setSaving(true);
    try {
      await saveShares(monitorId, shares);
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("shares.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("detail.share")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          saving={saving}
          status={
            error ? <span className="text-destructive">{error}</span> : null
          }
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-end gap-2">
          <SelectField
            className="min-w-0 flex-1"
            label={t("shares.with")}
            value={choice}
            onChange={setChoice}
            options={options}
          />
          <AddButton label={t("shares.add")} onClick={add} />
        </div>
        {shares.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t("shares.none")}</p>
        ) : null}
        {shares.map((share, index) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{nameOf(share)}</span>
            <SelectField<"view" | "edit">
              className="w-32"
              label=""
              value={share.level}
              onChange={(level) =>
                setShares(
                  shares.map((item, at) =>
                    at === index ? { ...item, level } : item,
                  ),
                )
              }
              options={[
                { value: "view", label: t("shares.view") },
                { value: "edit", label: t("shares.edit") },
              ]}
            />
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("common.delete")}
              onClick={() => setShares(shares.filter((_, at) => at !== index))}
            >
              <X className="size-4" />
            </Button>
          </div>
        ))}
      </div>
    </InlineView>
  );
}
