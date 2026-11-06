import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  RefreshButton,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { LogsView as Logs } from "../shared/types";
import { errorMessage, getLogs } from "./api";

const SIZES = [100, 200, 500, 1000];

export function LogsView({ hostId }: { hostId: number }) {
  const { t } = useTranslation();
  const [lines, setLines] = useState(200);
  const [logs, setLogs] = useState<Logs | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLogs(await getLogs(hostId, lines));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("logs.failed")));
    } finally {
      setLoading(false);
    }
  }, [hostId, lines, t]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ToolbarBand>
        <span className="flex-1 truncate text-xs text-muted-foreground">
          {logs
            ? logs.source === "none"
              ? t("logs.noSource")
              : t("logs.source", { source: logs.source })
            : ""}
        </span>
        <Select
          value={String(lines)}
          onValueChange={(v) => setLines(Number(v))}
        >
          <SelectTrigger
            size="sm"
            className="w-32"
            aria-label={t("logs.lines")}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SIZES.map((size) => (
              <SelectItem key={size} value={String(size)}>
                {t("logs.lineCount", { count: size })}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <RefreshButton
          onClick={() => void load()}
          loading={loading}
          label={t("tab.refresh")}
        />
      </ToolbarBand>
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !logs ? (
        <LoadingState />
      ) : (
        <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
          {logs.text || t("logs.empty")}
        </pre>
      )}
    </div>
  );
}
