import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Pencil, Trash2, Route } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  useConfirm,
  InlineView,
  AddButton,
  EmptyState,
  FormFooter,
  ListRow,
  ListRowAction,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import {
  SEVERITIES,
  type AlertRule,
  type ChannelSummary,
  type Severity,
} from "../types";
import type { AlertsApi, RuleInput } from "./api";
import { rowActionProps, useAlwaysShowActions } from "./AlertSettings";

const EMPTY: RuleInput = {
  name: "",
  match: "*",
  minSeverity: "warning",
  channelIds: [],
  enabled: true,
};

export function RulesView({ api }: { api: AlertsApi }) {
  const { t } = useTranslation();
  const alwaysShowActions = useAlwaysShowActions();
  const confirm = useConfirm();
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [draft, setDraft] = useState<RuleInput>(EMPTY);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ruleList, channelList, categoryList] = await Promise.all([
        api.rules(),
        api.channels(),
        api.categories(),
      ]);
      setRules(ruleList);
      setChannels(channelList);
      setCategories([...new Set(categoryList.map((entry) => entry.category))]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const channelName = (id: number) =>
    channels.find((channel) => channel.id === id)?.name ?? `#${id}`;

  const openEditor = (rule: AlertRule | null) => {
    setEditing(rule);
    setDraft(
      rule
        ? {
            name: rule.name,
            match: rule.match,
            minSeverity: rule.minSeverity,
            channelIds: rule.channelIds,
            enabled: rule.enabled,
          }
        : EMPTY,
    );
    setDialogOpen(true);
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast.error(t("rules.nameRequired"));
      return;
    }
    if (draft.channelIds.length === 0) {
      toast.error(t("rules.channelRequired"));
      return;
    }
    setSaving(true);
    try {
      if (editing) await api.updateRule(editing.id, draft);
      else await api.createRule(draft);
      setDialogOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (rule: AlertRule, enabled: boolean) => {
    try {
      await api.updateRule(rule.id, {
        name: rule.name,
        match: rule.match,
        minSeverity: rule.minSeverity,
        channelIds: rule.channelIds,
        enabled,
      });
      setRules((current) =>
        current.map((entry) =>
          entry.id === rule.id ? { ...entry, enabled } : entry,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const remove = (rule: AlertRule) => {
    void confirm({
      title: t("rules.deleteConfirm", { name: rule.name }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
    }).then((ok) => {
      if (ok)
        void (async () => {
          try {
            await api.deleteRule(rule.id);
            await load();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
          }
        })();
      return ok;
    });
  };

  const toggleChannel = (id: number, checked: boolean) =>
    setDraft((current) => ({
      ...current,
      channelIds: checked
        ? [...new Set([...current.channelIds, id])]
        : current.channelIds.filter((entry) => entry !== id),
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
          {t("rules.intro")}
        </p>
        <AddButton
          label={t("rules.add")}
          disabled={channels.length === 0}
          title={
            channels.length === 0 ? t("rules.needChannel") : t("rules.add")
          }
          onClick={() => openEditor(null)}
        />
      </div>

      <PanelList
        empty={
          loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <EmptyState
              icon={Route}
              title={
                channels.length === 0
                  ? t("rules.needChannel")
                  : t("rules.empty")
              }
            />
          )
        }
      >
        {!loading &&
          rules.map((rule, index) => (
            <ListRow
              key={rule.id}
              stripe={index}
              tone={rule.enabled ? "brand" : "muted"}
              dimmed={!rule.enabled}
              title={rule.name}
              onClick={() => openEditor(rule)}
              meta={t("rules.summary", {
                match: rule.match === "*" ? t("rules.everything") : rule.match,
                severity: t(`severity.${rule.minSeverity}`),
                channels: rule.channelIds.map(channelName).join(", "),
              })}
              trailing={
                <span onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={rule.enabled}
                    onCheckedChange={(checked) => void toggle(rule, checked)}
                    aria-label={t("rules.enabled")}
                  />
                </span>
              }
              {...rowActionProps(
                alwaysShowActions,
                <>
                  <ListRowAction
                    label={t("rules.edit")}
                    onClick={() => openEditor(rule)}
                  >
                    <Pencil />
                  </ListRowAction>
                  <ListRowAction
                    label={t("actions.delete")}
                    tone="destructive"
                    onClick={() => remove(rule)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>,
              )}
            />
          ))}
      </PanelList>

      <InlineView
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? t("rules.edit") : t("rules.add")}
        footer={
          <FormFooter
            onCancel={() => setDialogOpen(false)}
            cancelLabel={t("actions.cancel")}
            onSave={() => void save()}
            saveLabel={t("actions.save")}
            saving={saving}
          />
        }
      >
        <div className="flex flex-col gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("rules.name")}
            </label>
            <Input
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
              className="h-8 text-xs"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("rules.match")}
            </label>
            <Input
              value={draft.match}
              list="alerts-rule-categories"
              onChange={(event) =>
                setDraft({ ...draft, match: event.target.value })
              }
              placeholder="*"
              className="h-8 font-mono text-xs"
            />
            <datalist id="alerts-rule-categories">
              <option value="*" />
              {categories.map((category) => (
                <option key={category} value={category} />
              ))}
            </datalist>
            <span className="text-[10px] text-muted-foreground">
              {t("rules.matchHint")}
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("rules.minSeverity")}
            </label>
            <Select
              value={draft.minSeverity}
              onValueChange={(value) =>
                setDraft({ ...draft, minSeverity: value as Severity })
              }
            >
              <SelectTrigger className="h-8 rounded-none text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.filter((value) => value !== "success").map(
                  (value) => (
                    <SelectItem key={value} value={value}>
                      {t(`severity.${value}`)}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("rules.channels")}
            </label>
            <div className="flex max-h-40 flex-col overflow-y-auto border border-border">
              {channels.map((channel) => (
                <label
                  key={channel.id}
                  className="flex cursor-pointer items-center gap-2 border-b border-border/60 px-2.5 py-1.5 text-xs last:border-0 hover:bg-muted/40"
                >
                  <Checkbox
                    checked={draft.channelIds.includes(channel.id)}
                    onCheckedChange={(checked) =>
                      toggleChannel(channel.id, checked === true)
                    }
                  />
                  <span className="truncate">{channel.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {t(`channels.types.${channel.type}`)}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </InlineView>
    </div>
  );
}
