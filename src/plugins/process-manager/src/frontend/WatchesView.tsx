import { useCallback, useEffect, useState } from "react";
import { Bell, Trash2 } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { WatchKind, WatchRule, WatchView } from "../shared/types";
import { addWatch, errorMessage, listWatches, removeWatch } from "./api";

/** The watches of the signed in user on this host, and a form to add one. */
export function WatchesView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [watches, setWatches] = useState<WatchView[] | null>(null);
  const [kind, setKind] = useState<WatchKind>("process");
  const [rule, setRule] = useState<WatchRule>("down");
  const [target, setTarget] = useState("");
  const [threshold, setThreshold] = useState("80");
  const [autoRestart, setAutoRestart] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setWatches((await listWatches(hostId)).watches);
    } catch (e) {
      toast.error(errorMessage(e, t("watches.loadFailed")));
    }
  }, [hostId, t, toast]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  const rules: WatchRule[] =
    kind === "pm2"
      ? ["down", "restarts", "cpu", "mem"]
      : ["down", "cpu", "mem"];
  const activeRule = rules.includes(rule) ? rule : "down";

  const add = async () => {
    setBusy(true);
    try {
      const result = await addWatch(hostId, {
        kind,
        target: target.trim(),
        rule: activeRule,
        threshold: activeRule === "down" ? 0 : Number(threshold),
        autoRestart: autoRestart && activeRule === "down" && kind !== "process",
      });
      setWatches(result.watches);
      setTarget("");
      toast.success(t("watches.added"));
    } catch (e) {
      toast.error(errorMessage(e, t("watches.addFailed")));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    try {
      setWatches((await removeWatch(hostId, id)).watches);
    } catch (e) {
      toast.error(errorMessage(e, t("watches.removeFailed")));
    }
  };

  const unit = (w: { kind: WatchKind; rule: WatchRule }) =>
    w.rule === "cpu"
      ? "%"
      : w.rule === "mem"
        ? w.kind === "process"
          ? "%"
          : " MB"
        : "";

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as WatchKind)}
          aria-label={t("watches.kind")}
          className="h-8 border border-border bg-background px-1 text-xs"
        >
          <option value="process">{t("watch.kind.process")}</option>
          <option value="pm2">{t("watch.kind.pm2")}</option>
          <option value="supervisor">{t("watch.kind.supervisor")}</option>
        </select>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder={t("watches.targetPlaceholder")}
          aria-label={t("watches.target")}
          className="h-8 min-w-36 flex-1 border border-border bg-background px-2 font-mono text-xs"
        />
        <select
          value={activeRule}
          onChange={(e) => setRule(e.target.value as WatchRule)}
          aria-label={t("watches.rule")}
          className="h-8 border border-border bg-background px-1 text-xs"
        >
          {rules.map((r) => (
            <option key={r} value={r}>
              {t(`watch.rule.${r}`)}
            </option>
          ))}
        </select>
        {activeRule !== "down" && (
          <input
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            inputMode="numeric"
            aria-label={t("watches.threshold")}
            title={t(
              `watches.thresholdHint.${activeRule}.${kind === "process" ? "process" : "app"}`,
            )}
            className="h-8 w-16 border border-border bg-background px-1 text-center font-mono text-xs"
          />
        )}
        {activeRule === "down" && kind !== "process" && (
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={autoRestart}
              onChange={(e) => setAutoRestart(e.target.checked)}
            />
            {t("watches.autoRestart")}
          </label>
        )}
        <Button
          size="sm"
          disabled={busy || !target.trim()}
          onClick={() => void add()}
        >
          {t("watches.add")}
        </Button>
      </div>
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">
            {watches ? t("watches.empty") : t("tab.loading")}
          </p>
        }
      >
        {(watches ?? []).map((w, index) => (
          <ListRow
            key={w.id}
            stripe={index}
            tone={
              w.state === "down"
                ? "destructive"
                : w.state === "up"
                  ? "success"
                  : "muted"
            }
            icon={<Bell className="size-3.5" />}
            title={<span className="font-mono text-xs">{w.target}</span>}
            badges={
              <>
                <ListBadge tone="muted">{t(`watch.kind.${w.kind}`)}</ListBadge>
                {w.state && (
                  <ListBadge
                    tone={w.state === "down" ? "destructive" : "success"}
                  >
                    {w.state === "down"
                      ? t("watches.broken")
                      : t("watches.fine")}
                  </ListBadge>
                )}
                {w.autoRestart && (
                  <ListBadge tone="brand">{t("watches.auto")}</ListBadge>
                )}
              </>
            }
            meta={
              w.rule === "down"
                ? t("watch.rule.down")
                : `${t(`watch.rule.${w.rule}`)} ${w.threshold}${unit(w)}`
            }
            trailing={
              <Button
                variant="ghost"
                size="icon"
                title={t("watches.remove")}
                onClick={() => void remove(w.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
