import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  InlineView,
  SecretField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { Account, AccountInput, ProviderInfo } from "../shared/types";

export function AccountForm({
  account,
  providers,
  onBack,
  onSave,
}: {
  account: Account | null;
  providers: ProviderInfo[];
  onBack: () => void;
  onSave: (input: AccountInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [providerId, setProviderId] = useState<string>(
    account?.provider ?? providers[0]?.id ?? "cloudflare",
  );
  const provider = providers.find((item) => item.id === providerId);
  const [name, setName] = useState(account?.name ?? "");
  const [autoBackup, setAutoBackup] = useState(account?.autoBackup ?? true);
  const [checkHealth, setCheckHealth] = useState(account?.checkHealth ?? true);
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const missing = (provider?.fields ?? []).some(
    (field) => field.required && !account && !keys[field.key]?.trim(),
  );
  const canSave = !!name.trim() && !!provider && !missing && !saving;

  async function save() {
    if (!canSave || !provider) return;
    setSaving(true);
    try {
      await onSave({
        ...(account ? {} : { provider: provider.id }),
        name: name.trim(),
        autoBackup,
        checkHealth,
        credentials: keys,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <InlineView
      stacked
      open
      onOpenChange={(open) => !open && onBack()}
      icon={<Globe className="size-4" />}
      title={t(account ? "account.editTitle" : "account.addTitle")}
      status={account?.name}
      footer={
        <FormFooter
          saving={saving}
          disabled={!canSave}
          onCancel={onBack}
          onSave={() => void save()}
          saveLabel={t(account ? "account.save" : "account.add")}
        />
      }
    >
      <SectionCard title={t("account.login")} icon={<Globe />}>
        <div className="flex flex-col gap-3 py-2">
          <SelectField
            label={t("account.provider")}
            value={providerId}
            disabled={!!account}
            onChange={(value) => {
              setProviderId(value);
              setKeys({});
            }}
            options={providers.map((item) => ({
              value: item.id,
              label: t(`providers.${item.id}`),
            }))}
          />
          <TextField
            label={t("account.name")}
            value={name}
            onChange={setName}
            placeholder={t("account.namePlaceholder")}
          />
          {provider?.features.domains && (
            <p className="text-xs text-muted-foreground">
              {t("account.registrar")}
            </p>
          )}
          {(provider?.fields ?? []).map((field) =>
            field.type === "secret" ? (
              <SecretField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={account ? t("account.keep") : undefined}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
              />
            ) : field.type === "select" ? (
              <SelectField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? field.options?.[0] ?? ""}
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
                options={(field.options ?? []).map((option) => ({
                  value: option,
                  label: t(`fields.${field.key}_${option}`),
                }))}
              />
            ) : (
              <TextField
                key={field.key}
                label={t(`fields.${field.key}`)}
                value={keys[field.key] ?? ""}
                placeholder={
                  field.placeholder
                    ? field.placeholder
                    : account
                      ? t("account.keep")
                      : undefined
                }
                onChange={(value) =>
                  setKeys((current) => ({ ...current, [field.key]: value }))
                }
                mono
              />
            ),
          )}
        </div>
      </SectionCard>
      <SectionCard title={t("account.options")} icon={<Globe />}>
        <div className="flex flex-col gap-3 py-2">
          <SwitchRow
            label={t("account.autoBackup")}
            description={t("account.autoBackupHint")}
            checked={autoBackup}
            onChange={setAutoBackup}
          />
          <SwitchRow
            label={t("account.checkHealth")}
            description={t("account.checkHealthHint")}
            checked={checkHealth}
            onChange={setCheckHealth}
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
