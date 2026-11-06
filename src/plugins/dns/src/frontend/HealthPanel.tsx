import { useCallback, useEffect, useState } from "react";
import { Activity, Radar } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  DataTable,
  DataTableRow,
  EmptyState,
  LoadingState,
  StatusDot,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { HealthReport, PropagationRow } from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { levelTone } from "./format";

const th =
  "px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
const td = "px-3 py-1.5 text-xs";

export function HealthPanel({
  api,
  accountId,
  zoneId,
}: {
  api: DnsApi;
  accountId: number;
  zoneId: string;
}) {
  const { t } = useTranslation();
  const [report, setReport] = useState<HealthReport | null>(null);
  const [rows, setRows] = useState<PropagationRow[] | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<"health" | "propagation" | null>(null);

  const load = useCallback(async () => {
    try {
      setReport(await api.lastHealth(accountId, zoneId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoaded(true);
    }
  }, [api, accountId, zoneId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run() {
    setBusy("health");
    try {
      setReport(await api.runHealth(accountId, zoneId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function propagate() {
    setBusy("propagation");
    try {
      setRows(await api.propagation(accountId, zoneId));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  const text = (code: string, params?: Record<string, string | number>) =>
    t(`health.${code}`, params);

  return (
    <div>
      <ToolbarBand>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void run()}
        >
          <Activity className="size-3.5" />
          {t(busy === "health" ? "health.running" : "health.run")}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void propagate()}
        >
          <Radar className="size-3.5" />
          {t(busy === "propagation" ? "health.running" : "health.propagation")}
        </Button>
        {report && (
          <span className="text-xs text-muted-foreground">
            {t("health.lastRun", {
              date: new Date(report.at).toLocaleString(),
            })}
          </span>
        )}
      </ToolbarBand>
      {!loaded && <LoadingState />}
      {loaded && !report && (
        <EmptyState icon={Activity} title={t("health.empty")} />
      )}
      {report && (
        <ul className="divide-y divide-border border-b border-border">
          {report.checks.map((check, index) => (
            <li
              key={`${check.code}-${index}`}
              className="flex items-center gap-2 px-3 py-1.5 text-xs"
            >
              <StatusDot tone={levelTone(check.level)} />
              <span>{text(check.code, check.params)}</span>
            </li>
          ))}
        </ul>
      )}
      {rows && (
        <>
          <p className="px-3 pt-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {t("health.propagationTitle")}
          </p>
          <DataTable>
            <thead>
              <tr>
                <th className={th}>{t("health.record")}</th>
                <th className={th}>{t("health.resolver")}</th>
                <th className={th}>{t("health.answer")}</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <DataTableRow key={`${row.record}-${row.resolver}-${index}`}>
                  <td className={`${td} font-mono`}>{row.record}</td>
                  <td className={td}>{row.resolver}</td>
                  <td className={`${td} break-all font-mono`}>
                    {row.error
                      ? row.error
                      : row.answers.length
                        ? row.answers.join(", ")
                        : t("health.noAnswer")}
                  </td>
                  <td className={td}>
                    <StatusDot tone={row.match ? "ok" : "warn"} />
                  </td>
                </DataTableRow>
              ))}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}
