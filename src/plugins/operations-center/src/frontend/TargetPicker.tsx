import { useMemo, useState } from "react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Checkbox, Field, Input } from "@termix-ssh/plugin-sdk/ui";
import type { TargetSpec } from "../shared/types";
import type { CatalogAction } from "./api";
import { appliesTo, hostLabel, splitTags } from "./hosts";

/** Hosts picked one by one, plus every host with one of the tags. */
export function TargetPicker({
  action,
  value,
  onChange,
}: {
  action?: CatalogAction;
  value: TargetSpec;
  onChange: (next: TargetSpec) => void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const [query, setQuery] = useState("");
  const usable = useMemo(
    () => (action ? hosts.filter((host) => appliesTo(action, host)) : hosts),
    [action, hosts],
  );
  const picked = new Set(value.hostIds ?? []);
  const tags = value.tags ?? [];
  const allTags = [
    ...new Set(usable.flatMap((host) => splitTags(host.tags))),
  ].sort();
  const shown = usable.filter((host) =>
    hostLabel(host).toLowerCase().includes(query.trim().toLowerCase()),
  );
  const toggle = (id: number) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, hostIds: [...next] });
  };
  const toggleTag = (tag: string) =>
    onChange({
      ...value,
      tags: tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag],
    });
  const matched = usable.filter(
    (host) =>
      picked.has(Number(host.id)) ||
      splitTags(host.tags).some((tag) => tags.includes(tag)),
  ).length;

  return (
    <div className="flex flex-col gap-2">
      {allTags.length > 0 && (
        <Field label={t("targets.tags")}>
          <div className="flex flex-wrap gap-1">
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleTag(tag)}
                className={`border px-2 py-0.5 text-xs ${tags.includes(tag) ? "border-accent-brand text-accent-brand" : "border-border text-muted-foreground"}`}
              >
                {tag}
              </button>
            ))}
          </div>
        </Field>
      )}
      <Field
        label={t("targets.hosts")}
        hint={t("targets.count", { count: matched })}
      >
        <div className="flex flex-col gap-1">
          <Input
            value={query}
            placeholder={t("targets.search")}
            onChange={(event) => setQuery(event.target.value)}
          />
          <div className="flex max-h-56 flex-col overflow-auto border border-border">
            {shown.map((host) => (
              <label
                key={host.id}
                className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted"
              >
                <Checkbox
                  checked={picked.has(Number(host.id))}
                  onCheckedChange={() => toggle(Number(host.id))}
                />
                <span className="truncate">{hostLabel(host)}</span>
                <span className="ml-auto truncate text-muted-foreground">
                  {splitTags(host.tags).join(", ")}
                </span>
              </label>
            ))}
            {shown.length === 0 && (
              <p className="p-2 text-xs text-muted-foreground">
                {t("targets.none")}
              </p>
            )}
          </div>
        </div>
      </Field>
    </div>
  );
}
