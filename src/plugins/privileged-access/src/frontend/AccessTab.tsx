import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, KeyRound } from "lucide-react";
import {
  usePermission,
  usePluginApi,
  useToast,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  Facts,
  ListBadge,
  ListRow,
  LoadingState,
  NumberField,
  PANEL,
  PanelFrame,
  PanelList,
  PanelShell,
  SelectField,
  TabStrip,
  TextAreaField,
  TextField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import {
  createAccessApi,
  errorText,
  type AccessApi,
  type AccessRequest,
  type PrivilegedHost,
  type RequestScope,
  type RequestStatus,
} from "./api";

type View = "request" | "mine" | "pending" | "active" | "history";

const STATUS_KEY: Record<RequestStatus, string> = {
  pending: "status.pending",
  approved: "status.approved",
  denied: "status.denied",
  expired: "status.expired",
  revoked: "status.revoked",
  cancelled: "status.cancelled",
};

export function formatTime(iso: string | number | null): string {
  if (iso == null) return "--";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isActive(row: AccessRequest): boolean {
  return (
    row.status === "approved" &&
    !!row.expiresAt &&
    Date.parse(row.expiresAt) > Date.now()
  );
}

function RequestForm({
  api,
  hostId,
  onDone,
}: {
  api: AccessApi;
  hostId?: number;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [hosts, setHosts] = useState<PrivilegedHost[] | null>(null);
  const [picked, setPicked] = useState<string>(hostId ? String(hostId) : "");
  const [hours, setHours] = useState(1);
  const [reason, setReason] = useState("");
  const [ticket, setTicket] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api
      .hosts()
      .then((list) => {
        setHosts(list);
        setPicked((current) =>
          current && list.some((host) => String(host.id) === current)
            ? current
            : list[0]
              ? String(list[0].id)
              : "",
        );
      })
      .catch(() => setHosts([]));
  }, [api]);

  const host = hosts?.find((entry) => String(entry.id) === picked) ?? null;

  if (hosts === null) return <LoadingState />;
  if (hosts.length === 0) {
    return (
      <EmptyState
        icon={KeyRound}
        title={t("request.noHosts")}
        hint={t("request.noHostsHint")}
      />
    );
  }

  const submit = async () => {
    if (!host) return;
    setSaving(true);
    setError(null);
    try {
      await api.request({ hostId: host.id, hours, reason, ticket });
      toast.success(t("request.sent"));
      setReason("");
      setTicket("");
      onDone();
    } catch (err) {
      setError(errorText(err, t("request.failed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`flex max-w-xl flex-col gap-3 ${PANEL.body}`}>
      <SelectField
        label={t("request.host")}
        value={picked}
        onChange={setPicked}
        options={hosts.map((entry) => ({
          value: String(entry.id),
          label: entry.accessUntil
            ? t("request.hostWithAccess", {
                host: entry.name,
                until: formatTime(entry.accessUntil),
              })
            : entry.name,
        }))}
      />
      <NumberField
        label={t("request.hours")}
        value={hours}
        onChange={(value: number) =>
          setHours(Math.max(1, Math.min(host?.maxHours ?? 1, value || 1)))
        }
        min={1}
        max={host?.maxHours ?? 1}
        hint={t("request.hoursHint", { max: host?.maxHours ?? 1 })}
      />
      <TextAreaField
        label={
          host?.requireReason
            ? t("request.reason")
            : t("request.reasonOptional")
        }
        value={reason}
        onChange={setReason}
      />
      <TextField
        label={
          host?.requireTicket
            ? t("request.ticket")
            : t("request.ticketOptional")
        }
        value={ticket}
        onChange={setTicket}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div>
        <Button onClick={() => void submit()} disabled={saving || !host}>
          {t("request.send")}
        </Button>
      </div>
    </div>
  );
}

function RequestRows({
  rows,
  view,
  onApprove,
  onDeny,
  onEnd,
}: {
  rows: AccessRequest[];
  view: View;
  onApprove: (row: AccessRequest) => void;
  onDeny: (row: AccessRequest) => void;
  onEnd: (row: AccessRequest) => void;
}) {
  const { t } = useTranslation();
  return (
    <PanelList empty={<EmptyState icon={KeyRound} title={t("list.none")} />}>
      {rows.map((row, index) => {
        const active = isActive(row);
        return (
          <ListRow
            key={row.id}
            stripe={index}
            tone="muted"
            icon={<KeyRound />}
            title={row.hostName ?? `#${row.hostId}`}
            badges={
              <ListBadge className="ml-auto">
                {active ? t("status.active") : t(STATUS_KEY[row.status])}
              </ListBadge>
            }
            meta={
              <Facts>
                {view !== "mine" && <span>{row.username ?? row.userId}</span>}
                <span>{t("list.hours", { count: row.hours })}</span>
                {row.ticket && <span>{row.ticket}</span>}
                {row.reason && <span>{row.reason}</span>}
                {active ? (
                  <span>
                    {t("list.until", { time: formatTime(row.expiresAt) })}
                  </span>
                ) : (
                  <span>{formatTime(row.createdAt)}</span>
                )}
                {row.decidedByName && (
                  <span>
                    {t("list.decidedBy", { name: row.decidedByName })}
                  </span>
                )}
              </Facts>
            }
            trailing={
              <div className="flex items-center gap-1.5">
                {view === "pending" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onApprove(row);
                      }}
                    >
                      {t("list.approve")}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeny(row);
                      }}
                    >
                      {t("list.deny")}
                    </Button>
                  </>
                )}
                {(row.status === "pending" && view === "mine") || active ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEnd(row);
                    }}
                  >
                    {row.status === "pending"
                      ? t("list.cancel")
                      : t("list.endNow")}
                  </Button>
                ) : null}
              </div>
            }
          />
        );
      })}
    </PanelList>
  );
}

export function AccessTab({ hostId }: { hostId?: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const pluginApi = usePluginApi();
  const api = useMemo(() => createAccessApi(pluginApi), [pluginApi]);
  const canApprove = usePermission("approve");
  const [view, setView] = useState<View>(hostId ? "request" : "mine");
  const [rows, setRows] = useState<AccessRequest[]>([]);

  const scope: RequestScope | null =
    view === "mine"
      ? "mine"
      : view === "pending"
        ? "pending"
        : view === "active"
          ? "active"
          : view === "history"
            ? "all"
            : null;

  const load = useCallback(async () => {
    if (!scope) return;
    try {
      setRows(await api.list(scope));
    } catch {
      setRows([]);
      toast.error(t("list.loadError"));
    }
  }, [api, scope, t, toast]);

  useEffect(() => {
    setRows([]);
    void load();
    if (!scope) return;
    const timer = setInterval(() => void load(), 15_000);
    return () => clearInterval(timer);
  }, [load, scope]);

  const act = async (run: () => Promise<void>, done: string) => {
    try {
      await run();
      toast.success(done);
      void load();
    } catch (err) {
      toast.error(errorText(err, t("list.actionFailed")));
    }
  };

  const tabs = [
    { id: "request", label: t("tabs.request") },
    { id: "mine", label: t("tabs.mine") },
    ...(canApprove
      ? [
          { id: "pending", label: t("tabs.pending") },
          { id: "active", label: t("tabs.active") },
          { id: "history", label: t("tabs.history") },
        ]
      : []),
  ];

  const download = async () => {
    try {
      const blob = await api.report();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "privileged-access.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t("list.actionFailed"));
    }
  };

  return (
    <PanelFrame>
      <PanelShell
        icon={<KeyRound className="size-4" />}
        title={t("tab.title")}
        tabs={
          <TabStrip
            tabs={tabs}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
            trailing={
              view === "history" ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void download()}
                >
                  <Download className="size-3.5" />
                  {t("list.export")}
                </Button>
              ) : undefined
            }
          />
        }
      >
        {view === "request" ? (
          <RequestForm
            api={api}
            hostId={hostId}
            onDone={() => setView("mine")}
          />
        ) : (
          <RequestRows
            rows={rows}
            view={view}
            onApprove={(row) =>
              void (async () => {
                const ok = await confirm({
                  title: t("list.approveConfirm", {
                    user: row.username ?? row.userId,
                    host: row.hostName ?? row.hostId,
                    count: row.hours,
                  }),
                  confirmLabel: t("list.approve"),
                  destructive: false,
                });
                if (ok)
                  await act(() => api.approve(row.id), t("list.approved"));
              })()
            }
            onDeny={(row) =>
              void (async () => {
                const ok = await confirm({
                  title: t("list.denyConfirm"),
                  confirmLabel: t("list.deny"),
                });
                if (ok) await act(() => api.deny(row.id), t("list.denied"));
              })()
            }
            onEnd={(row) =>
              void (async () => {
                const ok = await confirm({
                  title:
                    row.status === "pending"
                      ? t("list.cancelConfirm")
                      : t("list.endConfirm"),
                  confirmLabel:
                    row.status === "pending"
                      ? t("list.cancel")
                      : t("list.endNow"),
                });
                if (ok) await act(() => api.end(row.id), t("list.ended"));
              })()
            }
          />
        )}
      </PanelShell>
    </PanelFrame>
  );
}
