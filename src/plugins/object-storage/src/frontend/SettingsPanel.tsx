import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Settings2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FieldPair,
  LoadingState,
  NumberField,
  PanelShell,
  Repeater,
  SectionCard,
  TileColumn,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  BucketRow,
  BucketSettings,
  CorsRule,
  LifecycleRule,
  PublicAccessBlock,
  SettingKind,
} from "../shared/types";
import { errorMessage, type Api } from "./api";

const GB = 1024 ** 3;

const split = (value: string) =>
  value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

function Block({
  title,
  supported,
  children,
}: {
  title: string;
  supported: boolean;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <SectionCard title={title} icon={<Settings2 />}>
      {supported ? (
        children
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("settings.unsupported")}
        </p>
      )}
    </SectionCard>
  );
}

/** The part of the settings each save call sends. */
function bodyOf(kind: SettingKind, data: BucketSettings): unknown {
  switch (kind) {
    case "versioning":
      return { status: data.versioning.status };
    case "lifecycle":
      return { rules: data.lifecycle.rules };
    case "cors":
      return { rules: data.cors.rules };
    case "policy":
      return { text: data.policy.text };
    case "tags":
      return { tags: data.tags.tags };
    case "encryption":
      return { enabled: data.encryption.enabled };
    default:
      return { block: data.publicAccess.block };
  }
}

const KINDS: SettingKind[] = [
  "versioning",
  "lifecycle",
  "cors",
  "policy",
  "tags",
  "encryption",
  "publicAccess",
];

export function SettingsPanel({
  api,
  accountId,
  bucket,
  row,
  onLimit,
}: {
  api: Api;
  accountId: number;
  bucket: string;
  row: BucketRow | null;
  onLimit: () => void;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<BucketSettings | null>(null);
  const [loaded, setLoaded] = useState<BucketSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [limitGb, setLimitGb] = useState(0);
  const [limitObjects, setLimitObjects] = useState(0);

  const load = useCallback(async () => {
    try {
      const fresh = await api.settings(accountId, bucket);
      setData(fresh);
      setLoaded(structuredClone(fresh));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }, [api, accountId, bucket]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setLimitGb(row?.maxBytes ? Math.round((row.maxBytes / GB) * 100) / 100 : 0);
    setLimitObjects(row?.maxObjects ?? 0);
  }, [row?.maxBytes, row?.maxObjects]);

  const savedGb = row?.maxBytes
    ? Math.round((row.maxBytes / GB) * 100) / 100
    : 0;
  const savedObjects = row?.maxObjects ?? 0;
  const limitChanged = limitGb !== savedGb || limitObjects !== savedObjects;

  const changed = useMemo(
    () =>
      data && loaded
        ? KINDS.filter(
            (kind) =>
              data[kind].supported &&
              JSON.stringify(bodyOf(kind, data)) !==
                JSON.stringify(bodyOf(kind, loaded)),
          )
        : [],
    [data, loaded],
  );
  const dirty = changed.length > 0 || limitChanged;

  async function saveAll() {
    if (!data) return;
    setSaving(true);
    try {
      for (const kind of changed) {
        await api.saveSetting(accountId, bucket, kind, bodyOf(kind, data));
      }
      if (limitChanged) {
        await api.setLimit(accountId, bucket, {
          maxBytes: limitGb > 0 ? Math.round(limitGb * GB) : null,
          maxObjects: limitObjects > 0 ? limitObjects : null,
        });
      }
      toast.success(t("saved"));
      await load();
      if (limitChanged) onLimit();
    } catch (error) {
      toast.error(errorMessage(error));
      await load();
    } finally {
      setSaving(false);
    }
  }

  if (!data) return <LoadingState />;
  const update = (patch: Partial<BucketSettings>) =>
    setData((current) => (current ? { ...current, ...patch } : current));

  return (
    <PanelShell
      chrome={false}
      footer={
        <Button
          size="sm"
          disabled={saving || !dirty}
          onClick={() => void saveAll()}
        >
          {t("settings.save")}
        </Button>
      }
    >
      <TileColumn>
        <SectionCard title={t("settings.limits")} icon={<Settings2 />}>
          <div className="flex flex-col gap-3 py-2">
            <FieldPair>
              <NumberField
                label={t("settings.limitGb")}
                value={limitGb}
                min={0}
                onChange={setLimitGb}
                hint={t("settings.limitHint")}
              />
              <NumberField
                label={t("settings.limitObjects")}
                value={limitObjects}
                min={0}
                onChange={setLimitObjects}
              />
            </FieldPair>
          </div>
        </SectionCard>

        <Block
          title={t("settings.versioning")}
          supported={data.versioning.supported}
        >
          <SwitchRow
            label={t("settings.versioningOn")}
            description={t("settings.versioningHint")}
            checked={data.versioning.status === "Enabled"}
            onChange={(on) =>
              update({
                versioning: {
                  ...data.versioning,
                  status: on ? "Enabled" : "Suspended",
                },
              })
            }
          />
        </Block>

        <Block
          title={t("settings.lifecycle")}
          supported={data.lifecycle.supported}
        >
          <Repeater<LifecycleRule>
            label={t("settings.rules")}
            items={data.lifecycle.rules}
            onChange={(rules) =>
              update({ lifecycle: { ...data.lifecycle, rules } })
            }
            makeItem={() => ({
              id: "",
              prefix: "",
              enabled: true,
              expireDays: 30,
              noncurrentDays: null,
              abortUploadDays: 7,
            })}
            empty={t("settings.noRules")}
            addLabel={t("settings.addRule")}
            renderItem={(rule, change) => (
              <div className="space-y-2">
                <FieldPair>
                  <TextField
                    label={t("settings.ruleName")}
                    value={rule.id}
                    onChange={(id) => change({ ...rule, id })}
                  />
                  <TextField
                    label={t("settings.rulePrefix")}
                    value={rule.prefix}
                    onChange={(prefix) => change({ ...rule, prefix })}
                    mono
                  />
                </FieldPair>
                <FieldPair>
                  <NumberField
                    label={t("settings.expireDays")}
                    value={rule.expireDays ?? 0}
                    min={0}
                    onChange={(n) => change({ ...rule, expireDays: n || null })}
                  />
                  <NumberField
                    label={t("settings.noncurrentDays")}
                    value={rule.noncurrentDays ?? 0}
                    min={0}
                    onChange={(n) =>
                      change({ ...rule, noncurrentDays: n || null })
                    }
                  />
                  <NumberField
                    label={t("settings.abortDays")}
                    value={rule.abortUploadDays ?? 0}
                    min={0}
                    onChange={(n) =>
                      change({ ...rule, abortUploadDays: n || null })
                    }
                  />
                </FieldPair>
                <SwitchRow
                  label={t("settings.ruleOn")}
                  checked={rule.enabled}
                  onChange={(enabled) => change({ ...rule, enabled })}
                />
              </div>
            )}
          />
        </Block>

        <Block title={t("settings.cors")} supported={data.cors.supported}>
          <Repeater<CorsRule>
            label={t("settings.rules")}
            items={data.cors.rules}
            onChange={(rules) => update({ cors: { ...data.cors, rules } })}
            makeItem={() => ({
              origins: ["*"],
              methods: ["GET"],
              headers: ["*"],
              maxAge: 3000,
            })}
            empty={t("settings.noRules")}
            addLabel={t("settings.addRule")}
            renderItem={(rule, change) => (
              <div className="space-y-2">
                <TextField
                  label={t("settings.origins")}
                  value={rule.origins.join(", ")}
                  onChange={(v) => change({ ...rule, origins: split(v) })}
                  mono
                />
                <TextField
                  label={t("settings.methods")}
                  value={rule.methods.join(", ")}
                  onChange={(v) => change({ ...rule, methods: split(v) })}
                  hint={t("settings.methodsHint")}
                  mono
                />
                <TextField
                  label={t("settings.headers")}
                  value={rule.headers.join(", ")}
                  onChange={(v) => change({ ...rule, headers: split(v) })}
                  mono
                />
              </div>
            )}
          />
        </Block>

        <Block title={t("settings.policy")} supported={data.policy.supported}>
          <TextAreaField
            label={t("settings.policyJson")}
            hint={t("settings.policyHint")}
            value={data.policy.text}
            onChange={(text) => update({ policy: { ...data.policy, text } })}
            rows={10}
            mono
          />
        </Block>

        <Block title={t("settings.tags")} supported={data.tags.supported}>
          <Repeater<{ key: string; value: string }>
            label={t("settings.tags")}
            items={data.tags.tags}
            onChange={(tags) => update({ tags: { ...data.tags, tags } })}
            makeItem={() => ({ key: "", value: "" })}
            empty={t("settings.noTags")}
            addLabel={t("settings.addTag")}
            renderItem={(tag, change) => (
              <FieldPair>
                <TextField
                  label={t("settings.tagKey")}
                  value={tag.key}
                  onChange={(key) => change({ ...tag, key })}
                />
                <TextField
                  label={t("settings.tagValue")}
                  value={tag.value}
                  onChange={(value) => change({ ...tag, value })}
                />
              </FieldPair>
            )}
          />
        </Block>

        <Block
          title={t("settings.encryption")}
          supported={data.encryption.supported}
        >
          <SwitchRow
            label={t("settings.encryptionOn")}
            description={t("settings.encryptionHint")}
            checked={data.encryption.enabled}
            onChange={(enabled) =>
              update({ encryption: { ...data.encryption, enabled } })
            }
          />
        </Block>

        <Block
          title={t("settings.publicAccess")}
          supported={data.publicAccess.supported}
        >
          {(
            [
              "blockPublicAcls",
              "ignorePublicAcls",
              "blockPublicPolicy",
              "restrictPublicBuckets",
            ] as Array<keyof PublicAccessBlock>
          ).map((name) => (
            <SwitchRow
              key={name}
              label={t(`settings.${name}`)}
              checked={data.publicAccess.block[name]}
              onChange={(on) =>
                update({
                  publicAccess: {
                    ...data.publicAccess,
                    block: { ...data.publicAccess.block, [name]: on },
                  },
                })
              }
            />
          ))}
        </Block>
      </TileColumn>
    </PanelShell>
  );
}
