import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, Earth } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Alert,
  Button,
  EmptyState,
  InlineView,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  ActionResult,
  ServerKind,
  Site,
  WebStatus,
} from "../shared/types";
import {
  errorCode,
  errorMessage,
  errorOutput,
  getStatus,
  setWatch,
} from "./api";
import { ConfigView } from "./ConfigView";
import { SERVER_LABEL } from "./format";
import { Loading } from "./Loading";
import { LogsView } from "./LogsView";
import { ServerView } from "./ServerView";
import { SiteEditor } from "./SiteEditor";
import { SitesView } from "./SitesView";

type View = "sites" | "config" | "logs" | "server";
type Screen = { kind: "list" } | { kind: "site"; site: Site | null };

export interface Runner {
  busy: boolean;
  /** Runs an action and shows its output. Answers true when it worked. */
  run: (
    title: string,
    work: () => Promise<ActionResult>,
    done: string,
  ) => Promise<boolean>;
  /** Shows text in the output view. */
  show: (title: string, ok: boolean, output: string) => void;
}

/** nginx, Apache and Caddy on one host: sites, config, logs and the service. */
export function WebServersTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<WebStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("sites");
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    title: string;
    ok: boolean;
    output: string;
  } | null>(null);

  const load = useCallback(async () => {
    if (!hostId) return;
    setLoading(true);
    try {
      setStatus(await getStatus(hostId));
      setError("");
    } catch (e) {
      setError(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
          : errorMessage(e, t("tab.error")),
      );
    } finally {
      setLoading(false);
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const run: Runner["run"] = async (title, work, done) => {
    setBusy(true);
    try {
      const out = await work();
      toast.success(done);
      if (out.output) setResult({ title, ok: true, output: out.output });
      return true;
    } catch (e) {
      const output = errorOutput(e);
      if (output) setResult({ title, ok: false, output });
      else
        toast.error(
          errorCode(e) === "sudo"
            ? t("tab.sudo")
            : errorMessage(e, t("actions.failed")),
        );
      return false;
    } finally {
      setBusy(false);
      void load();
      setTick((n) => n + 1);
    }
  };

  const toggleWatch = async () => {
    if (!status) return;
    const on = !status.watching;
    try {
      await setWatch(hostId, on);
      setStatus({ ...status, watching: on });
      toast.success(on ? t("watch.on") : t("watch.off"));
    } catch (e) {
      toast.error(errorMessage(e, t("watch.failed")));
    }
  };

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <Earth className="size-4" />;

  if (!status) {
    return (
      <PanelFrame>
        <PanelShell icon={icon} title={title}>
          {error ? (
            <p className="px-3 py-2 text-xs text-destructive">{error}</p>
          ) : (
            <Loading />
          )}
        </PanelShell>
      </PanelFrame>
    );
  }

  const runner: Runner = {
    busy,
    run,
    show: (title, ok, output) => setResult({ title, ok, output }),
  };
  const installed = status.servers.filter((s) => s.installed);
  const kinds = installed.map((s) => s.kind) as ServerKind[];
  const back = () => {
    setScreen({ kind: "list" });
    setTick((n) => n + 1);
  };

  const output = (
    <InlineView
      open={result !== null}
      onOpenChange={(open) => !open && setResult(null)}
      title={result?.title ?? ""}
      status={result ? (result.ok ? t("actions.ok") : t("actions.failed")) : ""}
      bare
    >
      <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
        {result?.output || t("actions.noOutput")}
      </pre>
    </InlineView>
  );

  if (screen.kind === "site") {
    return (
      <PanelFrame>
        <SiteEditor
          key={screen.site?.key ?? "new"}
          hostId={hostId}
          status={status}
          site={screen.site}
          runner={runner}
          onClose={back}
        />
        {output}
      </PanelFrame>
    );
  }

  const statusLine = [
    ...installed.map((s) => `${SERVER_LABEL[s.kind]} ${s.version}`.trim()),
    installed.length === 0 ? t("tab.noServer") : "",
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <>
            <RefreshButton
              onClick={() => {
                void load();
                setTick((n) => n + 1);
              }}
              loading={loading}
              label={t("tab.refresh")}
            />
            <Button
              variant="ghost"
              size="icon"
              title={status.watching ? t("watch.stop") : t("watch.start")}
              aria-label={status.watching ? t("watch.stop") : t("watch.start")}
              onClick={() => void toggleWatch()}
            >
              {status.watching ? (
                <BellOff className="size-4" />
              ) : (
                <Bell className="size-4" />
              )}
            </Button>
            {status.canEdit && kinds.length > 0 && view === "sites" && (
              <AddButton
                label={t("sites.add")}
                onClick={() => setScreen({ kind: "site", site: null })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "sites", label: t("tab.viewSites") },
              { id: "config", label: t("tab.viewConfig") },
              { id: "logs", label: t("tab.viewLogs") },
              { id: "server", label: t("tab.viewServer") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        <div className="flex shrink-0 flex-col">
          {status.canEdit && !status.root && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.sudo")}
            </Alert>
          )}
          {installed.length === 0 && view !== "server" ? (
            <EmptyState
              title={t("tab.noServer")}
              hint={t("tab.noServerHint")}
              action={
                <Button size="sm" onClick={() => setView("server")}>
                  {t("tab.openServer")}
                </Button>
              }
            />
          ) : view === "sites" ? (
            <SitesView
              key={tick}
              hostId={hostId}
              status={status}
              runner={runner}
              isVisible={isVisible}
              onOpen={(site) => setScreen({ kind: "site", site })}
            />
          ) : view === "config" ? (
            <ConfigView hostId={hostId} status={status} runner={runner} />
          ) : view === "logs" ? (
            <LogsView host={host} hostId={hostId} status={status} />
          ) : (
            <ServerView hostId={hostId} status={status} runner={runner} />
          )}
        </div>
      </PanelShell>
      {output}
    </PanelFrame>
  );
}
