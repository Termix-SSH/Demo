import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Pause, Play, RefreshCw, Trash2 } from "lucide-react";
import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  PanelSearch,
  ToolbarBand,
  ToolbarSelect,
} from "@termix-ssh/plugin-sdk/ui";
import type { LogTarget } from "../shared/types";
import { errorMessage, getLogs } from "./api";
import { LogLines } from "./LogLines";
import { useFollow } from "./useFollow";

const LINE_CHOICES = [100, 200, 500, 1000, 2000];

/**
 * One log: a snapshot of the last lines, or a live follow. Used by the Logs
 * view, the process detail and the side panel.
 */
export function LogPane({
  host,
  target,
  isVisible,
  className,
  compact = false,
}: {
  host: PluginHostRecord;
  target: LogTarget | null;
  isVisible: boolean;
  className?: string;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const hostId = Number(host.id);
  const [follow, setFollow] = useState(false);
  const [lines, setLines] = useState(200);
  const [filter, setFilter] = useState("");
  const [snapshot, setSnapshot] = useState<string[]>([]);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const key = target ? JSON.stringify(target) : "";

  const live = useFollow(host, target, isVisible && follow, lines);

  const load = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    try {
      const view = await getLogs(hostId, target, lines, "");
      setSnapshot(view.text ? view.text.replace(/\n$/, "").split("\n") : []);
      setFailed("");
    } catch (e) {
      setSnapshot([]);
      setFailed(errorMessage(e, t("logs.failed")));
    } finally {
      setLoading(false);
    }
    // key stands in for target, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId, key, lines, t]);

  useEffect(() => {
    setFollow(false);
  }, [key]);

  useEffect(() => {
    if (isVisible && !follow) void load();
  }, [isVisible, follow, load]);

  const shown = useMemo(() => {
    const source = follow ? live.lines : snapshot;
    const needle = filter.trim().toLowerCase();
    return needle
      ? source.filter((line) => line.toLowerCase().includes(needle))
      : source;
  }, [follow, live.lines, snapshot, filter]);

  const download = () => {
    const blob = new Blob([shown.join("\n") + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "process-log.txt";
    a.click();
    URL.revokeObjectURL(url);
  };

  const error = follow ? live.error : failed;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ToolbarBand>
        <PanelSearch
          value={filter}
          onChange={setFilter}
          placeholder={t("logs.filter")}
          className="min-w-32 flex-1"
        />
        {!compact && (
          <ToolbarSelect
            value={String(lines)}
            onChange={(next) => setLines(Number(next))}
            label={t("logs.lines")}
            options={LINE_CHOICES.map((n) => ({
              value: String(n),
              label: t("logs.linesCount", { count: n }),
            }))}
          />
        )}
        <Button
          variant={follow ? "default" : "ghost"}
          size="sm"
          disabled={!target}
          onClick={() => setFollow((v) => !v)}
        >
          {follow ? t("logs.following") : t("logs.follow")}
        </Button>
        {follow ? (
          <>
            <Button
              variant="ghost"
              size="icon"
              title={live.paused ? t("logs.resume") : t("logs.pause")}
              onClick={() => live.setPaused(!live.paused)}
            >
              {live.paused ? (
                <Play className="size-4" />
              ) : (
                <Pause className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title={t("logs.clear")}
              onClick={live.clear}
            >
              <Trash2 className="size-4" />
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            title={t("tab.refresh")}
            disabled={loading || !target}
            onClick={() => void load()}
            className="text-accent-brand"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          title={t("logs.download")}
          disabled={shown.length === 0}
          onClick={download}
        >
          <Download className="size-4" />
        </Button>
      </ToolbarBand>
      {error && <p className="px-3 py-2 text-xs text-destructive">{error}</p>}
      <LogLines
        lines={shown}
        empty={target ? undefined : t("logs.pick")}
        className={className ?? "min-h-0 flex-1"}
      />
    </div>
  );
}
