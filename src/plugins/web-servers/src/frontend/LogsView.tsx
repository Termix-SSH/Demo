import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Pause, Play } from "lucide-react";
import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  RefreshButton,
  SelectField,
  StatTile,
  TileWall,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { LogFile, LogResult, LogSource, WebStatus } from "../shared/types";
import { errorMessage, getLogFiles, readLog } from "./api";
import { SERVER_LABEL, formatSize } from "./format";
import { useFollow } from "./useFollow";

const LINE_CHOICES = ["100", "500", "2000"] as const;

function sourceOf(value: string): LogSource | null {
  if (value.startsWith("journal:")) {
    return {
      kind: "journal",
      server: value.slice(8) as "nginx" | "apache" | "caddy",
    };
  }
  if (value.startsWith("file:")) return { kind: "file", path: value.slice(5) };
  return null;
}

/** Access and error logs, with live follow and simple counts. */
export function LogsView({
  host,
  hostId,
  status,
}: {
  host: PluginHostRecord;
  hostId: number;
  status: WebStatus;
}) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<LogFile[] | null>(null);
  const [choice, setChoice] = useState("");
  const [lines, setLines] = useState<(typeof LINE_CHOICES)[number]>("100");
  const [result, setResult] = useState<LogResult | null>(null);
  const [failed, setFailed] = useState("");
  const [loading, setLoading] = useState(false);
  const [following, setFollowing] = useState(false);
  const source = sourceOf(choice);
  const follow = useFollow(host, source, following);

  useEffect(() => {
    void getLogFiles(hostId)
      .then((list) => {
        setFiles(list);
        const first =
          list.find((f) => /access/.test(f.path) && !/\.\d+$/.test(f.path)) ??
          list[0];
        if (first) setChoice(`file:${first.path}`);
        else if (status.systemd) {
          const server = status.servers.find((s) => s.installed);
          if (server) setChoice(`journal:${server.kind}`);
        }
      })
      .catch((e) => setFailed(errorMessage(e, t("logs.loadFailed"))));
    // Only once per host, so a status refresh keeps the chosen log.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostId]);

  const load = useCallback(async () => {
    const src = sourceOf(choice);
    if (!src) return;
    setLoading(true);
    try {
      setResult(await readLog(hostId, src, Number(lines)));
      setFailed("");
    } catch (e) {
      setResult(null);
      setFailed(errorMessage(e, t("logs.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [hostId, choice, lines, t]);

  useEffect(() => {
    if (!following) void load();
  }, [load, following]);

  if (!files) {
    return failed ? (
      <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
    ) : (
      <LoadingState />
    );
  }

  const options = [
    ...files.map((f) => ({
      value: `file:${f.path}`,
      label: `${f.path} (${formatSize(f.size)})`,
    })),
    ...(status.systemd
      ? status.servers
          .filter((s) => s.installed)
          .map((s) => ({
            value: `journal:${s.kind}`,
            label: t("logs.journal", { server: SERVER_LABEL[s.kind] }),
          }))
      : []),
  ];
  const shown = following ? follow.lines : (result?.lines ?? []);
  const stats = following ? null : result?.stats;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ToolbarBand className="items-end">
        <SelectField<string>
          label={t("logs.source")}
          value={choice}
          onChange={(value) => {
            setChoice(value);
            setFollowing(false);
          }}
          options={options}
          className="min-w-64 flex-1"
        />
        {!following && (
          <SelectField<(typeof LINE_CHOICES)[number]>
            label={t("logs.lines")}
            value={lines}
            onChange={setLines}
            options={LINE_CHOICES.map((value) => ({ value, label: value }))}
            className="w-28"
          />
        )}
        {!following && (
          <RefreshButton
            onClick={() => void load()}
            loading={loading}
            label={t("tab.refresh")}
          />
        )}
        <Button
          variant={following ? "default" : "outline"}
          size="sm"
          disabled={!source}
          onClick={() => setFollowing((v) => !v)}
        >
          {following ? (
            <Pause className="size-4" />
          ) : (
            <Play className="size-4" />
          )}
          {following ? t("logs.stop") : t("logs.follow")}
        </Button>
      </ToolbarBand>
      {following && follow.state !== "live" && (
        <p
          className={`px-3 py-2 text-xs ${follow.state === "error" ? "text-destructive" : "text-muted-foreground"}`}
        >
          {follow.state === "error"
            ? follow.error || t("logs.followFailed")
            : follow.state === "ended"
              ? t("logs.ended")
              : t("logs.connecting")}
        </p>
      )}
      {failed && !following && (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      )}
      {stats && (
        <div className="border-b border-border">
          <TileWall gridClassName="grid-cols-2 sm:grid-cols-5">
            <StatTile label={t("logs.requests")} value={stats.lines} />
            <StatTile label="2xx" value={stats.status["2xx"]} tone="ok" />
            <StatTile label="3xx" value={stats.status["3xx"]} />
            <StatTile
              label="4xx"
              value={stats.status["4xx"]}
              tone={stats.status["4xx"] ? "warn" : "default"}
            />
            <StatTile
              label="5xx"
              value={stats.status["5xx"]}
              tone={stats.status["5xx"] ? "bad" : "default"}
            />
          </TileWall>
          <div className="grid gap-3 px-3 py-2 text-xs sm:grid-cols-2">
            <TopList title={t("logs.topPaths")} items={stats.paths} />
            <TopList title={t("logs.topClients")} items={stats.clients} />
          </div>
        </div>
      )}
      <LogLines lines={shown} empty={t("logs.empty")} />
    </div>
  );
}

function TopList({
  title,
  items,
}: {
  title: string;
  items: Array<{ value: string; count: number }>;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 font-medium text-muted-foreground">{title}</div>
      {items.map((item) => (
        <div key={item.value} className="flex gap-2">
          <span className="min-w-0 flex-1 truncate font-mono">
            {item.value}
          </span>
          <span className="tabular-nums text-muted-foreground">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

/** A scrolling block of lines that sticks to the bottom unless scrolled up. */
export function LogLines({
  lines,
  empty,
  className = "min-h-0 flex-1",
}: {
  lines: string[];
  empty: string;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className={`min-h-24 overflow-auto bg-background px-3 py-2 font-mono text-[11px] leading-[1.45] thin-scrollbar ${className}`}
    >
      {lines.length === 0 ? (
        <p className="text-muted-foreground">{empty}</p>
      ) : (
        lines.map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line}
          </div>
        ))
      )}
    </div>
  );
}
