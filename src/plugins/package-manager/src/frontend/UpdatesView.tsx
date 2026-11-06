import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpCircle, Package, RefreshCw, ShieldAlert } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { PackagesStatus, UpdateItem } from "../shared/types";
import { errorMessage, getUpdates } from "./api";
import type { Runner } from "./PackagesTab";

export function UpdatesView({
  hostId,
  status,
  runner,
  isVisible,
}: {
  hostId: number;
  status: PackagesStatus;
  runner: Runner;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<UpdateItem[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      setItems(await getUpdates(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("updates.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const sorted = useMemo(
    () =>
      [...(items ?? [])].sort(
        (a, b) =>
          Number(b.security) - Number(a.security) ||
          a.name.localeCompare(b.name),
      ),
    [items],
  );
  const needle = search.trim().toLowerCase();
  const visible = sorted.filter(
    (item) => !needle || item.name.toLowerCase().includes(needle),
  );
  const security = sorted.filter((item) => item.security).length;
  const canEdit = status.canEdit;
  const single = canEdit && status.singleUpdates;
  const disabled = !!runner.busy;

  const toggle = (name: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("updates.search")}
          className="min-w-40 flex-1"
        />
        {canEdit && (
          <>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void runner.run("refresh")}
            >
              <RefreshCw className="size-4" />
              {t("actions.refresh.label")}
            </Button>
            {single && picked.size > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={disabled}
                onClick={async () => {
                  if (await runner.run("update", [...picked])) {
                    setPicked(new Set());
                  }
                }}
              >
                {t("updates.updatePicked", { count: picked.size })}
              </Button>
            )}
            <Button
              size="sm"
              disabled={disabled || (items?.length ?? 0) === 0}
              onClick={() => void runner.run("upgrade-all")}
            >
              <ArrowUpCircle className="size-4" />
              {t("actions.upgrade-all.label")}
            </Button>
          </>
        )}
      </ToolbarBand>
      {items && items.length > 0 && (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {security > 0
            ? t("updates.countSecurity", { count: items.length, security })
            : t("updates.count", { count: items.length })}
        </p>
      )}
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !items ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {items.length === 0 ? t("updates.empty") : t("updates.noMatch")}
        </p>
      ) : (
        <PanelList>
          {visible.map((item, index) => (
            <ListRow
              key={item.name}
              stripe={index}
              icon={
                item.security ? (
                  <ShieldAlert className="size-4 text-warning" />
                ) : (
                  <Package className="size-4" />
                )
              }
              tone={item.security ? "warning" : "brand"}
              selected={picked.has(item.name)}
              leading={
                single ? (
                  <Checkbox
                    checked={picked.has(item.name)}
                    onCheckedChange={() => toggle(item.name)}
                    aria-label={t("updates.pick", { name: item.name })}
                  />
                ) : undefined
              }
              title={<span className="font-mono">{item.name}</span>}
              badges={
                item.security ? (
                  <ListBadge tone="warning">{t("updates.security")}</ListBadge>
                ) : undefined
              }
              meta={
                <span className="font-mono">
                  {item.current
                    ? `${item.current} → ${item.available}`
                    : item.available}
                  {item.repo ? ` | ${item.repo}` : ""}
                </span>
              }
              onClick={single ? () => toggle(item.name) : undefined}
              actions={
                single ? (
                  <ListRowAction
                    label={t("updates.updateOne")}
                    tone="brand"
                    disabled={disabled}
                    onClick={() => void runner.run("update", [item.name])}
                  >
                    <ArrowUpCircle className="size-4" />
                  </ListRowAction>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
