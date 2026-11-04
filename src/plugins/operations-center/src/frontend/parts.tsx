import type { ReactNode } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Badge, Select2 } from "@termix-ssh/plugin-sdk/ui";

export function Choice<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; label: string }[];
  label: string;
  className?: string;
}) {
  return (
    <Select2
      value={value}
      aria-label={label}
      className={className}
      onChange={(event) => onChange(event.target.value as T)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </Select2>
  );
}

const TONE: Record<string, string> = {
  success: "text-emerald-600 dark:text-emerald-400",
  ok: "text-emerald-600 dark:text-emerald-400",
  compliant: "text-emerald-600 dark:text-emerald-400",
  done: "text-emerald-600 dark:text-emerald-400",
  failed: "text-destructive",
  fail: "text-destructive",
  error: "text-destructive",
  drifted: "text-amber-600 dark:text-amber-400",
  warn: "text-amber-600 dark:text-amber-400",
  pending_approval: "text-amber-600 dark:text-amber-400",
  paused: "text-amber-600 dark:text-amber-400",
  needs_interaction: "text-amber-600 dark:text-amber-400",
  interrupted: "text-amber-600 dark:text-amber-400",
};

/** A run, host or check state as a small word with a color. */
export function StateBadge({ state }: { state: string }) {
  const { t } = useTranslation();
  return (
    <Badge
      variant="outline"
      className={`rounded-none text-[10px] ${TONE[state] ?? ""}`}
    >
      {t(`state.${state}`, { defaultValue: state })}
    </Badge>
  );
}

export function RiskBadge({ risk }: { risk: string }) {
  const { t } = useTranslation();
  if (risk === "read") return null;
  return (
    <Badge
      variant="outline"
      className={`rounded-none text-[10px] ${risk === "destructive" ? "text-destructive" : ""}`}
    >
      {t(`risk.${risk}`)}
    </Badge>
  );
}

export function when(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}
