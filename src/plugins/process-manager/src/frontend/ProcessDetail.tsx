import { useCallback, useEffect, useState } from "react";
import { Activity } from "lucide-react";
import {
  useToast,
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InfoGrid,
  InlineView,
  ListRow,
  ListRowAction,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import {
  SIGNALS,
  type LogTarget,
  type ProcessDetail as Detail,
  type ProcessRow,
  type SignalName,
} from "../shared/types";
import { errorMessage, getProcess, reniceProcess, signalProcess } from "./api";
import { bytes, span } from "./format";
import { LogPane } from "./LogPane";

/** One process: facts, signals, priority and where its output goes. */
export function ProcessDetail({
  host,
  row,
  canEdit,
  isVisible,
  onClose,
  onChanged,
}: {
  host: PluginHostRecord;
  row: ProcessRow;
  canEdit: boolean;
  isVisible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const hostId = Number(host.id);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [failed, setFailed] = useState("");
  const [busy, setBusy] = useState(false);
  const [nice, setNice] = useState(String(row.nice ?? 0));
  const [source, setSource] = useState<LogTarget | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getProcess(hostId, row.pid));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("detail.gone")));
    }
  }, [hostId, row.pid, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (signal: SignalName) => {
    if (signal === "KILL" || signal === "TERM") {
      const ok = await confirm({
        title: t(`signal.confirm.${signal}`, { pid: row.pid }),
        description: t("signal.confirmDesc", { name: row.command }),
        confirmLabel: t(`signal.${signal}`),
        destructive: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      await signalProcess(hostId, row.pid, signal, row.command);
      toast.success(t("signal.sent", { signal, pid: row.pid }));
      onChanged();
      void load();
    } catch (e) {
      toast.error(errorMessage(e, t("signal.failed")));
    } finally {
      setBusy(false);
    }
  };

  const applyNice = async () => {
    setBusy(true);
    try {
      await reniceProcess(hostId, row.pid, Number(nice), row.command);
      toast.success(t("detail.niceDone"));
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e, t("detail.niceFailed")));
    } finally {
      setBusy(false);
    }
  };

  const sources: Array<{ label: string; target: LogTarget }> = [
    ...(detail?.unit
      ? [
          {
            label: t("detail.logUnit", { unit: detail.unit }),
            target: { kind: "journal", unit: detail.unit } as LogTarget,
          },
        ]
      : []),
    {
      label: t("detail.logPid"),
      target: { kind: "journal-pid", pid: row.pid },
    },
    ...(canEdit
      ? (detail?.files ?? []).map((f) => ({
          label: f.path,
          target: { kind: "file", pid: row.pid, fd: f.fd } as LogTarget,
        }))
      : []),
  ];

  return (
    <InlineView
      open
      onOpenChange={(open) => !open && onClose()}
      title={`${row.command} (${row.pid})`}
      icon={<Activity className="size-4" />}
      status={`${row.user} | ${row.cpu.toFixed(1)}% CPU | ${row.mem.toFixed(1)}% ${t("list.mem")}`}
      width="wide"
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {failed && (
          <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
        )}
        {detail && (
          <InfoGrid
            items={[
              { label: t("detail.cmdline"), value: detail.cmdline, mono: true },
              { label: t("detail.cwd"), value: detail.cwd, mono: true },
              { label: t("detail.exe"), value: detail.exe, mono: true },
              { label: t("detail.unit"), value: detail.unit, mono: true },
              { label: t("detail.state"), value: detail.state },
              { label: t("detail.threads"), value: String(detail.threads) },
              { label: t("detail.rss"), value: bytes(detail.rss) },
              { label: t("detail.vsize"), value: bytes(detail.vsize) },
              { label: t("detail.age"), value: span(row.age) },
              { label: t("detail.fds"), value: String(detail.fdCount) },
              { label: t("detail.ports"), value: detail.ports.join("\n") },
              {
                label: t("detail.env"),
                value: detail.envKeys.slice(0, 60).join(", "),
              },
            ]}
          />
        )}
        {canEdit && (
          <div className="flex flex-wrap items-center gap-1 border-y border-border p-2">
            {SIGNALS.map((signal) => (
              <Button
                key={signal}
                variant="ghost"
                size="xs"
                disabled={busy}
                onClick={() => void send(signal)}
                title={t(`signal.hint.${signal}`)}
              >
                {signal}
              </Button>
            ))}
            <span className="ml-auto flex items-center gap-1 text-xs">
              {t("detail.nice")}
              <input
                value={nice}
                onChange={(e) => setNice(e.target.value)}
                inputMode="numeric"
                aria-label={t("detail.nice")}
                className="h-7 w-14 border border-border bg-background px-1 text-center font-mono"
              />
              <Button
                variant="ghost"
                size="xs"
                disabled={busy || nice.trim() === ""}
                onClick={() => void applyNice()}
              >
                {t("detail.apply")}
              </Button>
            </span>
          </div>
        )}
        <PanelList>
          {sources.map((s, i) => (
            <ListRow
              key={JSON.stringify(s.target)}
              stripe={i}
              title={<span className="font-mono text-xs">{s.label}</span>}
              selected={JSON.stringify(source) === JSON.stringify(s.target)}
              onClick={() => setSource(s.target)}
              trailing={
                <ListRowAction
                  label={t("detail.readLog")}
                  tone="brand"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSource(s.target);
                  }}
                >
                  {t("detail.readLog")}
                </ListRowAction>
              }
            />
          ))}
        </PanelList>
        {source ? (
          <div className="flex h-96 min-h-0 flex-col border-t border-border">
            <LogPane host={host} target={source} isVisible={isVisible} />
          </div>
        ) : (
          <p className="p-3 text-xs text-muted-foreground">
            {t("detail.pickLog")}
          </p>
        )}
      </div>
    </InlineView>
  );
}
