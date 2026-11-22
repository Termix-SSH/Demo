import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark,
  Copy,
  Download,
  Pause,
  Play,
  Radio,
  ScrollText,
  Search,
  Square,
} from "lucide-react";
import {
  useDocsUrl,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  EmptyState,
  Input,
  LoadingState,
  PanelFrame,
  PanelShell,
  StatusBadge,
  ToolbarSelect,
} from "@termix-ssh/plugin-sdk/ui";
import {
  MAX_FOLLOW_HOSTS,
  SOURCES,
  type LevelFilter,
  type LogEntry,
  type SavedQuery,
  type SavedSearch,
  type SearchRequest,
  type SearchResponse,
  type SearchableHost,
  type Source,
} from "../shared/types";
import {
  cancelSearch,
  errorMessage,
  listHosts,
  listSaved,
  newRunId,
  search,
} from "./api";
import { SavedEditor } from "./SavedEditor";
import { useFollow } from "./useFollow";
import {
  RANGES,
  formatTime,
  highlight,
  rangeMs,
  toPlainText,
  type RangeId,
} from "./format";

/** Radix selects take no empty value. */
const NO_SAVED = "none";

const LEVEL_CLASS: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  debug: "text-muted-foreground",
  info: "",
};

/** Search logs on many hosts at once. */
export function LogsTab({ isVisible }: { isVisible: boolean }) {
  const { t } = useTranslation();
  const docs = useDocsUrl();
  const toast = useToast();
  const [hosts, setHosts] = useState<SearchableHost[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [showHosts, setShowHosts] = useState(false);
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [range, setRange] = useState<RangeId>("1h");
  const [level, setLevel] = useState<LevelFilter>("all");
  const [origin, setOrigin] = useState("");
  const [sources, setSources] = useState<Set<Source>>(new Set(SOURCES));
  const [busy, setBusy] = useState(false);
  const running = useRef<{ runId: string; controller: AbortController } | null>(
    null,
  );
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [shown, setShown] = useState({ query: "", regex: false, cs: false });
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [followReq, setFollowReq] = useState<SearchRequest | null>(null);
  const follow = useFollow(followReq);

  useEffect(() => {
    if (!isVisible || hosts) return;
    void listHosts()
      .then(setHosts)
      .catch((e) => setError(errorMessage(e, t("tab.hostsFailed"))));
  }, [isVisible, hosts, t]);

  useEffect(() => {
    if (!isVisible) return;
    void listSaved()
      .then(setSaved)
      .catch(() => setSaved([]));
  }, [isVisible]);

  const currentQuery = (): SavedQuery => ({
    query: query.trim(),
    regex,
    caseSensitive,
    hostIds: [...picked],
    sources: [...sources],
    range,
    level,
    origin: origin.trim(),
  });

  const applySaved = (item: SavedSearch) => {
    setSavedId(item.id);
    setQuery(item.search.query);
    setRegex(item.search.regex);
    setCaseSensitive(item.search.caseSensitive);
    setPicked(new Set(item.search.hostIds));
    setSources(new Set(item.search.sources));
    setRange(item.search.range);
    setLevel(item.search.level);
    setOrigin(item.search.origin);
  };

  const toggleFollow = () => {
    if (followReq) {
      setFollowReq(null);
      return;
    }
    const now = Date.now();
    setShown({ query: query.trim(), regex, cs: caseSensitive });
    setFollowReq({
      query: query.trim(),
      regex,
      caseSensitive,
      hostIds: [...picked],
      sources: [...sources],
      from: now - 60_000,
      to: now,
      level,
      origin: origin.trim(),
      limit: 500,
    });
  };

  const run = useCallback(async () => {
    const current = { runId: newRunId(), controller: new AbortController() };
    running.current = current;
    setBusy(true);
    setError("");
    try {
      const now = Date.now();
      const response = await search(
        {
          query: query.trim(),
          regex,
          caseSensitive,
          hostIds: [...picked],
          sources: [...sources],
          from: now - rangeMs(range),
          to: now,
          level,
          origin: origin.trim(),
          limit: 500,
        },
        { runId: current.runId, signal: current.controller.signal },
      );
      if (running.current !== current) return;
      setResult(response);
      setShown({ query: query.trim(), regex, cs: caseSensitive });
    } catch (e) {
      if (running.current !== current) return;
      setError(errorMessage(e, t("tab.searchFailed")));
    } finally {
      if (running.current === current) {
        running.current = null;
        setBusy(false);
      }
    }
  }, [query, regex, caseSensitive, picked, sources, range, level, origin, t]);

  const stop = useCallback(() => {
    const current = running.current;
    if (!current) return;
    running.current = null;
    setBusy(false);
    current.controller.abort();
    void cancelSearch(current.runId).catch(() => {});
  }, []);

  const toggleSource = (source: Source) =>
    setSources((current) => {
      const next = new Set(current);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next.size ? next : current;
    });

  const toggleHost = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const failed = useMemo(
    () => result?.hosts.filter((h) => h.status === "error") ?? [],
    [result],
  );

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(toPlainText(result.entries));
      toast.success(t("results.copied"));
    } catch {
      toast.error(t("results.copyFailed"));
    }
  };

  const download = () => {
    if (!result) return;
    const blob = new Blob([toPlainText(result.entries)], {
      type: "text/plain",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "logs.txt";
    link.click();
    URL.revokeObjectURL(url);
  };

  const hostSummary = picked.size
    ? t("tab.hostsSome", { count: picked.size })
    : t("tab.hostsAll", { count: hosts?.length ?? 0 });

  return (
    <PanelFrame>
      <PanelShell
        icon={<ScrollText className="size-4" />}
        title={t("tab.title")}
        docs={docs}
        status={
          followReq
            ? t(`follow.state.${follow.state}`, { count: follow.lines.length })
            : result
              ? t("results.summary", {
                  count: result.entries.length,
                  hosts: result.hosts.length,
                  ms: result.tookMs,
                })
              : undefined
        }
        actions={
          followReq ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => follow.setPaused(!follow.paused)}
                aria-label={
                  follow.paused ? t("follow.resume") : t("follow.pause")
                }
                title={follow.paused ? t("follow.resume") : t("follow.pause")}
              >
                {follow.paused ? <Play /> : <Pause />}
              </Button>
              <Button variant="ghost" size="xs" onClick={follow.clear}>
                {t("follow.clear")}
              </Button>
            </>
          ) : result && result.entries.length ? (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void copy()}
                aria-label={t("results.copy")}
                title={t("results.copy")}
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={download}
                aria-label={t("results.download")}
                title={t("results.download")}
              >
                <Download />
              </Button>
            </>
          ) : undefined
        }
        toolbar={
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    !e.nativeEvent.isComposing &&
                    !busy &&
                    !followReq
                  ) {
                    e.preventDefault();
                    void run();
                  }
                }}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                maxLength={200}
                className="flex-1"
              />
              {busy ? (
                <Button type="button" variant="outline" onClick={stop}>
                  <Square /> {t("search.stop")}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={!!followReq}
                  onClick={() => void run()}
                >
                  <Search /> {t("search.run")}
                </Button>
              )}
              <Button
                type="button"
                variant={followReq ? "default" : "outline"}
                onClick={toggleFollow}
                title={t("follow.hint", { max: MAX_FOLLOW_HOSTS })}
              >
                {followReq ? <Square /> : <Radio />}
                {followReq ? t("follow.stop") : t("follow.start")}
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={regex}
                  onCheckedChange={(v) => setRegex(v === true)}
                />
                {t("search.regex")}
              </label>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={caseSensitive}
                  onCheckedChange={(v) => setCaseSensitive(v === true)}
                />
                {t("search.case")}
              </label>
              {SOURCES.map((source) => (
                <label
                  key={source}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Checkbox
                    checked={sources.has(source)}
                    onCheckedChange={() => toggleSource(source)}
                  />
                  {t(`source.${source}`)}
                </label>
              ))}
              <ToolbarSelect
                label={t("search.range")}
                value={range}
                onChange={setRange}
                options={RANGES.map((r) => ({
                  value: r.value,
                  label: t(`range.${r.value}`),
                }))}
              />
              <ToolbarSelect
                label={t("search.level")}
                value={level}
                onChange={setLevel}
                options={(["all", "warn", "error"] as const).map((l) => ({
                  value: l,
                  label: t(`level.${l}`),
                }))}
              />
              <Input
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder={t("search.origin")}
                aria-label={t("search.origin")}
                maxLength={120}
                className="w-48"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowHosts((v) => !v)}
              >
                {hostSummary}
              </Button>
              {saved.length ? (
                <ToolbarSelect
                  label={t("saved.pick")}
                  value={savedId ? String(savedId) : NO_SAVED}
                  onChange={(value: string) => {
                    const item = saved.find((s) => String(s.id) === value);
                    if (item) applySaved(item);
                    else setSavedId(null);
                  }}
                  options={[
                    { value: NO_SAVED, label: t("saved.none") },
                    ...saved.map((s) => ({
                      value: String(s.id),
                      label: s.alert.enabled
                        ? `${s.name} (${t("saved.alerting")})`
                        : s.name,
                    })),
                  ]}
                />
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditing(true)}
              >
                <Bookmark />
                {savedId ? t("saved.editButton") : t("saved.saveButton")}
              </Button>
            </div>
            {showHosts ? (
              <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto border-t pt-2">
                {(hosts ?? []).map((host) => (
                  <label
                    key={host.id}
                    className="flex items-center gap-1.5 text-xs"
                  >
                    <Checkbox
                      checked={picked.has(host.id)}
                      onCheckedChange={() => toggleHost(host.id)}
                    />
                    {host.name}
                  </label>
                ))}
                {picked.size ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setPicked(new Set())}
                  >
                    {t("tab.clearHosts")}
                  </Button>
                ) : null}
                {hosts && hosts.length === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    {t("tab.noHosts")}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        }
      >
        {editing ? (
          <SavedEditor
            existing={saved.find((s) => s.id === savedId) ?? null}
            search={currentQuery()}
            onClose={() => setEditing(false)}
            onSaved={(item) => {
              setSaved((current) =>
                [...current.filter((s) => s.id !== item.id), item].sort(
                  (a, b) => a.name.localeCompare(b.name),
                ),
              );
              setSavedId(item.id);
            }}
            onDeleted={(id) => {
              setSaved((current) => current.filter((s) => s.id !== id));
              setSavedId(null);
            }}
          />
        ) : null}
        {error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {followReq ? (
          <>
            {follow.error ? (
              <p className="px-3 py-2 text-xs text-destructive">
                {follow.error}
              </p>
            ) : null}
            {follow.problems.length ? (
              <div className="flex flex-wrap gap-2 border-b px-3 py-2">
                {follow.problems.map((p) => (
                  <StatusBadge key={p.hostId} tone="bad">
                    {p.host}: {p.message}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
            {follow.dropped ? (
              <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                {t("follow.dropped", { count: follow.dropped })}
              </p>
            ) : null}
            {follow.state === "connecting" ? (
              <LoadingState label={t("follow.connecting")} />
            ) : follow.lines.length === 0 ? (
              <EmptyState icon={Radio} title={t("follow.waiting")} />
            ) : (
              <EntryList entries={follow.lines} shown={shown} />
            )}
          </>
        ) : null}
        {!followReq && busy ? (
          <LoadingState label={t("search.running")} />
        ) : null}
        {!followReq && !busy && !result ? (
          <EmptyState
            icon={ScrollText}
            title={t("results.start")}
            hint={t("results.startHint")}
          />
        ) : null}
        {!followReq && !busy && result ? (
          <>
            {failed.length ? (
              <div className="flex flex-wrap gap-2 border-b px-3 py-2">
                {failed.map((h) => (
                  <StatusBadge key={h.hostId} tone="bad">
                    {h.host}: {h.error}
                  </StatusBadge>
                ))}
              </div>
            ) : null}
            {result.entries.length === 0 ? (
              <EmptyState icon={ScrollText} title={t("results.none")} />
            ) : (
              <>
                {result.truncated ? (
                  <p className="border-b px-3 py-1.5 text-xs text-muted-foreground">
                    {t("results.truncated", { count: result.entries.length })}
                  </p>
                ) : null}
                <EntryList entries={result.entries} shown={shown} />
              </>
            )}
          </>
        ) : null}
      </PanelShell>
    </PanelFrame>
  );
}

/** Log lines, newest first, with the search hits marked. */
function EntryList({
  entries,
  shown,
}: {
  entries: LogEntry[];
  shown: { query: string; regex: boolean; cs: boolean };
}) {
  return (
    <div className="font-mono text-[11px] leading-[1.45]">
      {entries.map((entry, i) => (
        <div
          key={i}
          className={`flex gap-3 border-b px-3 py-1 ${LEVEL_CLASS[entry.level]}`}
        >
          <span className="w-40 shrink-0 text-muted-foreground">
            {formatTime(entry.time)}
          </span>
          <span className="w-32 shrink-0 truncate" title={entry.host}>
            {entry.host}
          </span>
          <span
            className="w-40 shrink-0 truncate text-muted-foreground"
            title={`${entry.source}: ${entry.origin}`}
          >
            {entry.origin}
          </span>
          <span className="min-w-0 flex-1 whitespace-pre-wrap break-all">
            {highlight(entry.message, shown.query, shown.regex, shown.cs).map(
              (part, j) =>
                part.hit ? (
                  <mark key={j} className="bg-primary/30 text-inherit">
                    {part.text}
                  </mark>
                ) : (
                  <span key={j}>{part.text}</span>
                ),
            )}
          </span>
        </div>
      ))}
    </div>
  );
}
