import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Copy, ScrollText, Search } from "lucide-react";
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
  SelectField,
  StatusBadge,
} from "@termix-ssh/plugin-sdk/ui";
import {
  SOURCES,
  type LevelFilter,
  type SearchResponse,
  type SearchableHost,
  type Source,
} from "../shared/types";
import { errorMessage, listHosts, search } from "./api";
import {
  RANGES,
  formatTime,
  highlight,
  rangeMs,
  toPlainText,
  type RangeId,
} from "./format";

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
  const [error, setError] = useState("");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [shown, setShown] = useState({ query: "", regex: false, cs: false });

  useEffect(() => {
    if (!isVisible || hosts) return;
    void listHosts()
      .then(setHosts)
      .catch((e) => setError(errorMessage(e, t("tab.hostsFailed"))));
  }, [isVisible, hosts, t]);

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const now = Date.now();
      const response = await search({
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
      });
      setResult(response);
      setShown({ query: query.trim(), regex, cs: caseSensitive });
    } catch (e) {
      setError(errorMessage(e, t("tab.searchFailed")));
    } finally {
      setBusy(false);
    }
  }, [query, regex, caseSensitive, picked, sources, range, level, origin, t]);

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
          result
            ? t("results.summary", {
                count: result.entries.length,
                hosts: result.hosts.length,
                ms: result.tookMs,
              })
            : undefined
        }
        actions={
          result && result.entries.length ? (
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
          <form
            className="flex flex-col gap-2 px-3 py-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <div className="flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("search.placeholder")}
                aria-label={t("search.placeholder")}
                maxLength={200}
                className="flex-1"
              />
              <Button type="submit" disabled={busy}>
                <Search /> {t("search.run")}
              </Button>
            </div>
            <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
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
              <SelectField
                label={t("search.range")}
                value={range}
                onChange={(v) => setRange(v as RangeId)}
                options={RANGES.map((r) => ({
                  value: r.value,
                  label: t(`range.${r.value}`),
                }))}
                className="w-36"
              />
              <SelectField
                label={t("search.level")}
                value={level}
                onChange={(v) => setLevel(v as LevelFilter)}
                options={(["all", "warn", "error"] as const).map((l) => ({
                  value: l,
                  label: t(`level.${l}`),
                }))}
                className="w-36"
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
                size="sm"
                onClick={() => setShowHosts((v) => !v)}
              >
                {hostSummary}
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
          </form>
        }
      >
        {error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : null}
        {busy ? <LoadingState label={t("search.running")} /> : null}
        {!busy && !result ? (
          <EmptyState
            icon={ScrollText}
            title={t("results.start")}
            hint={t("results.startHint")}
          />
        ) : null}
        {!busy && result ? (
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
              <div className="font-mono text-[11px] leading-[1.45]">
                {result.truncated ? (
                  <p className="border-b px-3 py-1.5 font-sans text-xs text-muted-foreground">
                    {t("results.truncated", { count: result.entries.length })}
                  </p>
                ) : null}
                {result.entries.map((entry, i) => (
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
                      {highlight(
                        entry.message,
                        shown.query,
                        shown.regex,
                        shown.cs,
                      ).map((part, j) =>
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
            )}
          </>
        ) : null}
      </PanelShell>
    </PanelFrame>
  );
}
