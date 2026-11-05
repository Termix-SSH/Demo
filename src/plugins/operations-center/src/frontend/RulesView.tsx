import { useCallback, useEffect, useState } from "react";
import {
  usePermission,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  Field,
  FormFooter,
  Input,
  ListRow,
  Switch,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { ORIGINS, type Rule } from "../shared/types";
import { deleteRule, errorText, listRules, saveRule } from "./api";
import { Choice, Pager, usePaged } from "./parts";

const EMPTY: Partial<Rule> = {
  name: "",
  enabled: true,
  effect: "approve",
  minRisk: "change",
  origins: [],
  pluginIds: [],
  actionIds: [],
  hostTags: [],
  allowSelf: false,
  expiresInMinutes: null,
};

const list = (text: string) =>
  text
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

function EditRule({
  rule,
  onDone,
}: {
  rule: Partial<Rule>;
  onDone: (saved?: Rule[]) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState<Partial<Rule>>(rule);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<Rule>) => setDraft({ ...draft, ...patch });
  const origins = draft.origins ?? [];

  const save = async () => {
    setSaving(true);
    try {
      onDone(await saveRule(draft));
    } catch (error) {
      toast.error(errorText(error, t("rules.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Field label={t("rules.name")}>
        <Input
          value={draft.name ?? ""}
          onChange={(event) => set({ name: event.target.value })}
        />
      </Field>
      <Field label={t("rules.effect")}>
        <Choice
          label={t("rules.effect")}
          value={draft.effect ?? "approve"}
          onChange={(effect) => set({ effect })}
          options={(["allow", "approve", "deny"] as const).map((value) => ({
            value,
            label: t(`rules.effects.${value}`),
          }))}
        />
      </Field>
      <Field label={t("rules.minRisk")} hint={t("rules.minRiskHint")}>
        <Choice
          label={t("rules.minRisk")}
          value={draft.minRisk ?? "change"}
          onChange={(minRisk) => set({ minRisk })}
          options={(["read", "change", "destructive"] as const).map(
            (value) => ({
              value,
              label: t(`risk.${value}`),
            }),
          )}
        />
      </Field>
      <Field label={t("rules.origins")} hint={t("rules.originsHint")}>
        <div className="flex flex-wrap gap-1">
          {ORIGINS.map((origin) => (
            <button
              key={origin}
              type="button"
              onClick={() =>
                set({
                  origins: origins.includes(origin)
                    ? origins.filter((entry) => entry !== origin)
                    : [...origins, origin],
                })
              }
              className={`border px-2 py-0.5 text-xs ${origins.includes(origin) ? "border-accent-brand text-accent-brand" : "border-border text-muted-foreground"}`}
            >
              {t(`origin.${origin}`)}
            </button>
          ))}
        </div>
      </Field>
      <Field label={t("rules.plugins")} hint={t("rules.listHint")}>
        <Input
          value={(draft.pluginIds ?? []).join(", ")}
          onChange={(event) => set({ pluginIds: list(event.target.value) })}
        />
      </Field>
      <Field label={t("rules.actions")} hint={t("rules.listHint")}>
        <Input
          value={(draft.actionIds ?? []).join(", ")}
          onChange={(event) => set({ actionIds: list(event.target.value) })}
        />
      </Field>
      <Field label={t("rules.tags")} hint={t("rules.listHint")}>
        <Input
          value={(draft.hostTags ?? []).join(", ")}
          onChange={(event) => set({ hostTags: list(event.target.value) })}
        />
      </Field>
      {draft.effect === "approve" && (
        <>
          <label className="flex items-center gap-2 text-xs">
            <Switch
              checked={draft.allowSelf === true}
              onCheckedChange={(allowSelf) => set({ allowSelf })}
            />
            {t("rules.allowSelf")}
          </label>
          <Field label={t("rules.expires")}>
            <Input
              type="number"
              min={5}
              value={draft.expiresInMinutes ?? ""}
              placeholder="1440"
              onChange={(event) =>
                set({
                  expiresInMinutes: event.target.value
                    ? Number(event.target.value)
                    : null,
                })
              }
            />
          </Field>
        </>
      )}
      <label className="flex items-center gap-2 text-xs">
        <Switch
          checked={draft.enabled !== false}
          onCheckedChange={(enabled) => set({ enabled })}
        />
        {t("rules.enabled")}
      </label>
      <FormFooter
        onCancel={() => onDone()}
        onSave={() => void save()}
        saving={saving}
      />
    </div>
  );
}

/** Approval rules: the first one that matches decides. */
export function RulesView() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const canEdit = usePermission("operations-center.rules");
  const [rules, setRules] = useState<Rule[]>([]);
  const [editing, setEditing] = useState<Partial<Rule> | null>(null);
  const shown = usePaged(rules, 20);

  const load = useCallback(async () => {
    try {
      setRules(await listRules());
    } catch (error) {
      toast.error(errorText(error, t("rules.failed")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  if (editing) {
    return (
      <EditRule
        rule={editing}
        onDone={(saved) => {
          setEditing(null);
          if (saved) setRules(saved);
        }}
      />
    );
  }

  const remove = async (rule: Rule) => {
    if (!(await confirm({ title: t("rules.delete"), destructive: true })))
      return;
    try {
      setRules(await deleteRule(rule.id));
    } catch (error) {
      toast.error(errorText(error, t("rules.failed")));
    }
  };

  const describe = (rule: Rule) =>
    [
      t(`rules.effects.${rule.effect}`),
      t("rules.atLeast", { risk: t(`risk.${rule.minRisk}`) }),
      rule.origins.length
        ? rule.origins.map((origin) => t(`origin.${origin}`)).join(", ")
        : t("rules.anyOrigin"),
      rule.hostTags.length ? rule.hostTags.join(", ") : "",
    ]
      .filter(Boolean)
      .join(" | ");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="border-b border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        {t("rules.about")}
      </p>
      {canEdit && (
        <div className="flex justify-end border-b border-border px-3 py-2">
          <AddButton
            label={t("rules.new")}
            onClick={() => setEditing({ ...EMPTY, position: rules.length })}
          />
        </div>
      )}
      <div className="flex flex-col overflow-auto">
        {shown.rows.map((rule) => (
          <ListRow
            key={rule.id}
            title={rule.name}
            meta={describe(rule)}
            dimmed={!rule.enabled}
            trailing={
              canEdit ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing(rule)}
                  >
                    {t("rules.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void remove(rule)}
                  >
                    {t("rules.delete")}
                  </Button>
                </>
              ) : undefined
            }
          />
        ))}
        <Pager page={shown.page} pages={shown.pages} onPage={shown.setPage} />
      </div>
    </div>
  );
}
