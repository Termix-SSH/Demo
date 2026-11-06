import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  PanelSearch,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { Target } from "../shared/types";
import { errorMessage, getTargets } from "./api";

/** Picks Termix hosts for the generated inventory. */
export function TargetPicker({
  hostId,
  selected,
  onChange,
}: {
  hostId: number;
  selected: number[];
  onChange: (ids: number[]) => void;
}) {
  const { t } = useTranslation();
  const [targets, setTargets] = useState<Target[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    getTargets(hostId)
      .then(setTargets)
      .catch((e) => setFailed(errorMessage(e, t("targets.failed"))));
  }, [hostId, t]);

  const needle = search.trim().toLowerCase();
  const visible = useMemo(
    () =>
      (targets ?? []).filter(
        (x) =>
          !needle ||
          x.name.toLowerCase().includes(needle) ||
          x.address.toLowerCase().includes(needle) ||
          x.folder.toLowerCase().includes(needle) ||
          x.tags.some((tag) => tag.toLowerCase().includes(needle)),
      ),
    [targets, needle],
  );
  const chosen = new Set(selected);

  const toggle = (id: number) =>
    onChange(
      chosen.has(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  const addVisible = () =>
    onChange([...new Set([...selected, ...visible.map((x) => x.id)])]);

  if (failed) return <p className="text-xs text-destructive">{failed}</p>;
  if (!targets) return <LoadingState />;

  return (
    <div className="flex flex-col border border-border">
      <ToolbarBand>
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("targets.search")}
          className="min-w-32 flex-1"
        />
        <Button variant="outline" size="sm" onClick={addVisible}>
          {t("targets.addShown")}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onChange([])}
          disabled={selected.length === 0}
        >
          {t("targets.clear")}
        </Button>
      </ToolbarBand>
      <div className="max-h-56 overflow-auto">
        {visible.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {t("targets.empty")}
          </p>
        ) : (
          visible.map((x) => (
            <label
              key={x.id}
              className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0 hover:bg-muted/40"
            >
              <Checkbox
                checked={chosen.has(x.id)}
                onCheckedChange={() => toggle(x.id)}
              />
              <span className="font-medium">{x.name}</span>
              <span className="text-muted-foreground">
                {[x.address, x.folder, ...x.tags].filter(Boolean).join(" | ")}
              </span>
            </label>
          ))
        )}
      </div>
      <p className="border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
        {t("targets.count", { count: selected.length })}
      </p>
    </div>
  );
}
