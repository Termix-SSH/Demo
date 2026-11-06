import { useLayoutEffect, useRef } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";

const LEVEL_RE = /\b(error|fatal|panic|critical|crit|fail(?:ed)?)\b/i;
const WARN_RE = /\b(warn(?:ing)?)\b/i;

function lineClass(line: string): string {
  if (LEVEL_RE.test(line)) return "text-destructive";
  if (WARN_RE.test(line)) return "text-warning";
  return "";
}

/**
 * A scrolling block of log lines. It sticks to the bottom while new lines
 * come in, unless the user scrolled up.
 */
export function LogLines({
  lines,
  empty,
  className = "",
}: {
  lines: string[];
  empty?: string;
  className?: string;
}) {
  const { t } = useTranslation();
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
        <p className="text-muted-foreground">{empty ?? t("logs.empty")}</p>
      ) : (
        lines.map((line, i) => (
          <div
            key={i}
            className={`whitespace-pre-wrap break-all ${lineClass(line)}`}
          >
            {line}
          </div>
        ))
      )}
    </div>
  );
}
