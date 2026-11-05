import { useEffect, useState } from "react";
import {
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import type { LogTarget } from "../shared/types";
import { LogPane } from "./LogPane";

type Kind = "journal" | "journal-pid" | "pm2" | "supervisor";

function kindOf(target: LogTarget | null): Kind {
  return target && target.kind !== "file" ? target.kind : "journal";
}

function textOf(target: LogTarget | null): string {
  if (!target) return "";
  switch (target.kind) {
    case "journal":
      return target.unit;
    case "journal-pid":
      return String(target.pid);
    case "file":
      return String(target.pid);
    default:
      return target.key;
  }
}

/** Logs of a service, a process, a pm2 app or a supervisor process. */
export function LogsView({
  host,
  initial,
  isVisible,
}: {
  host: PluginHostRecord;
  initial: LogTarget | null;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<Kind>(kindOf(initial));
  const [text, setText] = useState(textOf(initial));
  const [target, setTarget] = useState<LogTarget | null>(initial);
  const [stream, setStream] = useState<"stdout" | "stderr">("stdout");

  useEffect(() => {
    if (!initial) return;
    setKind(kindOf(initial));
    setText(textOf(initial));
    setTarget(initial);
    if (initial.kind === "supervisor") setStream(initial.stream);
  }, [initial]);

  const build = (): LogTarget | null => {
    const value = text.trim();
    if (!value) return null;
    if (kind === "journal") return { kind, unit: value };
    if (kind === "journal-pid") {
      const pid = Number(value);
      return Number.isInteger(pid) && pid > 1 ? { kind, pid } : null;
    }
    if (kind === "pm2") return { kind, key: value };
    return { kind, key: value, stream };
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-1.5">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as Kind)}
          aria-label={t("logs.source")}
          className="h-8 border border-border bg-background px-1 text-xs"
        >
          <option value="journal">{t("logs.sourceJournal")}</option>
          <option value="journal-pid">{t("logs.sourcePid")}</option>
          <option value="pm2">{t("logs.sourcePm2")}</option>
          <option value="supervisor">{t("logs.sourceSupervisor")}</option>
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && setTarget(build())}
          placeholder={t(`logs.placeholder.${kind}`)}
          aria-label={t("logs.target")}
          className="h-8 min-w-40 flex-1 border border-border bg-background px-2 font-mono text-xs"
        />
        {kind === "supervisor" && (
          <select
            value={stream}
            onChange={(e) => setStream(e.target.value as "stdout" | "stderr")}
            aria-label={t("logs.stream")}
            className="h-8 border border-border bg-background px-1 text-xs"
          >
            <option value="stdout">stdout</option>
            <option value="stderr">stderr</option>
          </select>
        )}
        <Button size="sm" onClick={() => setTarget(build())}>
          {t("logs.open")}
        </Button>
      </div>
      <LogPane host={host} target={target} isVisible={isVisible} />
    </div>
  );
}
