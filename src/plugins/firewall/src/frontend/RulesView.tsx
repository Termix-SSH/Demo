import { useState } from "react";
import { Lock, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  Segmented,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { FirewallStatus, Rule } from "../shared/types";
import { deleteRule } from "./api";
import { actionTone, metaText, portText } from "./format";
import type { useChange } from "./useChange";

type Filter = "all" | "in" | "out" | "readOnly";

export function RulesView({
  hostId,
  status,
  change,
  onEdit,
  compact,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
  onEdit: (rule: Rule) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const canEdit = status.canEdit && !status.pending;

  const remove = async (rule: Rule) => {
    const ok = await confirm({
      title: t("rules.confirmDelete"),
      description: `${portText(rule, t)} ${metaText(rule, t)}`.trim(),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    await change.run(
      (force) => deleteRule(hostId, rule.id, force),
      t("rules.deleted"),
    );
  };

  const needle = search.trim().toLowerCase();
  const visible = status.rules.filter((rule) => {
    if (filter === "in" && rule.direction !== "in") return false;
    if (filter === "out" && rule.direction !== "out") return false;
    if (filter === "readOnly" && rule.managed) return false;
    if (!needle) return true;
    return [
      rule.port,
      rule.source,
      rule.destination,
      rule.comment,
      rule.service ?? "",
      rule.app ?? "",
      rule.zone ?? "",
    ]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
  const hasOut = status.rules.some((r) => r.direction === "out");
  const hasReadOnly = status.rules.some((r) => !r.managed);

  return (
    <div className="flex flex-col gap-2">
      {!compact && (
        <div className="flex flex-wrap items-center gap-2">
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder={t("rules.search")}
            className="min-w-48 flex-1"
          />
          {(hasOut || hasReadOnly) && (
            <Segmented<Filter>
              value={filter}
              onChange={setFilter}
              options={[
                { value: "all", label: t("rules.filters.all") },
                { value: "in", label: t("rules.filters.in") },
                ...(hasOut
                  ? [{ value: "out" as Filter, label: t("rules.filters.out") }]
                  : []),
                ...(hasReadOnly
                  ? [
                      {
                        value: "readOnly" as Filter,
                        label: t("rules.filters.readOnly"),
                      },
                    ]
                  : []),
              ]}
            />
          )}
        </div>
      )}
      <PanelList
        empty={
          <p className="px-1 py-6 text-center text-xs text-muted-foreground/60">
            {status.rules.length ? t("rules.noMatch") : t("rules.empty")}
          </p>
        }
      >
        {visible.map((rule, index) => (
          <ListRow
            key={rule.id}
            stripe={index}
            tone={actionTone(rule.action)}
            dimmed={!rule.managed}
            title={
              <span className="font-mono text-xs">{portText(rule, t)}</span>
            }
            meta={
              compact
                ? undefined
                : [metaText(rule, t), rule.readOnlyReason ?? ""]
                    .filter(Boolean)
                    .join(" | ") || undefined
            }
            badges={
              <>
                <ListBadge tone={actionTone(rule.action)}>
                  {t(`actions.${rule.action}`)}
                </ListBadge>
                {!compact && rule.direction === "out" && (
                  <ListBadge tone="muted">{t("rule.out")}</ListBadge>
                )}
                {!rule.managed && (
                  <ListBadge tone="muted">
                    <Lock />
                    {t("rules.readOnly")}
                  </ListBadge>
                )}
                {rule.managed && rule.deleteOnly && !compact && (
                  <ListBadge tone="muted">{t("rules.deleteOnly")}</ListBadge>
                )}
              </>
            }
            onClick={
              canEdit && rule.managed && !rule.deleteOnly
                ? () => onEdit(rule)
                : undefined
            }
            actions={
              canEdit && rule.managed ? (
                <>
                  {!rule.deleteOnly && !compact && (
                    <ListRowAction
                      label={t("common.edit")}
                      onClick={() => onEdit(rule)}
                    >
                      <Pencil className="size-4" />
                    </ListRowAction>
                  )}
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    disabled={change.busy}
                    onClick={() => void remove(rule)}
                  >
                    <Trash2 className="size-4" />
                  </ListRowAction>
                </>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
