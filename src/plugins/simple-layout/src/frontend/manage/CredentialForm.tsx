import { useState } from "react";
import { toast } from "sonner";
import {
  Field,
  FormFooter,
  PasswordInput,
  SelectField,
  Textarea,
  TextField,
  createCredential,
  updateCredential,
  type Credential,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

interface Props {
  credential: Credential | null;
  onBack: () => void;
  onSaved: () => void;
  onDelete?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}

/** A saved login: a name, a user and a password or a private key. */
export function CredentialForm({
  credential,
  onBack,
  onSaved,
  onDelete,
  onDirtyChange,
}: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    name: credential?.name ?? "",
    username: credential?.username ?? "",
    type: (credential?.type ?? "password") as "password" | "key",
    password: "",
    key: "",
    passphrase: "",
  });
  const [saving, setSaving] = useState(false);
  const [tried, setTried] = useState(false);

  const set = <K extends keyof typeof form>(
    key: K,
    value: (typeof form)[K],
  ) => {
    onDirtyChange?.(true);
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const needsSecret =
    !credential &&
    (form.type === "password" ? !form.password : !form.key.trim());
  const nameMissing = !form.name.trim();
  const userMissing = !form.username.trim();

  const save = async () => {
    setTried(true);
    if (nameMissing || userMissing || needsSecret) return;
    setSaving(true);
    try {
      const isKey = form.type === "key";
      // On an edit, a blank secret means keep the saved one.
      const data = {
        name: form.name.trim(),
        username: form.username.trim(),
        authType: form.type,
        password: !isKey ? form.password || undefined : null,
        key: isKey ? form.key || undefined : null,
        keyPassword: isKey ? form.passphrase || undefined : null,
        publicKey: isKey ? (credential?.publicKey ?? "") : null,
      };
      if (credential) await updateCredential(Number(credential.id), data);
      else await createCredential(data);
      toast.success(
        credential ? t("credentialForm.updated") : t("credentialForm.created"),
      );
      onDirtyChange?.(false);
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      onSaved();
    } catch {
      toast.error(t("credentialForm.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const keepHint = credential ? t("credentialForm.keepHint") : undefined;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6 max-w-2xl w-full mx-auto">
      <TextField
        label={t("credentialForm.name")}
        value={form.name}
        onChange={(value) => set("name", value)}
        error={tried && nameMissing ? t("credentialForm.nameRequired") : ""}
      />
      <TextField
        label={t("credentialForm.username")}
        value={form.username}
        onChange={(value) => set("username", value)}
        error={tried && userMissing ? t("credentialForm.usernameRequired") : ""}
        mono
      />
      <SelectField
        label={t("credentialForm.type")}
        value={form.type}
        onChange={(value) => set("type", value)}
        options={[
          { value: "password", label: t("credentialForm.typePassword") },
          { value: "key", label: t("credentialForm.typeKey") },
        ]}
      />

      {form.type === "password" ? (
        <Field
          label={t("credentialForm.password")}
          hint={keepHint}
          error={tried && needsSecret ? t("credentialForm.secretRequired") : ""}
        >
          <PasswordInput
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
          />
        </Field>
      ) : (
        <>
          <Field
            label={t("credentialForm.privateKey")}
            hint={keepHint}
            error={
              tried && needsSecret ? t("credentialForm.secretRequired") : ""
            }
          >
            <Textarea
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              className="min-h-28 font-mono text-xs"
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            />
          </Field>
          <Field label={t("credentialForm.passphrase")}>
            <PasswordInput
              value={form.passphrase}
              onChange={(e) => set("passphrase", e.target.value)}
            />
          </Field>
        </>
      )}

      <FormFooter
        onCancel={onBack}
        onSave={() => void save()}
        saving={saving}
        onDelete={onDelete}
        deleteLabel={t("credentialForm.delete")}
        saveLabel={
          credential ? t("credentialForm.save") : t("credentialForm.add")
        }
        cancelLabel={t("credentialForm.cancel")}
      />
    </div>
  );
}
