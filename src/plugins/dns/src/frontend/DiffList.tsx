import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListBadge } from "@termix-ssh/plugin-sdk/ui";
import type { DiffEntry } from "../shared/types";

const TONE = {
  add: "success",
  change: "warning",
  remove: "destructive",
} as const;

/** What a restore or an import would do, one line per record. */
export function DiffList({ diff }: { diff: DiffEntry[] }) {
  const { t } = useTranslation();
  if (diff.length === 0) {
    return (
      <p className="px-3 py-2 text-xs text-muted-foreground">
        {t("diff.none")}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border border-y border-border">
      {diff.map((entry, index) => (
        <li
          key={`${entry.kind}-${entry.type}-${entry.name}-${index}`}
          className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs"
        >
          <ListBadge tone={TONE[entry.kind]}>
            {t(`diff.${entry.kind}`)}
          </ListBadge>
          <span className="font-mono">
            {entry.type} {entry.name}
          </span>
          {entry.before && (
            <span className="font-mono text-muted-foreground line-through">
              {entry.before}
            </span>
          )}
          {entry.after && <span className="font-mono">{entry.after}</span>}
        </li>
      ))}
    </ul>
  );
}
