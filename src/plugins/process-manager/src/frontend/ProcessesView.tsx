import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, ListTree, Plus } from "lucide-react";
import {
  useToast,
  useTranslation,
  type PluginHostRecord,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  PanelList,
  PanelSearch,
  Pager,
  StatTile,
  TileWall,
  usePaged,
  ToolbarBand,
  ToolbarSelect,
} from "@termix-ssh/plugin-sdk/ui";
import type { ProcessList, ProcessRow, StatusView } from "../shared/types";
import { addWatch, errorMessage, getProcesses } from "./api";
import {
  bytes,
  filterRows,
  processTone,
  sortRows,
  span,
  stateOf,
  treeRows,
  type SortKey,
} from "./format";
import { ProcessDetail } from "./ProcessDetail";

const POLL_MS = 5_000;
const PAGE = 100;

/** The live process list with a tree view, sorting and filtering. */
export function ProcessesView({
  host,
  status,
  isVisible,
}: {
  host: PluginHostRecord;
  status: StatusView;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostId = Number(host.id);
  const [list, setList] = useState<ProcessList | null>(null);
  const [failed, setFailed] = useState("");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<SortKey>("cpu");
  const [tree, setTree] = useState(false);
  const [open, setOpen] = useState<ProcessRow | null>(null);

  const load = useCallback(async () => {
    try {
      setList(await getProcesses(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("list.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    // Stop polling while a detail is open on top, it has its own refresh.
    if (open) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [isVisible, load, open]);

  const rows = useMemo(() => {
    const filtered = filterRows(list?.processes ?? [], filter);
    return tree
      ? treeRows(filtered)
      : sortRows(filtered, sort).map((proc) => ({ proc, depth: 0 }));
  }, [list, filter, sort, tree]);
  const paged = usePaged(rows, PAGE, `${filter}|${sort}|${tree}`);

  const watch = async (p: ProcessRow) => {
    try {
      await addWatch(hostId, {
        kind: "process",
        target: p.command,
        rule: "down",
      });
      toast.success(t("watches.added"));
    } catch (e) {
      toast.error(errorMessage(e, t("watches.addFailed")));
    }
  };

  const totalCpu = (list?.processes ?? []).reduce((sum, p) => sum + p.cpu, 0);
  const load1 = list?.load[0] ?? 0;

  return (
    <div className="flex min-h-0 flex-col">
      <TileWall size="4">
        <StatTile
          label={t("list.processes")}
          icon={<Activity className="size-3.5" />}
          value={String(list?.processes.length ?? "-")}
        />
        <StatTile
          label={t("list.cpu")}
          value={`${Math.min(100 * (list?.cpus ?? 1), totalCpu).toFixed(0)}`}
          unit="%"
          tone={totalCpu > 80 * (list?.cpus ?? 1) ? "warn" : "default"}
        />
        <StatTile
          label={t("list.load")}
          value={load1.toFixed(2)}
          hint={list?.load.map((n) => n.toFixed(2)).join(" ")}
          tone={load1 > (list?.cpus ?? 1) ? "warn" : "default"}
        />
        <StatTile
          label={t("list.zombies")}
          value={String(list?.zombies ?? "-")}
          tone={list && list.zombies > 0 ? "warn" : "default"}
        />
      </TileWall>
      <ToolbarBand>
        <PanelSearch
          value={filter}
          onChange={setFilter}
          placeholder={t("list.search")}
          className="min-w-40 flex-1"
        />
        <ToolbarSelect
          value={sort}
          disabled={tree}
          onChange={setSort}
          label={t("list.sort")}
          options={[
            { value: "cpu", label: t("list.sortCpu") },
            { value: "mem", label: t("list.sortMem") },
            { value: "pid", label: t("list.sortPid") },
            { value: "age", label: t("list.sortAge") },
          ]}
        />
        <Button
          variant={tree ? "default" : "ghost"}
          size="sm"
          onClick={() => setTree((v) => !v)}
        >
          <ListTree className="size-4" />
          {t("list.tree")}
        </Button>
      </ToolbarBand>
      {failed && <p className="px-3 py-2 text-xs text-destructive">{failed}</p>}
      {!status.psOk && (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {t("list.noPs")}
        </p>
      )}
      <PanelList
        empty={
          <p className="p-3 text-xs text-muted-foreground">
            {list ? t("list.empty") : t("tab.loading")}
          </p>
        }
      >
        {paged.rows.map(({ proc: p, depth }, index) => (
          <ListRow
            key={p.pid}
            stripe={index}
            tone={processTone(p)}
            icon={<Activity className="size-3.5" />}
            title={
              <span
                className="font-mono text-xs"
                style={
                  depth ? { paddingLeft: `${depth * 0.75}rem` } : undefined
                }
              >
                {p.command}
              </span>
            }
            badges={
              <>
                <ListBadge tone="muted">{p.pid}</ListBadge>
                {stateOf(p.stat) !== "sleeping" &&
                  stateOf(p.stat) !== "running" && (
                    <ListBadge
                      tone={
                        stateOf(p.stat) === "zombie" ? "destructive" : "warning"
                      }
                    >
                      {t(`state.${stateOf(p.stat)}`)}
                    </ListBadge>
                  )}
              </>
            }
            meta={
              <span title={p.args}>
                {`${p.user} | ${p.cpu.toFixed(1)}% | ${p.mem.toFixed(1)}% ${t("list.mem")} | ${bytes(p.rss * 1024)} | ${span(p.age)}`}
              </span>
            }
            onClick={() => setOpen(p)}
            trailing={
              status.canEdit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  title={t("watches.watchThis")}
                  onClick={(e) => {
                    e.stopPropagation();
                    void watch(p);
                  }}
                >
                  <Plus className="size-4" />
                </Button>
              ) : undefined
            }
          />
        ))}
      </PanelList>
      {paged.pages > 1 && (
        <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />
      )}
      {open && (
        <ProcessDetail
          host={host}
          row={open}
          canEdit={status.canEdit}
          isVisible={isVisible}
          onClose={() => setOpen(null)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}
