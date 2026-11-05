import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ListChecks,
  Pencil,
  Play,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-react";
import {
  useHosts,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  Checkbox,
  FormFooter,
  InlineView,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelShell,
  SelectField,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  ApplyResult,
  DriftResult,
  RuleSet,
  RuleSpec,
} from "../shared/types";
import {
  applyRuleSet,
  createRuleSet,
  deleteRuleSet,
  driftOf,
  errorMessage,
  listFleets,
  listRuleSets,
  updateRuleSet,
  type RuleSetInput,
} from "./api";
import { actionTone, EMPTY_SPEC, metaText, portText } from "./format";
import { RuleFields } from "./RuleEditor";

type HostLite = {
  id: number | string;
  name?: string | null;
  ip?: string;
  pluginSettings?: unknown;
};

function firewallOn(host: HostLite): boolean {
  const all = host.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.firewall?.enableFirewall === true;
}

/** Named rule lists you can apply to many hosts, with a drift check. */
export function RuleSetsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { hosts } = useHosts();
  const [sets, setSets] = useState<RuleSet[] | null>(null);
  const [failed, setFailed] = useState("");
  const [editing, setEditing] = useState<RuleSet | "new" | null>(null);
  const [report, setReport] = useState<{
    set: RuleSet;
    drift?: DriftResult[];
    apply?: ApplyResult[];
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [fleets, setFleets] = useState<Array<{ id: number; name: string }>>([]);

  const load = useCallback(async () => {
    try {
      setSets(await listRuleSets());
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("rulesets.loadFailed")));
    }
  }, [t]);

  useEffect(() => {
    void load();
    void listFleets()
      .then(setFleets)
      .catch(() => setFleets([]));
  }, [load]);

  const hostName = useCallback(
    (id: number) => {
      const host = hosts.find((h) => Number(h.id) === id);
      return host?.name || host?.ip || `#${id}`;
    },
    [hosts],
  );

  const check = async (set: RuleSet) => {
    setBusy(true);
    try {
      setReport({ set, drift: await driftOf(set.id) });
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
    }
  };

  const apply = async (set: RuleSet, fleetId?: number) => {
    const ok = await confirm({
      title: t("rulesets.applyTitle", { name: set.name }),
      description: t("rulesets.applyDescription"),
      confirmLabel: t("rulesets.apply"),
      destructive: false,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const results = await applyRuleSet(set.id, fleetId ? { fleetId } : {});
      setReport({ set, apply: results });
      const errors = results.filter((r) => r.error).length;
      if (errors) toast.error(t("rulesets.applyErrors", { count: errors }));
      else toast.success(t("rulesets.applied"));
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy(false);
      await load();
    }
  };

  const remove = async (set: RuleSet) => {
    const ok = await confirm({
      title: t("rulesets.confirmDelete", { name: set.name }),
      description: t("rulesets.deleteHint"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    try {
      await deleteRuleSet(set.id);
      toast.success(t("rulesets.deleted"));
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    }
    await load();
  };

  return (
    <div className="h-full w-full overflow-hidden">
      <PanelShell
        icon={<ListChecks className="size-4" />}
        title={t("rulesets.title")}
        actions={
          <AddButton
            label={t("rulesets.add")}
            onClick={() => setEditing("new")}
          />
        }
        scroll
      >
        <div className="flex shrink-0 flex-col gap-2">
          <p className="text-xs text-muted-foreground">{t("rulesets.hint")}</p>
          {failed ? (
            <p className="p-2 text-sm text-destructive">{failed}</p>
          ) : !sets ? (
            <p className="p-2 text-xs text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : (
            <PanelList
              empty={
                <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
                  {t("rulesets.empty")}
                </p>
              }
            >
              {sets.map((set, index) => (
                <ListRow
                  key={set.id}
                  stripe={index}
                  title={set.name}
                  meta={[
                    t("rulesets.ruleCount", { count: set.rules.length }),
                    t("rulesets.hostCount", { count: set.hosts.length }),
                    set.description,
                  ]
                    .filter(Boolean)
                    .join(" | ")}
                  onClick={() => setEditing(set)}
                  actions={
                    <>
                      <ListRowAction
                        label={t("rulesets.check")}
                        disabled={busy || !set.hosts.length}
                        onClick={() => void check(set)}
                      >
                        <ScanSearch className="size-4" />
                      </ListRowAction>
                      <ListRowAction
                        label={t("rulesets.apply")}
                        tone="brand"
                        disabled={busy || !set.hosts.length}
                        onClick={() => void apply(set)}
                      >
                        <Play className="size-4" />
                      </ListRowAction>
                      <ListRowAction
                        label={t("common.edit")}
                        onClick={() => setEditing(set)}
                      >
                        <Pencil className="size-4" />
                      </ListRowAction>
                      <ListRowAction
                        label={t("common.delete")}
                        tone="destructive"
                        onClick={() => void remove(set)}
                      >
                        <Trash2 className="size-4" />
                      </ListRowAction>
                    </>
                  }
                />
              ))}
            </PanelList>
          )}
          {report && (
            <Report
              report={report}
              hostName={hostName}
              fleets={fleets}
              busy={busy}
              onApplyFleet={(id) => void apply(report.set, id)}
            />
          )}
        </div>
      </PanelShell>
      {editing && (
        <RuleSetEditor
          set={editing === "new" ? null : editing}
          hosts={hosts as HostLite[]}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

function Report({
  report,
  hostName,
  fleets,
  busy,
  onApplyFleet,
}: {
  report: { set: RuleSet; drift?: DriftResult[]; apply?: ApplyResult[] };
  hostName: (id: number) => string;
  fleets: Array<{ id: number; name: string }>;
  busy: boolean;
  onApplyFleet: (fleetId: number) => void;
}) {
  const { t } = useTranslation();
  const [fleet, setFleet] = useState(fleets[0] ? String(fleets[0].id) : "");
  return (
    <div className="flex flex-col gap-2 border border-border p-2">
      <div className="text-sm font-medium">
        {report.drift
          ? t("rulesets.driftTitle", { name: report.set.name })
          : t("rulesets.applyResult", { name: report.set.name })}
      </div>
      <PanelList>
        {(report.drift ?? []).map((row, index) => (
          <ListRow
            key={row.hostId}
            stripe={index}
            tone={
              row.error
                ? "destructive"
                : row.missing.length
                  ? "warning"
                  : "success"
            }
            title={hostName(row.hostId)}
            meta={
              row.error ??
              (row.missing.length
                ? row.missing
                    .map(
                      (spec) =>
                        `${t(`actions.${spec.action}`)} ${portText(spec, t)}`,
                    )
                    .join(", ")
                : t("rulesets.inSync"))
            }
            badges={
              !row.error ? (
                <ListBadge tone={row.missing.length ? "warning" : "success"}>
                  {row.missing.length
                    ? t("rulesets.missing", { count: row.missing.length })
                    : t("rulesets.ok")}
                </ListBadge>
              ) : undefined
            }
          />
        ))}
        {(report.apply ?? []).map((row, index) => (
          <ListRow
            key={row.hostId}
            stripe={index}
            tone={row.error ? "destructive" : row.kept ? "success" : "warning"}
            title={hostName(row.hostId)}
            meta={
              row.error ??
              (row.skipped
                ? t("rulesets.nothingMissing")
                : row.kept
                  ? t("rulesets.added", { count: row.added })
                  : t("rulesets.waiting"))
            }
          />
        ))}
      </PanelList>
      {fleets.length > 0 && (
        <div className="flex items-end gap-2">
          <SelectField
            label={t("rulesets.fleet")}
            value={fleet}
            onChange={setFleet}
            options={fleets.map((f) => ({
              value: String(f.id),
              label: f.name,
            }))}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={busy || !fleet}
            onClick={() => onApplyFleet(Number(fleet))}
          >
            {t("rulesets.applyFleet")}
          </Button>
        </div>
      )}
    </div>
  );
}

function RuleSetEditor({
  set,
  hosts,
  onClose,
  onSaved,
}: {
  set: RuleSet | null;
  hosts: HostLite[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [form, setForm] = useState<RuleSetInput>(() => ({
    name: set?.name ?? "",
    description: set?.description ?? "",
    rules: set?.rules ?? [],
    hosts: set?.hosts ?? [],
  }));
  const [draft, setDraft] = useState<{ index: number; spec: RuleSpec } | null>(
    null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const candidates = useMemo(() => hosts.filter(firewallOn), [hosts]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (set) await updateRuleSet(set.id, form);
      else await createRuleSet(form);
      toast.success(t("rulesets.saved"));
      onSaved();
    } catch (e) {
      setError(errorMessage(e, t("common.failed")));
    } finally {
      setSaving(false);
    }
  };

  const toggleHost = (id: number, on: boolean) =>
    setForm((prev) => ({
      ...prev,
      hosts: on ? [...prev.hosts, id] : prev.hosts.filter((h) => h !== id),
    }));

  return (
    <InlineView
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={set ? t("rulesets.editTitle") : t("rulesets.addTitle")}
      icon={<ListChecks className="size-4" />}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          dirty={!!form.name.trim()}
          cancelLabel={t("common.cancel")}
          saveLabel={t("common.save")}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
        />
      }
      scroll
    >
      <div className="flex flex-col gap-3 p-3">
        <TextField
          label={t("rulesets.name")}
          value={form.name}
          onChange={(name) => setForm({ ...form, name })}
          placeholder={t("rulesets.namePlaceholder")}
        />
        <TextAreaField
          label={t("rulesets.description")}
          value={form.description}
          onChange={(description) => setForm({ ...form, description })}
          rows={2}
        />
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t("rulesets.rules")}</span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraft({ index: -1, spec: { ...EMPTY_SPEC } })}
          >
            <Plus className="size-4" />
            {t("rules.add")}
          </Button>
        </div>
        {draft && (
          <div className="flex flex-col gap-2 border border-border p-2">
            <RuleFields
              value={draft.spec}
              onChange={(spec) => setDraft({ ...draft, spec })}
              backend={null}
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  setForm((prev) => ({
                    ...prev,
                    rules:
                      draft.index < 0
                        ? [...prev.rules, draft.spec]
                        : prev.rules.map((r, i) =>
                            i === draft.index ? draft.spec : r,
                          ),
                  }));
                  setDraft(null);
                }}
              >
                {t("common.done")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                {t("common.cancel")}
              </Button>
            </div>
          </div>
        )}
        <PanelList
          empty={
            <p className="px-1 py-3 text-xs text-muted-foreground/60">
              {t("rulesets.noRules")}
            </p>
          }
        >
          {form.rules.map((rule, index) => (
            <ListRow
              key={`${index}-${portText(rule, t)}`}
              stripe={index}
              tone={actionTone(rule.action)}
              title={
                <span className="font-mono text-xs">{portText(rule, t)}</span>
              }
              meta={metaText(rule, t) || undefined}
              badges={
                <ListBadge tone={actionTone(rule.action)}>
                  {t(`actions.${rule.action}`)}
                </ListBadge>
              }
              onClick={() => setDraft({ index, spec: rule })}
              actions={
                <ListRowAction
                  label={t("common.delete")}
                  tone="destructive"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      rules: prev.rules.filter((_, i) => i !== index),
                    }))
                  }
                >
                  <Trash2 className="size-4" />
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
        <span className="text-sm font-medium">{t("rulesets.hosts")}</span>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {t("rulesets.noHosts")}
          </p>
        ) : (
          <div className="flex flex-col gap-1">
            {candidates.map((host) => {
              const id = Number(host.id);
              return (
                <label key={id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={form.hosts.includes(id)}
                    onCheckedChange={(on) => toggleHost(id, on === true)}
                  />
                  {host.name || host.ip || `#${id}`}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </InlineView>
  );
}
