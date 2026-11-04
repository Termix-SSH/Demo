import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Bell, BellOff, BrickWall, RefreshCw } from "lucide-react";
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
  Segmented,
  SwitchRow,
  useConfirm,
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
function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full w-full min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
    </div>
  );
}

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

  if (!host)
    return (
      <p className="p-4 text-sm text-muted-foreground">{t("tab.noHost")}</p>
    );

  const title = label || host.name || t("tab.title");
  const icon = <BrickWall className="size-4" />;

  if (!status) {
    return (
      <Frame>
        <PanelShell icon={icon} title={title} className="gap-2 p-2.5">
          {error ? (
            <p className="p-2 text-sm text-destructive">{error}</p>
          ) : (
            <p className="p-2 text-xs text-muted-foreground">
              {t("common.loading")}
            </p>
          )}
        </PanelShell>
      </Frame>
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
    <Frame>
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => void load()}
              disabled={loading}
              title={t("tab.refresh")}
              aria-label={t("tab.refresh")}
              className="text-accent-brand"
            >
              <RefreshCw
                className={`size-4 ${loading ? "animate-spin" : ""}`}
              />
            </Button>
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
        toolbar={
          status.backend ? (
            <Segmented<View> value={view} onChange={setView} options={views} />
          ) : undefined
        }
        scroll
        className="gap-2 p-2.5"
      >
        <div className="flex shrink-0 flex-col gap-2">
          {status.pending && (
            <PendingBanner
              hostId={hostId}
              pending={status.pending}
              canEdit={status.canEdit}
              onDone={() => void load()}
            />
          )}
          {status.warnings.map((warning) => (
            <Alert key={warning} className="rounded-none">
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
              {status.active && status.canEdit && view === "rules" && (
                <TurnOff hostId={hostId} status={status} change={change} />
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
    </Frame>
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
    <div className="flex flex-col gap-2 border border-border p-2.5">
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
    <div className="flex justify-end">
      <Button
        size="sm"
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
    </div>
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
  if (failed) return <p className="p-2 text-sm text-destructive">{failed}</p>;
  if (text === null)
    return (
      <p className="p-2 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  return (
    <pre className="max-h-[70vh] overflow-auto border border-border bg-muted/30 p-2 font-mono text-xs whitespace-pre">
      {text || t("raw.empty")}
    </pre>
  );
}
