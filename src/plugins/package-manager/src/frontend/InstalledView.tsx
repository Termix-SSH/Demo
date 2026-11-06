import { useCallback, useEffect, useState } from "react";
import { Lock, LockOpen, Package, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  Pager,
  PanelList,
  PanelSearch,
  Segmented,
  usePaged,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { InstalledItem, PackagesStatus } from "../shared/types";
import { errorMessage, getInstalled } from "./api";
import { formatBytes } from "./format";
import type { Runner } from "./PackagesTab";

type Filter = "all" | "held";
const PAGE = 100;

export function InstalledView({
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
  const [items, setItems] = useState<InstalledItem[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  const load = useCallback(async () => {
    try {
      setItems(await getInstalled(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("installed.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const needle = search.trim().toLowerCase();
  const visible = (items ?? []).filter(
    (item) =>
      (filter === "all" || item.held) &&
      (!needle ||
        item.name.toLowerCase().includes(needle) ||
        item.summary.toLowerCase().includes(needle)),
  );
  const { rows, page, pages, setPage } = usePaged(
    visible,
    PAGE,
    `${needle}|${filter}`,
  );
  const held = (items ?? []).filter((item) => item.held).length;
  const canEdit = status.canEdit;
  const disabled = !!runner.busy;

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("installed.search")}
          className="min-w-40 flex-1"
        />
        {status.holds && (
          <Segmented<Filter>
            value={filter}
            onChange={setFilter}
            options={[
              {
                value: "all",
                label: t("installed.all"),
                count: items?.length,
              },
              { value: "held", label: t("installed.held"), count: held },
            ]}
          />
        )}
      </ToolbarBand>
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !items ? (
        <LoadingState />
      ) : visible.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("installed.empty")}
        </p>
      ) : (
        <>
          <PanelList>
            {rows.map((item, index) => (
              <ListRow
                key={item.name}
                stripe={index}
                icon={<Package className="size-4" />}
                title={<span className="font-mono">{item.name}</span>}
                badges={
                  item.held ? (
                    <ListBadge tone="warning">
                      {t("installed.heldBadge")}
                    </ListBadge>
                  ) : undefined
                }
                meta={[item.version, formatBytes(item.size), item.summary]
                  .filter(Boolean)
                  .join(" | ")}
                actions={
                  canEdit ? (
                    <>
                      {status.holds && (
                        <ListRowAction
                          label={
                            item.held
                              ? t("actions.unhold.label")
                              : t("actions.hold.label")
                          }
                          disabled={disabled}
                          onClick={() =>
                            void runner.run(item.held ? "unhold" : "hold", [
                              item.name,
                            ])
                          }
                        >
                          {item.held ? (
                            <LockOpen className="size-4" />
                          ) : (
                            <Lock className="size-4" />
                          )}
                        </ListRowAction>
                      )}
                      <ListRowAction
                        label={t("actions.remove.label")}
                        tone="destructive"
                        disabled={disabled}
                        onClick={() => void runner.run("remove", [item.name])}
                      >
                        <Trash2 className="size-4" />
                      </ListRowAction>
                    </>
                  ) : undefined
                }
              />
            ))}
          </PanelList>
          <Pager page={page} pages={pages} onPage={setPage} />
        </>
      )}
    </div>
  );
}
