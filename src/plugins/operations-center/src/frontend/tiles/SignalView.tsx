import type { ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { SignalResult } from "@termix-ssh/plugin-sdk/operations";

const TEXT: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  fail: "text-destructive",
  unknown: "text-muted-foreground",
};
const BAR: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  fail: "bg-destructive",
  unknown: "bg-muted-foreground",
};
const DOT = BAR;

export function statusOf(result: SignalResult | undefined): string {
  return result?.status ?? "unknown";
}

function shown(result: SignalResult): string {
  if (result.label) return result.label;
  if (result.value === null || result.value === undefined) return "";
  return String(result.value);
}

/**
 * One signal reading, drawn by its kind: a count as a big number, a gauge
 * as a bar, a status as a dot and a word, a list as rows.
 */
export function SignalView({
  kind,
  result,
  state = "ok",
  footer,
}: {
  kind: string;
  result?: SignalResult;
  /** How the read went; anything but ok shows that instead of a value. */
  state?: string;
  footer?: ReactNode;
}) {
  const { t } = useTranslation();
  if (state !== "ok" || !result) {
    return (
      <div className="flex flex-1 flex-col justify-center gap-1 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {t(`state.${state}`, { defaultValue: state })}
        </span>
        {footer}
      </div>
    );
  }
  const status = statusOf(result);
  const value = typeof result.value === "number" ? result.value : null;

  let body: ReactNode;
  if (kind === "count") {
    body = (
      <span className={`text-2xl font-semibold tabular-nums ${TEXT[status]}`}>
        {value ?? shown(result)}
      </span>
    );
  } else if (kind === "gauge") {
    const percent = value !== null && value >= 0 && value <= 100 ? value : null;
    body = (
      <div className="flex flex-col gap-1.5">
        <span className={`text-lg font-semibold tabular-nums ${TEXT[status]}`}>
          {shown(result)}
        </span>
        {percent !== null && (
          <div className="h-1.5 w-full bg-muted">
            <div
              className={`h-full ${BAR[status]}`}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </div>
    );
  } else if (kind === "list") {
    const items = result.items ?? [];
    body = (
      <div className="flex min-h-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">{shown(result)}</span>
        {items.length > 0 && (
          <ul className="flex flex-col gap-0.5">
            {items.slice(0, 20).map((item, index) => (
              <li
                key={`${item.label}-${index}`}
                className="flex items-center gap-1.5 text-xs"
              >
                <span
                  className={`size-1.5 shrink-0 rounded-full ${DOT[item.status ?? "unknown"]}`}
                />
                <span className="truncate">{item.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  } else {
    body = (
      <span className="flex items-center gap-2 text-sm font-medium">
        <span className={`size-2 shrink-0 rounded-full ${DOT[status]}`} />
        <span className="truncate">
          {shown(result) || t(`state.${status}`)}
        </span>
      </span>
    );
  }

  return (
    <div className="flex flex-1 flex-col justify-center gap-2 px-3 py-2">
      {body}
      {footer}
    </div>
  );
}
