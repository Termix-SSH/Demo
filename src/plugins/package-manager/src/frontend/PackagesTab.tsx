import { useCallback, useEffect, useState } from "react";
import { Package } from "lucide-react";
import {
  useToast,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Alert,
  EmptyState,
  InlineView,
  NoticePanel,
  PanelFrame,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { PackageAction, PackagesStatus } from "../shared/types";
import {
  errorCode,
  errorMessage,
  errorOutput,
  getStatus,
  runAction,
} from "./api";
import { formatAgo } from "./format";
import { HistoryView } from "./HistoryView";
import { InstalledView } from "./InstalledView";
import { Loading } from "./Loading";
import { ReposView } from "./ReposView";
import { SearchView } from "./SearchView";
import { UpdatesView } from "./UpdatesView";

type View = "updates" | "installed" | "search" | "history" | "repos";

export interface Runner {
  /** The action running now, or empty. */
  busy: string;
  run: (action: PackageAction, packages?: string[]) => Promise<boolean>;
}

const DESTRUCTIVE = new Set<PackageAction>(["remove"]);
const ASK = new Set<PackageAction>(["upgrade-all", "install", "remove"]);

/** Packages on one host: updates, installed, search, history and repos. */
export function PackagesTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<PackagesStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("updates");
  const [loading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState("");
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
      const code = errorCode(e);
      setError(
        code === "disabled"
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

  const run = async (action: PackageAction, packages: string[] = []) => {
    const names = packages.join(", ");
    if (ASK.has(action)) {
      const ok = await confirm({
        title: t(`actions.${action}.confirm`, {
          names,
          count: packages.length,
        }),
        description: t(`actions.${action}.desc`, { names }),
        confirmLabel: t(`actions.${action}.label`),
        destructive: DESTRUCTIVE.has(action),
      });
      if (!ok) return false;
    }
    setBusy(action);
    const title = t(`actions.${action}.label`);
    try {
      const done = await runAction(hostId, action, packages);
      toast.success(t(`actions.${action}.done`, { names }));
      if (action !== "refresh" && action !== "hold" && action !== "unhold") {
        setResult({ title, ok: true, output: done.output });
      }
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
      setBusy("");
      void load();
      setTick((n) => n + 1);
    }
  };

  if (!host) return <EmptyState title={t("tab.noHost")} />;

  const title = label || host.name || t("tab.title");
  const icon = <Package className="size-4" />;

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

  const runner: Runner = { busy, run };
  const statusLine = [
    status.manager === "none" ? t("tab.noManager") : status.manager,
    status.os,
    status.indexUpdatedAt
      ? t("tab.indexAge", { ago: formatAgo(status.indexUpdatedAt) })
      : "",
    status.readOnly ? t("tab.readOnly") : "",
  ]
    .filter(Boolean)
    .join(" | ");

  const views: Array<{ id: View; label: string }> = [
    { id: "updates", label: t("tab.viewUpdates") },
    { id: "installed", label: t("tab.viewInstalled") },
    { id: "search", label: t("tab.viewSearch") },
    ...(status.manager === "apk"
      ? []
      : [{ id: "history" as View, label: t("tab.viewHistory") }]),
    { id: "repos", label: t("tab.viewRepos") },
  ];
  const current = views.some((v) => v.id === view) ? view : "updates";

  return (
    <PanelFrame>
      <PanelShell
        icon={icon}
        title={title}
        status={statusLine}
        actions={
          <RefreshButton
            onClick={() => {
              void load();
              setTick((n) => n + 1);
            }}
            loading={loading}
            label={t("tab.refresh")}
          />
        }
        tabs={
          status.manager !== "none" ? (
            <TabStrip
              tabs={views}
              activeTab={current}
              onTabChange={(id) => setView(id as View)}
            />
          ) : undefined
        }
      >
        <div className="flex shrink-0 flex-col">
          {status.rebootRequired && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.reboot")}
            </Alert>
          )}
          {status.canEdit && !status.root && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.sudo")}
            </Alert>
          )}
          {busy && (
            <p className="border-b border-border bg-accent-brand/5 px-3 py-2 text-xs">
              {t("actions.working", { action: t(`actions.${busy}.label`) })}
            </p>
          )}
          {status.manager === "none" ? (
            <NoticePanel icon={Package} title={t("tab.noManagerTitle")}>
              {t("tab.noManagerHint")}
            </NoticePanel>
          ) : current === "updates" ? (
            <UpdatesView
              key={tick}
              hostId={hostId}
              status={status}
              runner={runner}
              isVisible={isVisible}
            />
          ) : current === "installed" ? (
            <InstalledView
              key={tick}
              hostId={hostId}
              status={status}
              runner={runner}
              isVisible={isVisible}
            />
          ) : current === "search" ? (
            <SearchView hostId={hostId} status={status} runner={runner} />
          ) : current === "history" ? (
            <HistoryView key={tick} hostId={hostId} isVisible={isVisible} />
          ) : (
            <ReposView key={tick} hostId={hostId} isVisible={isVisible} />
          )}
        </div>
      </PanelShell>
      <InlineView
        open={result !== null}
        onOpenChange={(open) => !open && setResult(null)}
        title={result?.title ?? ""}
        status={
          result ? (result.ok ? t("actions.ok") : t("actions.failed")) : ""
        }
        bare
      >
        <pre className="whitespace-pre-wrap break-all px-3 py-2 font-mono text-xs">
          {result?.output || t("actions.noOutput")}
        </pre>
      </InlineView>
    </PanelFrame>
  );
}
