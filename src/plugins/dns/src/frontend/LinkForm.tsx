import { useEffect, useMemo, useState } from "react";
import { Link2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  InlineView,
  NumberField,
  SectionCard,
  SelectField,
  SwitchRow,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  HostChoice,
  Link,
  LinkInput,
  LinkSource,
  ProviderInfo,
  ZoneRef,
} from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { toast } from "sonner";

export function LinkForm({
  link,
  api,
  zones,
  providers,
  onBack,
  onSave,
}: {
  link: Link | null;
  api: DnsApi;
  zones: ZoneRef[];
  providers: ProviderInfo[];
  onBack: () => void;
  onSave: (input: LinkInput) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [hosts, setHosts] = useState<HostChoice[]>([]);
  const [zoneKey, setZoneKey] = useState(
    link ? `${link.accountId}:${link.zoneId}` : "",
  );
  const [name, setName] = useState(link?.name ?? "");
  const [type, setType] = useState<"A" | "AAAA">(link?.type ?? "A");
  const [source, setSource] = useState<LinkSource>(link?.source ?? "host");
  const [hostId, setHostId] = useState(link?.hostId ? String(link.hostId) : "");
  const [ttl, setTtl] = useState(link?.ttl ?? 300);
  const [proxied, setProxied] = useState(link?.proxied ?? false);
  const [enabled, setEnabled] = useState(link?.enabled ?? true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .hosts()
      .then(setHosts)
      .catch((error) => toast.error(errorMessage(error)));
  }, [api]);

  const zone = useMemo(
    () => zones.find((item) => `${item.accountId}:${item.id}` === zoneKey),
    [zones, zoneKey],
  );
  const features = providers.find(
    (item) => item.id === zone?.provider,
  )?.features;
  const canSave =
    !!zone && !!name.trim() && (source !== "host" || !!hostId) && !saving;

  async function save() {
    if (!zone || !canSave) return;
    setSaving(true);
    try {
      await onSave({
        accountId: zone.accountId,
        zoneId: zone.id,
        zoneName: zone.name,
        name: name.trim(),
        type,
        source,
        hostId: source === "host" ? Number(hostId) : null,
        ttl,
        proxied,
        enabled,
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
      icon={<Link2 className="size-4" />}
      title={t(link ? "link.editTitle" : "link.addTitle")}
      footer={
        <FormFooter
          saving={saving}
          disabled={!canSave}
          onCancel={onBack}
          onSave={() => void save()}
          saveLabel={t(link ? "link.save" : "link.add")}
        />
      }
    >
      <SectionCard title={t("link.record")} icon={<Link2 />}>
        <div className="flex flex-col gap-3 py-2">
          <SelectField
            label={t("link.zone")}
            value={zoneKey}
            placeholder={t("link.pickZone")}
            disabled={!!link}
            onChange={setZoneKey}
            options={zones.map((item) => ({
              value: `${item.accountId}:${item.id}`,
              label: `${item.name} (${item.accountName})`,
            }))}
          />
          <TextField
            label={t("record.name")}
            value={name}
            onChange={setName}
            placeholder="home"
            hint={t("record.nameHint", { zone: zone?.name ?? "" })}
            mono
          />
          <SelectField
            label={t("record.type")}
            value={type}
            onChange={(value) => {
              setType(value);
              if (source === "public4" && value === "AAAA")
                setSource("public6");
              if (source === "public6" && value === "A") setSource("public4");
            }}
            options={[
              { value: "A", label: "A (IPv4)" },
              { value: "AAAA", label: "AAAA (IPv6)" },
            ]}
          />
          <NumberField
            label={t("record.ttl")}
            value={ttl}
            onChange={setTtl}
            min={1}
            max={86400}
          />
          {features?.proxied && (
            <SwitchRow
              label={t("record.proxied")}
              description={t("record.proxiedHint")}
              checked={proxied}
              onChange={setProxied}
            />
          )}
        </div>
      </SectionCard>
      <SectionCard title={t("link.address")} icon={<Link2 />}>
        <div className="flex flex-col gap-3 py-2">
          <SelectField
            label={t("link.source")}
            value={source}
            onChange={(value) => setSource(value as LinkSource)}
            options={[
              { value: "host", label: t("link.sourceHost") },
              type === "A"
                ? { value: "public4", label: t("link.sourcePublic4") }
                : { value: "public6", label: t("link.sourcePublic6") },
            ]}
          />
          {source === "host" && (
            <SelectField
              label={t("link.host")}
              value={hostId}
              placeholder={t("link.pickHost")}
              onChange={setHostId}
              options={hosts.map((host) => ({
                value: String(host.id),
                label: `${host.name} (${host.ip})`,
              }))}
            />
          )}
          <p className="text-xs text-muted-foreground">
            {t(source === "host" ? "link.hostHint" : "link.publicHint")}
          </p>
          <SwitchRow
            label={t("link.enabled")}
            checked={enabled}
            onChange={setEnabled}
          />
        </div>
      </SectionCard>
    </InlineView>
  );
}
