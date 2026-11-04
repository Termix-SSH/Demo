import { useState } from "react";
import { Shield } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FieldPair,
  FormFooter,
  InlineView,
  SelectField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { Backend, Rule, RuleSpec, Zone } from "../shared/types";
import { EMPTY_SPEC, PRESETS } from "./format";

/** The fields of a rule, without the parts the backend has no use for. */
export function RuleFields({
  value,
  onChange,
  backend,
}: {
  value: RuleSpec;
  onChange: (next: RuleSpec) => void;
  /** Null for a rule set, which can go to any backend. */
  backend: Backend | null;
}) {
  const { t } = useTranslation();
  const firewalld = backend === "firewalld";
  const set = <K extends keyof RuleSpec>(key: K, next: RuleSpec[K]) =>
    onChange({ ...value, [key]: next });
  const actions = (["allow", "deny", "reject", "limit"] as const).filter(
    (action) => action !== "limit" || backend === "ufw" || backend === null,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((preset) => (
          <Button
            key={preset.id}
            size="sm"
            variant="outline"
            onClick={() =>
              onChange({
                ...value,
                protocol: preset.protocol,
                port: preset.port,
                service: undefined,
              })
            }
          >
            {t(`presets.${preset.id}`)}
          </Button>
        ))}
      </div>
      <FieldPair>
        <SelectField
          label={t("rule.action")}
          value={value.action}
          onChange={(v) => set("action", v)}
          options={actions.map((action) => ({
            value: action,
            label: t(`actions.${action}`),
          }))}
        />
        {!firewalld && (
          <SelectField
            label={t("rule.direction")}
            value={value.direction}
            onChange={(v) => set("direction", v)}
            options={[
              { value: "in", label: t("rule.in") },
              { value: "out", label: t("rule.out") },
            ]}
          />
        )}
      </FieldPair>
      <FieldPair>
        <SelectField
          label={t("rule.protocol")}
          value={value.protocol}
          onChange={(v) => set("protocol", v)}
          options={[
            { value: "tcp", label: "TCP" },
            { value: "udp", label: "UDP" },
            { value: "any", label: t("rule.anyProtocol") },
          ]}
        />
        <TextField
          label={t("rule.port")}
          value={value.port}
          onChange={(v) => set("port", v)}
          placeholder={t("rule.portPlaceholder")}
          hint={t("rule.portHint")}
          mono
        />
      </FieldPair>
      <FieldPair>
        <TextField
          label={t("rule.source")}
          value={value.source}
          onChange={(v) => set("source", v)}
          placeholder={t("rule.anywhere")}
          hint={t("rule.addressHint")}
          mono
        />
        <TextField
          label={t("rule.destination")}
          value={value.destination}
          onChange={(v) => set("destination", v)}
          placeholder={t("rule.anywhere")}
          mono
        />
      </FieldPair>
      <FieldPair>
        <SelectField
          label={t("rule.family")}
          value={value.family}
          onChange={(v) => set("family", v)}
          options={[
            { value: "any", label: t("rule.bothFamilies") },
            { value: "ipv4", label: "IPv4" },
            { value: "ipv6", label: "IPv6" },
          ]}
        />
        {firewalld ? (
          <TextField
            label={t("rule.service")}
            value={value.service ?? ""}
            onChange={(v) =>
              onChange({ ...value, service: v.trim() ? v.trim() : undefined })
            }
            placeholder="http"
            hint={t("rule.serviceHint")}
            mono
          />
        ) : (
          <TextField
            label={t("rule.iface")}
            value={value.iface}
            onChange={(v) => set("iface", v)}
            placeholder={t("rule.anyIface")}
            mono
          />
        )}
      </FieldPair>
      {!firewalld && (
        <TextField
          label={t("rule.comment")}
          value={value.comment}
          onChange={(v) => set("comment", v)}
          placeholder={t("rule.commentPlaceholder")}
        />
      )}
    </div>
  );
}

/** Adds a rule or changes one. */
export function RuleEditor({
  rule,
  backend,
  zones,
  defaultZone,
  onClose,
  onSave,
  busy,
}: {
  rule: Rule | null;
  backend: Backend;
  zones: Zone[];
  defaultZone: string;
  onClose: () => void;
  onSave: (spec: RuleSpec, zone?: string) => Promise<boolean>;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const [spec, setSpec] = useState<RuleSpec>(() => {
    if (!rule) return { ...EMPTY_SPEC };
    const {
      action,
      direction,
      protocol,
      port,
      source,
      destination,
      iface,
      family,
      comment,
      service,
    } = rule;
    return {
      action,
      direction,
      protocol,
      port,
      source,
      destination,
      iface,
      family,
      comment,
      service,
    };
  });
  const [zone, setZone] = useState(rule?.zone ?? defaultZone);
  const usable = zones.filter((z) => z.active || z.isDefault);

  const save = async () => {
    if (await onSave(spec, backend === "firewalld" ? zone : undefined))
      onClose();
  };

  return (
    <InlineView
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={rule ? t("rules.editTitle") : t("rules.addTitle")}
      icon={<Shield className="size-4" />}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={busy}
          dirty
          cancelLabel={t("common.cancel")}
          saveLabel={rule ? t("common.save") : t("rules.add")}
        />
      }
      scroll
    >
      <div className="flex flex-col gap-3 p-3">
        {backend === "firewalld" && !rule && usable.length > 1 && (
          <SelectField
            label={t("rule.zoneLabel")}
            value={zone}
            onChange={setZone}
            options={usable.map((z) => ({ value: z.name, label: z.name }))}
          />
        )}
        <RuleFields value={spec} onChange={setSpec} backend={backend} />
      </div>
    </InlineView>
  );
}
