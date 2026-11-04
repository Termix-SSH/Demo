import { useCallback, useEffect, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, EmptyState, Textarea } from "@termix-ssh/plugin-sdk/ui";
import { ShieldCheck } from "lucide-react";
import {
  decideApproval,
  errorText,
  listApprovals,
  type Approval,
  type CatalogAction,
} from "./api";
import { RiskBadge, when } from "./parts";

/**
 * Requests waiting for a person. Shows exactly what will run, from the
 * stored request, never text the requester or a model wrote about it.
 */
export function ApprovalsView({ actions }: { actions: CatalogAction[] }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Approval[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const titleOf = (id: string) =>
    actions.find((action) => action.id === id)?.title ?? id;

  const load = useCallback(async () => {
    try {
      setItems(await listApprovals());
    } catch (error) {
      toast.error(errorText(error, t("approvals.failed")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 5000);
    return () => clearInterval(timer);
  }, [load]);

  const decide = async (item: Approval, approve: boolean) => {
    setBusy(item.id);
    try {
      const outcome = await decideApproval(item.id, approve, comments[item.id]);
      if (approve) {
        if (outcome.status === "success") toast.success(t("approvals.ran"));
        else toast.error(outcome.error ?? t(`state.${outcome.status}`));
      } else {
        toast.success(t("approvals.rejected"));
      }
    } catch (error) {
      toast.error(errorText(error, t("approvals.failed")));
    } finally {
      setBusy(null);
      await load();
    }
  };

  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t("approvals.empty")}
        hint={t("approvals.emptyHint")}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
      {items.map((item) => {
        const origin = item.run.origin;
        const from =
          origin?.kind === "plugin"
            ? t(`origin.${origin.via ?? "plugin"}`)
            : t(`origin.${origin?.kind ?? "api"}`);
        return (
          <div
            key={item.id}
            className="flex flex-col gap-2 border border-border p-3 text-xs"
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              {titleOf(item.run.actionId)}
              <RiskBadge risk={item.run.risk} />
            </div>
            <p className="text-muted-foreground">
              {[
                item.run.hostName,
                item.run.username,
                from,
                when(item.createdAt),
              ]
                .filter(Boolean)
                .join(" | ")}
            </p>
            {item.reason && <p>{t("approvals.rule", { name: item.reason })}</p>}
            <pre className="overflow-auto whitespace-pre-wrap bg-muted p-2 font-mono text-[11px]">
              {JSON.stringify(item.run.input ?? {}, null, 2)}
            </pre>
            <p className="text-muted-foreground">
              {t("approvals.expires", { time: when(item.expiresAt) })}
            </p>
            <Textarea
              rows={2}
              placeholder={t("approvals.comment")}
              value={comments[item.id] ?? ""}
              onChange={(event) =>
                setComments({ ...comments, [item.id]: event.target.value })
              }
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={busy === item.id}
                onClick={() => void decide(item, true)}
              >
                {t("approvals.approve")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === item.id}
                onClick={() => void decide(item, false)}
              >
                {t("approvals.reject")}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
