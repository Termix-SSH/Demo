import { useEffect, useMemo, useState } from "react";
import { useHosts, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Checkbox,
  FormFooter,
  InlineView,
  PanelSearch,
} from "@termix-ssh/plugin-sdk/ui";
import { addHosts, errorMessage } from "./api";

/** One host monitor per picked host. */
export function AddFromHosts({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setPicked(new Set());
      setError("");
    }
  }, [open]);

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return hosts.filter((host) =>
      `${host.name} ${host.ip}`.toLowerCase().includes(needle),
    );
  }, [hosts, query]);

  const toggle = (id: number) =>
    setPicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    setSaving(true);
    try {
      await addHosts([...picked]);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("editor.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <InlineView
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={t("list.addHosts")}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saveLabel={t("hosts.add", { count: picked.size })}
          cancelLabel={t("common.cancel")}
          saving={saving}
          disabled={picked.size === 0}
          status={
            error ? <span className="text-destructive">{error}</span> : null
          }
        />
      }
    >
      <div className="flex flex-col gap-2 p-3">
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder={t("list.search")}
        />
        {shown.map((host) => {
          const id = Number(host.id);
          return (
            <label
              key={id}
              className="flex cursor-pointer items-center gap-2 py-1 text-sm"
            >
              <Checkbox
                checked={picked.has(id)}
                onCheckedChange={() => toggle(id)}
              />
              <span className="truncate">{String(host.name || host.ip)}</span>
              <span className="truncate text-xs text-muted-foreground">
                {String(host.ip ?? "")}
              </span>
            </label>
          );
        })}
      </div>
    </InlineView>
  );
}
