import { useState } from "react";
import { UserPlus } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Field,
  FormFooter,
  PanelShell,
  SecretField,
  SelectField,
  SwitchRow,
  TagInput,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { GroupView, UsersStatus } from "../shared/types";
import { createUser, errorMessage } from "./api";

const NAME_RE = /^[a-z_][a-z0-9_-]{0,31}$/;

function defaultShell(shells: string[]): string {
  return (
    ["/bin/bash", "/usr/bin/bash", "/bin/sh"].find((s) => shells.includes(s)) ??
    shells[0] ??
    ""
  );
}

export function UserCreate({
  hostId,
  status,
  groups,
  onClose,
  onCreated,
}: {
  hostId: number;
  status: UsersStatus;
  groups: GroupView[];
  onClose: () => void;
  onCreated: (name: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [comment, setComment] = useState("");
  const [shell, setShell] = useState(defaultShell(status.shells));
  const [home, setHome] = useState("");
  const [createHome, setCreateHome] = useState(true);
  const [memberOf, setMemberOf] = useState<string[]>([]);
  const [groupInput, setGroupInput] = useState("");
  const [sudo, setSudo] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validName = NAME_RE.test(name);
  const known = new Set(groups.map((g) => g.name));
  const unknown = memberOf.filter((g) => !known.has(g));
  const mismatch = password !== again;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await createUser(hostId, {
        name,
        comment: comment.trim(),
        shell,
        home: home.trim() || undefined,
        createHome,
        groups: memberOf,
        sudo,
        password: password || undefined,
      });
      toast.success(t("create.done", { name }));
      onCreated(name);
    } catch (e) {
      setError(errorMessage(e, t("create.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      icon={<UserPlus className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={t("create.title")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          saveLabel={t("create.save")}
          cancelLabel={t("common.cancel")}
          disabled={!validName || mismatch || unknown.length > 0}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <TextField
          label={t("create.name")}
          hint={t("create.nameHint")}
          value={name}
          onChange={(value) => setName(value.toLowerCase())}
          error={name && !validName ? t("create.nameInvalid") : undefined}
          placeholder="alice"
          mono
        />
        <TextField
          label={t("detail.fullName")}
          value={comment}
          onChange={setComment}
          placeholder="Alice Smith"
        />
        {status.shells.length > 0 && (
          <SelectField
            label={t("detail.shell")}
            value={shell}
            onChange={setShell}
            options={status.shells.map((value) => ({ value, label: value }))}
          />
        )}
        <TextField
          label={t("create.home")}
          hint={t("create.homeHint", { name: name || "alice" })}
          value={home}
          onChange={setHome}
          placeholder={`/home/${name || "alice"}`}
          mono
        />
        <SwitchRow
          label={t("create.createHome")}
          checked={createHome}
          onChange={setCreateHome}
        />
        <Field
          label={t("detail.groups")}
          error={
            unknown.length > 0
              ? t("detail.unknownGroups", { groups: unknown.join(", ") })
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
        {status.sudoGroup && (
          <SwitchRow
            label={t("detail.sudo")}
            description={t("detail.sudoHint", { group: status.sudoGroup })}
            checked={sudo}
            onChange={setSudo}
          />
        )}
        <SecretField
          label={t("create.password")}
          hint={t("create.passwordHint")}
          value={password}
          onChange={setPassword}
        />
        {password && (
          <SecretField
            label={t("create.again")}
            value={again}
            onChange={setAgain}
            error={again && mismatch ? t("create.mismatch") : undefined}
          />
        )}
      </div>
    </PanelShell>
  );
}
