import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, BrickWall } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  AlertDescription,
  Button,
  PanelShell,
  SwitchRow,
  useConfirm,
  EmptyState,
  PanelFrame,
  RefreshButton,
  TabStrip,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { FirewallStatus, Rule, RuleSpec } from "../shared/types";
import {
  addRule,
  disable,
  enable,
  errorCode,
  errorMessage,
  getRaw,
  getStatus,
  getWatch,
  install,
  setWatch,
  updateRule,
} from "./api";
import { DefaultsView } from "./DefaultsView";
import { Fail2banView } from "./Fail2banView";
import { PendingBanner } from "./PendingBanner";
import { RuleEditor } from "./RuleEditor";
import { RulesView } from "./RulesView";
import { useChange } from "./useChange";

type View = "rules" | "defaults" | "fail2ban" | "raw";

const BACKEND_NAMES: Record<string, string> = {
  ufw: "UFW",
  firewalld: "firewalld",
  nftables: "nftables",
  iptables: "iptables",
};

// A fixed height box, so the panel body inside it can scroll.
/** Firewall rules, defaults, Fail2ban and the raw view for one host. */
export function FirewallTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<FirewallStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("rules");
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const [watched, setWatched] = useState(false);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      const code = errorCode(e);
      setError(
        code === "sudo"
          ? t("tab.sudo")
          : code === "disabled"
            ? t("tab.disabled")
            : errorMessage(e, t("tab.error")),
      );
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  const change = useChange(load);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    void getWatch(hostId)
      .then(setWatched)
      .catch(() => undefined);
  }, [isVisible, load, hostId]);

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <BrickWall className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <LoadingState label={t("common.loading")} />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const backendName = status.backend ? BACKEND_NAMES[status.backend] : "";
  const views: Array<{ value: View; label: string }> = [
    { value: "rules", label: t("tab.viewRules") },
    {
      value: "defaults",
      label:
        status.backend === "firewalld"
          ? t("tab.viewZones")
          : t("tab.viewDefaults"),
    },
    { value: "fail2ban", label: t("tab.viewFail2ban") },
    { value: "raw", label: t("tab.viewRaw") },
  ];
  const statusLine = [
    status.backend
      ? `${backendName} ${status.version.replace(/^[a-z ]*?(\d)/i, "$1")}`.trim()
      : t("tab.noFirewall"),
    status.backend ? (status.active ? t("tab.on") : t("tab.off")) : "",
    status.backend ? t("tab.ruleCount", { count: status.rules.length }) : "",
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const toggleWatch = async () => {
    try {
      await setWatch(hostId, !watched);
      setWatched(!watched);
    } catch {
      // The button stays as it was.
    }
  };

  const saveRule = (spec: RuleSpec, zone?: string) =>
    change.run(
      (force) =>
        editing && editing !== "new"
          ? updateRule(hostId, editing.id, { ...spec, force })
          : addRule(hostId, { ...spec, zone, force }),
      editing && editing !== "new" ? t("rules.saved") : t("rules.added"),
    );

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void toggleWatch()}
              title={watched ? t("watch.stop") : t("watch.start")}
              aria-label={watched ? t("watch.stop") : t("watch.start")}
            >
              {watched ? (
                <Bell className="size-4 text-accent-brand" />
              ) : (
                <BellOff className="size-4" />
              )}
            </Button>
            <RefreshButton
              onClick={() => void load()}
              loading={loading}
              label={t("tab.refresh")}
            />
            {status.backend &&
              status.active &&
              status.canEdit &&
              view === "rules" && (
                <TurnOff hostId={hostId} status={status} change={change} />
              )}
            {status.backend &&
              status.canEdit &&
              !status.pending &&
              view === "rules" && (
                <AddButton
                  label={t("rules.add")}
                  onClick={() => setEditing("new")}
                />
              )}
          </>
        }
        tabs={
          status.backend ? (
            <TabStrip
              tabs={views.map((o) => ({ id: o.value, label: o.label }))}
              activeTab={view}
              onTabChange={(id) => setView(id as View)}
            />
          ) : undefined
        }
        scroll={view !== "raw"}
      >
        <div
          className={`flex flex-col ${view === "raw" ? "min-h-0 flex-1" : "shrink-0"}`}
        >
          {status.pending && (
            <PendingBanner
              hostId={hostId}
              pending={status.pending}
              canEdit={status.canEdit}
              onDone={() => void load()}
            />
          )}
          {status.warnings.map((warning) => (
            <Alert key={warning} className="border-x-0 border-t-0">
              <AlertDescription className="text-xs">{warning}</AlertDescription>
            </Alert>
          ))}
          {!status.backend ? (
            <SetupView hostId={hostId} status={status} onDone={load} />
          ) : (
            <>
              {!status.active && view === "rules" && (
                <TurnOn hostId={hostId} status={status} change={change} />
              )}
              {view === "rules" ? (
                <RulesView
                  hostId={hostId}
                  status={status}
                  change={change}
                  onEdit={setEditing}
                />
              ) : view === "defaults" ? (
                <DefaultsView
                  key={JSON.stringify(status.defaults)}
                  hostId={hostId}
                  status={status}
                  change={change}
                />
              ) : view === "fail2ban" ? (
                <Fail2banView
                  hostId={hostId}
                  canEdit={status.canEdit}
                  isVisible={isVisible}
                  packageManager={status.packageManager}
                  onChanged={() => void load()}
                />
              ) : (
                <RawView hostId={hostId} isVisible={isVisible} />
              )}
            </>
          )}
        </div>
      </PanelShell>
      {editing && status.backend && (
        <RuleEditor
          rule={editing === "new" ? null : editing}
          backend={status.backend}
          zones={status.zones}
          defaultZone={status.defaultZone}
          busy={change.busy}
          onClose={() => setEditing(null)}
          onSave={saveRule}
        />
      )}
    </PanelFrame>
  );
}

function TurnOn({
  hostId,
  status,
  change,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
}) {
  const { t } = useTranslation();
  const [allowSsh, setAllowSsh] = useState(true);
  const ports = status.ssh.ports.join(", ") || "22";
  return (
    <div className="flex flex-col gap-2 border-b border-border p-3">
      <p className="text-sm">{t("enable.off")}</p>
      {status.canEdit && !status.pending && (
        <>
          <SwitchRow
            label={t("enable.allowSsh", { ports })}
            description={t("enable.allowSshHint")}
            checked={allowSsh}
            onChange={setAllowSsh}
          />
          <div>
            <Button
              size="sm"
              disabled={change.busy}
              onClick={() =>
                void change.run(
                  (force) => enable(hostId, { allowSsh, force }),
                  t("enable.done"),
                )
              }
            >
              {t("enable.button")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("enable.timerHint")}
          </p>
        </>
      )}
    </div>
  );
}

function TurnOff({
  hostId,
  status,
  change,
}: {
  hostId: number;
  status: FirewallStatus;
  change: ReturnType<typeof useChange>;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  if (status.pending) return null;
  return (
    <Button
      variant="ghost"
      disabled={change.busy}
      onClick={async () => {
        const ok = await confirm({
          title: t("disable.title"),
          description: t("disable.description"),
          confirmLabel: t("disable.button"),
        });
        if (ok) await change.run(() => disable(hostId), t("disable.done"));
      }}
    >
      {t("disable.button")}
    </Button>
  );
}

const INSTALL_FOR: Record<string, string[]> = {
  "apt-get": ["ufw", "firewalld", "nftables"],
  dnf: ["firewalld", "nftables"],
  yum: ["firewalld", "nftables"],
  zypper: ["firewalld", "ufw", "nftables"],
  pacman: ["ufw", "firewalld", "nftables"],
  apk: ["ufw", "nftables"],
};

function SetupView({
  hostId,
  status,
  onDone,
}: {
  hostId: number;
  status: FirewallStatus;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState("");
  const options = INSTALL_FOR[status.packageManager] ?? [];
  const run = async (what: string) => {
    setBusy(what);
    try {
      await install(hostId, what);
      toast.success(t("install.done", { name: BACKEND_NAMES[what] ?? what }));
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    } finally {
      setBusy("");
      await onDone();
    }
  };
  return (
    <div className="flex flex-col items-start gap-2 p-2">
      <p className="text-sm">{t("install.none")}</p>
      {!status.canEdit ? null : options.length ? (
        <>
          <p className="text-xs text-muted-foreground">{t("install.hint")}</p>
          <div className="flex flex-wrap gap-2">
            {options.map((what) => (
              <Button
                key={what}
                size="sm"
                variant={what === options[0] ? "default" : "outline"}
                disabled={!!busy}
                onClick={() => void run(what)}
              >
                {busy === what
                  ? t("install.working")
                  : t("install.button", { name: BACKEND_NAMES[what] ?? what })}
              </Button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          {t("install.noPackageManager")}
        </p>
      )}
    </div>
  );
}

function RawView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  useEffect(() => {
    if (!isVisible) return;
    getRaw(hostId)
      .then((out) => {
        setText(out);
        setFailed("");
      })
      .catch((e) => setFailed(errorMessage(e, t("tab.error"))));
  }, [hostId, isVisible, t]);
  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (text === null) return <LoadingState label={t("common.loading")} />;
  return (
    <pre className="min-h-0 flex-1 overflow-auto px-3 py-2 font-mono text-xs whitespace-pre thin-scrollbar">
      {text || t("raw.empty")}
    </pre>
  );
}
