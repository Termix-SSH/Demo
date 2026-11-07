import { useState } from "react";
import {
  useSettings,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input, ToolbarBand } from "@termix-ssh/plugin-sdk/ui";
import { SOURCES, type LogEntry } from "../shared/types";
import { errorMessage, search } from "./api";
import { formatTime } from "./format";

/** Starting state of the panel, from the user's settings. */
export function useLogsCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 420,
    edgeButton: values.companionEdgeButton !== false,
  };
}

const LEVEL_CLASS: Record<string, string> = {
  error: "text-destructive",
  warn: "text-warning",
  debug: "text-muted-foreground",
};

/** Searches the logs of the terminal's host. */
export function LogsCompanion({ host }: CompanionProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entries, setEntries] = useState<LogEntry[] | null>(null);

  if (!host) return null;
  const hostId = Number(host.id);

  const run = async () => {
    setBusy(true);
    setError("");
    try {
      const now = Date.now();
      const result = await search({
        query: query.trim(),
        regex: false,
        caseSensitive: false,
        hostIds: [hostId],
        sources: [...SOURCES],
        from: now - 3_600_000,
        to: now,
        level: "all",
        origin: "",
        limit: 200,
      });
      setEntries(result.entries);
    } catch (e) {
      setError(errorMessage(e, t("tab.searchFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <ToolbarBand className="flex-nowrap">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("companion.placeholder")}
            className="min-w-0 flex-1 text-xs"
          />
          <Button type="submit" size="sm" disabled={busy}>
            {t("search.run")}
          </Button>
        </ToolbarBand>
      </form>
      <div className="min-h-0 flex-1 overflow-auto font-mono text-xs">
        {error ? (
          <p className="p-2 text-destructive">{error}</p>
        ) : !entries ? (
          <p className="p-2 text-muted-foreground">{t("companion.hint")}</p>
        ) : entries.length === 0 ? (
          <p className="p-2 text-muted-foreground">{t("companion.empty")}</p>
        ) : (
          entries.map((entry, i) => (
            <div
              key={i}
              className={`border-b px-2 py-1 ${LEVEL_CLASS[entry.level] ?? ""}`}
            >
              <div className="text-muted-foreground">
                {formatTime(entry.time)} | {entry.origin}
              </div>
              <div className="whitespace-pre-wrap break-all">
                {entry.message}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
