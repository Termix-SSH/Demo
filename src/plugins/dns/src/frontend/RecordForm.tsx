import { useState } from "react";
import { Globe } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  InlineView,
  NumberField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { DnsRecord, ProviderFeatures, RecordInput } from "../shared/types";

const HINTS: Record<string, string> = {
  A: "93.184.216.34",
  AAAA: "2606:2800:220:1::1",
  CNAME: "target.example.com",
  MX: "mail.example.com",
  TXT: "v=spf1 include:_spf.example.com ~all",
  NS: "ns1.example.com",
  SRV: "10 5060 sip.example.com",
  CAA: '0 issue "letsencrypt.org"',
  PTR: "host.example.com",
};

export function RecordForm({
  zoneName,
  record,
  features,
  onBack,
  onSave,
}: {
  zoneName: string;
  record: DnsRecord | null;
  features: ProviderFeatures;
  onBack: () => void;
  onSave: (input: RecordInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [type, setType] = useState(record?.type ?? "A");
  const [name, setName] = useState(record?.name ?? "@");
  const [content, setContent] = useState(record?.content ?? "");
  const [ttl, setTtl] = useState(
    record?.ttl ?? (features.autoTtl ? 1 : Math.max(300, features.minTtl)),
  );
  const [priority, setPriority] = useState(record?.priority ?? 10);
  const [proxied, setProxied] = useState(!!record?.proxied);
  const [comment, setComment] = useState(record?.comment ?? "");
  const [saving, setSaving] = useState(false);

  const usesPriority = type === "MX" || type === "SRV";
  const canProxy = features.proxied && ["A", "AAAA", "CNAME"].includes(type);
  const canSave = !!content.trim() && !saving;

  async function save() {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({
        type,
        name: name.trim() || "@",
        content: content.trim(),
        ttl,
        ...(usesPriority ? { priority } : {}),
        ...(canProxy ? { proxied } : {}),
        ...(features.comment && comment ? { comment } : {}),
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
      title={t(record ? "record.editTitle" : "record.addTitle")}
      status={zoneName}
      footer={
        <FormFooter
          saving={saving}
          disabled={!canSave}
          onCancel={onBack}
          onSave={() => void save()}
          saveLabel={t(record ? "record.save" : "record.add")}
        />
      }
    >
      <SectionCard title={t("record.section")} icon={<Globe />}>
        <div className="flex flex-col gap-3 py-2">
          <SelectField
            label={t("record.type")}
            value={type}
            onChange={setType}
            options={features.types.map((item) => ({
              value: item,
              label: item,
            }))}
          />
          <TextField
            label={t("record.name")}
            value={name}
            onChange={setName}
            placeholder="@"
            hint={t("record.nameHint", { zone: zoneName })}
            mono
          />
          {type === "TXT" ? (
            <TextAreaField
              label={t("record.value")}
              value={content}
              onChange={setContent}
              placeholder={HINTS[type]}
              rows={3}
              mono
            />
          ) : (
            <TextField
              label={t("record.value")}
              value={content}
              onChange={setContent}
              placeholder={HINTS[type]}
              mono
            />
          )}
          {usesPriority && (
            <NumberField
              label={t("record.priority")}
              value={priority}
              onChange={setPriority}
              min={0}
              max={65535}
            />
          )}
          <NumberField
            label={t("record.ttl")}
            value={ttl}
            onChange={setTtl}
            min={1}
            max={604800}
            hint={features.autoTtl ? t("record.ttlAuto") : t("record.ttlHint")}
          />
          {canProxy && (
            <SwitchRow
              label={t("record.proxied")}
              description={t("record.proxiedHint")}
              checked={proxied}
              onChange={setProxied}
            />
          )}
          {features.comment && (
            <TextField
              label={t("record.comment")}
              value={comment}
              onChange={setComment}
            />
          )}
        </div>
      </SectionCard>
    </InlineView>
  );
}
