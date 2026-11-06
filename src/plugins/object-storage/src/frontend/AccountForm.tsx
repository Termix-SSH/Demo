import { useState } from "react";
import { Package } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  InlineView,
  SecretField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { Account, AccountInput, ProviderInfo } from "../shared/types";

function fill(template: string, region: string) {
  return template.replace("{region}", region);
}

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
  const first = providers[0];
  const [providerId, setProviderId] = useState(
    account?.provider ?? first?.id ?? "aws",
  );
  const preset = providers.find((item) => item.id === providerId);
  const [name, setName] = useState(account?.name ?? "");
  const [region, setRegion] = useState(account?.region ?? first?.region ?? "");
  const [endpoint, setEndpoint] = useState(
    account?.endpoint ?? fill(first?.endpoint ?? "", first?.region ?? ""),
  );
  const [touched, setTouched] = useState(!!account);
  const [pathStyle, setPathStyle] = useState(
    account?.pathStyle ?? first?.pathStyle ?? true,
  );
  const [ca, setCa] = useState("");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [sessionToken, setSessionToken] = useState("");
  const [saving, setSaving] = useState(false);

  function pick(id: string) {
    setProviderId(id);
    const next = providers.find((item) => item.id === id);
    if (!next || account) return;
    setRegion(next.region);
    setEndpoint(fill(next.endpoint, next.region));
    setPathStyle(next.pathStyle);
    setTouched(false);
  }

  function changeRegion(value: string) {
    setRegion(value);
    if (!touched && preset) setEndpoint(fill(preset.endpoint, value));
  }

  const missingKeys =
    !account && (!accessKeyId.trim() || !secretAccessKey.trim());
  const canSave =
    !!name.trim() &&
    !!endpoint.trim() &&
    !!region.trim() &&
    !missingKeys &&
    !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        ...(account ? {} : { provider: providerId }),
        name: name.trim(),
        endpoint: endpoint.trim(),
        region: region.trim(),
        pathStyle,
        ca: ca.trim() || undefined,
        accessKeyId,
        secretAccessKey,
        sessionToken,
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
      icon={<Package className="size-4" />}
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
      <SectionCard title={t("account.service")} icon={<Package />}>
        <SelectField
          label={t("account.provider")}
          value={providerId}
          disabled={!!account}
          onChange={pick}
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
        <TextField
          label={t("account.endpoint")}
          value={endpoint}
          onChange={(value) => {
            setEndpoint(value);
            setTouched(true);
          }}
          hint={preset?.needsAccountId ? t("account.accountIdHint") : undefined}
          mono
        />
        <TextField
          label={t("account.region")}
          value={region}
          onChange={changeRegion}
          mono
        />
        <SwitchRow
          label={t("account.pathStyle")}
          description={t("account.pathStyleHint")}
          checked={pathStyle}
          onChange={setPathStyle}
        />
        <TextAreaField
          label={t("account.ca")}
          hint={t("account.caHint")}
          value={ca}
          onChange={setCa}
          placeholder={account?.hasCa ? t("account.keep") : undefined}
          rows={3}
          mono
        />
      </SectionCard>
      <SectionCard title={t("account.keys")} icon={<Package />}>
        <TextField
          label={t("account.accessKeyId")}
          value={accessKeyId}
          onChange={setAccessKeyId}
          placeholder={account ? t("account.keep") : undefined}
          mono
        />
        <SecretField
          label={t("account.secretAccessKey")}
          value={secretAccessKey}
          onChange={setSecretAccessKey}
          placeholder={account ? t("account.keep") : undefined}
        />
        <SecretField
          label={t("account.sessionToken")}
          hint={t("account.sessionTokenHint")}
          value={sessionToken}
          onChange={setSessionToken}
          placeholder={account ? t("account.keep") : undefined}
        />
      </SectionCard>
    </InlineView>
  );
}
