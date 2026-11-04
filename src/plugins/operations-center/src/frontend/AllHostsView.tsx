import { useCallback, useEffect, useMemo, useState } from "react";
import {
  useHosts,
  useToast,
  useTranslation,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  Checkbox,
  EmptyState,
  Input,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { RefreshCw, Table2 } from "lucide-react";
import {
  errorText,
  getResources,
  runAction,
  type CatalogAction,
  type CatalogResource,
  type ResourceRows,
} from "./api";
import { hostLabel } from "./hosts";
import { Choice, StateBadge } from "./parts";

const CONCURRENT = 4;

function cell(value: unknown, type?: string): string {
  if (value === null || value === undefined) return "";
  if (type === "percent" && typeof value === "number") return `${value}%`;
  if (type === "bytes" && typeof value === "number") {
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit++;
    }
    return `${size.toFixed(unit ? 1 : 0)} ${units[unit]}`;
  }
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** One kind of thing across every host, such as every container. */
export function AllHostsView({
  resources,
  actions,
  initialResource,
  shell,
}: {
  resources: CatalogResource[];
  actions: CatalogAction[];
  initialResource?: string;
  shell: ShellApi;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const { hosts } = useHosts();
  const [resourceId, setResourceId] = useState(
    initialResource && resources.some((entry) => entry.id === initialResource)
      ? initialResource
      : (resources[0]?.id ?? ""),
  );
  const resource = resources.find((entry) => entry.id === resourceId);
  const [data, setData] = useState<ResourceRows | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const hostName = (id: number) => {
    const host = hosts.find((entry) => Number(entry.id) === id);
    return host ? hostLabel(host) : String(id);
  };

  const load = useCallback(
    async (refresh = false) => {
      if (!resourceId) return;
      try {
        setData(await getResources(resourceId, { refresh }));
      } catch (error) {
        toast.error(errorText(error, t("allHosts.failed")));
      }
    },
    [resourceId, t, toast],
  );

  useEffect(() => {
    setData(null);
    setSelected(new Set());
    void load();
  }, [load]);

  // Poll quickly while hosts are still answering, slowly after.
  const loading = data?.hosts.some((host) => host.state === "loading") ?? true;
  useEffect(() => {
    const timer = setInterval(() => void load(), loading ? 2000 : 30000);
    return () => clearInterval(timer);
  }, [load, loading]);

  const rowKey = (row: { hostId: number; key: string }) =>
    `${row.hostId}|${row.key}`;
  const statuses = useMemo(() => {
    if (!resource?.status || !data) return [];
    return [
      ...new Set(
        data.rows.map((row) => String(row.row[resource.status!] ?? "")),
      ),
    ]
      .filter(Boolean)
      .sort();
  }, [data, resource]);

  const rows = useMemo(() => {
    if (!data || !resource) return [];
    const text = query.trim().toLowerCase();
    return data.rows.filter((row) => {
      if (status && String(row.row[resource.status ?? ""] ?? "") !== status) {
        return false;
      }
      if (!text) return true;
      return (
        hostName(row.hostId).toLowerCase().includes(text) ||
        Object.values(row.row).some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(text),
        )
      );
    });
    // hostName reads hosts, which are a dependency through it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, resource, query, status, hosts]);

  const bulk = actions.filter(
    (action) => action.resource === resourceId && action.scope === "resource",
  );

  const runOn = async (action: CatalogAction) => {
    const targets = rows.filter((row) => selected.has(rowKey(row)));
    if (targets.length === 0) return;
    const ok = await confirm({
      title: action.title,
      description: t("allHosts.confirm", { count: targets.length }),
      confirmLabel: t("run.run"),
      destructive: action.risk === "destructive",
    });
    if (!ok) return;
    setBusy(true);
    let failed = 0;
    let waiting = 0;
    const queue = [...targets];
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        try {
          const outcome = await runAction(action.id, {
            hostId: next.hostId,
            resourceKey: next.key,
            confirmed: true,
          });
          if (outcome.status === "pending_approval") waiting++;
          else if (outcome.status !== "success") failed++;
        } catch {
          failed++;
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENT }, worker));
    setBusy(false);
    setSelected(new Set());
    if (failed) toast.error(t("allHosts.someFailed", { count: failed }));
    else if (waiting) toast.info(t("allHosts.waiting", { count: waiting }));
    else toast.success(t("allHosts.done", { count: targets.length }));
    await load();
  };

  const openOnHost = (hostId: number) => {
    const host = hosts.find((entry) => Number(entry.id) === hostId);
    if (!host) return;
    shell.openTab(host as never, "host", {
      data: { section: resource?.tab },
    });
  };

  if (resources.length === 0) {
    return (
      <EmptyState
        icon={Table2}
        title={t("allHosts.none")}
        hint={t("allHosts.noneHint")}
      />
    );
  }

  const allShown =
    rows.length > 0 && rows.every((row) => selected.has(rowKey(row)));
  const problems = (data?.hosts ?? []).filter(
    (host) => host.state === "error" || host.state === "offline",
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Choice
          label={t("allHosts.kind")}
          value={resourceId}
          onChange={setResourceId}
          options={resources.map((entry) => ({
            value: entry.id,
            label: entry.title,
          }))}
        />
        <Input
          className="w-48"
          value={query}
          placeholder={t("allHosts.search")}
          onChange={(event) => setQuery(event.target.value)}
        />
        {statuses.length > 0 && (
          <Choice
            label={t("allHosts.status")}
            value={status}
            onChange={setStatus}
            options={[
              { value: "", label: t("allHosts.anyStatus") },
              ...statuses.map((value) => ({ value, label: value })),
            ]}
          />
        )}
        <Button
          variant="ghost"
          size="icon"
          title={t("allHosts.refresh")}
          onClick={() => void load(true)}
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
        <span className="text-xs text-muted-foreground">
          {t("allHosts.count", {
            rows: rows.length,
            hosts:
              data?.hosts.filter((host) => host.state === "ok").length ?? 0,
          })}
        </span>
      </div>

      {selected.size > 0 && bulk.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border border-border p-2 text-xs">
          <span>{t("allHosts.selected", { count: selected.size })}</span>
          {bulk.map((action) => (
            <Button
              key={action.id}
              size="sm"
              variant={
                action.risk === "destructive" ? "destructive" : "outline"
              }
              disabled={busy}
              onClick={() => void runOn(action)}
            >
              {action.title}
            </Button>
          ))}
        </div>
      )}

      {problems.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {problems
            .map(
              (host) =>
                `${hostName(host.hostId)}: ${host.state === "offline" ? t("state.offline") : (host.error ?? t("state.error"))}`,
            )
            .join(" | ")}
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto border border-border">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-background">
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="w-8 p-2">
                <Checkbox
                  checked={allShown}
                  onCheckedChange={() =>
                    setSelected(
                      allShown ? new Set() : new Set(rows.map(rowKey)),
                    )
                  }
                />
              </th>
              <th className="p-2 font-medium">{t("allHosts.name")}</th>
              <th className="p-2 font-medium">{t("allHosts.host")}</th>
              {resource?.status && (
                <th className="p-2 font-medium">{t("allHosts.status")}</th>
              )}
              {resource?.columns.map((column) => (
                <th key={column.key} className="p-2 font-medium">
                  {column.title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className="border-b border-border/60 hover:bg-muted/50"
              >
                <td className="p-2">
                  <Checkbox
                    checked={selected.has(rowKey(row))}
                    onCheckedChange={() => {
                      const next = new Set(selected);
                      if (next.has(rowKey(row))) next.delete(rowKey(row));
                      else next.add(rowKey(row));
                      setSelected(next);
                    }}
                  />
                </td>
                <td className="p-2 font-medium">
                  {String(row.row[resource?.name ?? "name"] ?? row.key)}
                </td>
                <td className="p-2">
                  <button
                    type="button"
                    className="text-accent-brand hover:underline"
                    onClick={() => openOnHost(row.hostId)}
                  >
                    {hostName(row.hostId)}
                  </button>
                </td>
                {resource?.status && (
                  <td className="p-2">
                    <StateBadge
                      state={String(row.row[resource.status] ?? "")}
                    />
                  </td>
                )}
                {resource?.columns.map((column) => (
                  <td key={column.key} className="max-w-64 truncate p-2">
                    {cell(row.row[column.key], column.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="p-4 text-center text-xs text-muted-foreground">
            {loading ? t("allHosts.loading") : t("allHosts.empty")}
          </p>
        )}
      </div>
    </div>
  );
}
