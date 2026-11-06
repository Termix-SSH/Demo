import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, LoadingState } from "@termix-ssh/plugin-sdk/ui";
import {
  getResources,
  type CatalogAction,
  type CatalogResource,
  type ResourceRows,
} from "../api";
import { StateBadge } from "../parts";
import { useRunner } from "./ActionTile";

/**
 * A short table of one kind of thing on a host, like its containers, with
 * the one click row actions the plugin offers.
 */
export function ResourceTile({
  resource,
  actions,
  hostId,
  isVisible,
}: {
  resource: CatalogResource;
  /** Catalog actions on this host. */
  actions: CatalogAction[];
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<ResourceRows | null>(null);

  const load = useCallback(
    async (refresh = false, attempt = 0): Promise<void> => {
      const result = await getResources(resource.id, {
        hostIds: [hostId],
        refresh,
      }).catch(() => null);
      if (!result) return;
      setData(result);
      if (result.hosts[0]?.state === "loading" && attempt < 8)
        setTimeout(() => void load(false, attempt + 1), 2000);
    },
    [resource.id, hostId],
  );
  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const { run, busy } = useRunner(() => void load(true));
  const rowActions = actions.filter(
    (action) =>
      action.resource === resource.id &&
      action.scope === "resource" &&
      action.available &&
      action.inputs.every((field) => !field.required),
  );
  const state = data?.hosts[0]?.state;
  const columns = resource.columns
    .filter((column) => column.key !== resource.key)
    .slice(0, 2);

  if (!data || state === "loading")
    return <LoadingState compact label={t("state.loading")} />;
  if (state && state !== "ok")
    return (
      <p className="p-3 text-xs text-muted-foreground">
        {t(`state.${state}`, { defaultValue: state })}
      </p>
    );
  if (data.rows.length === 0)
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("tiles.noRows")}</p>
    );

  return (
    <ul className="flex flex-col">
      {data.rows.slice(0, 50).map((row) => {
        const status = resource.status ? row.row[resource.status] : undefined;
        return (
          <li
            key={row.key}
            className="group flex items-center gap-2 border-b border-border px-3 py-1.5 text-xs last:border-b-0"
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {String(row.row[resource.name] ?? row.key)}
            </span>
            {columns.map((column) => (
              <span
                key={column.key}
                className="hidden max-w-32 truncate text-muted-foreground md:inline"
              >
                {String(row.row[column.key] ?? "")}
              </span>
            ))}
            {status !== undefined && <StateBadge state={String(status)} />}
            <span className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
              {rowActions.slice(0, 3).map((action) => (
                <Button
                  key={action.id}
                  size="xs"
                  variant={
                    action.risk === "destructive" ? "destructive" : "ghost"
                  }
                  disabled={busy}
                  onClick={() =>
                    void run(action, { hostId, resourceKey: row.key })
                  }
                >
                  {action.title}
                </Button>
              ))}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
