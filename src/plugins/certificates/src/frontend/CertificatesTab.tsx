import { useCallback, useEffect, useState } from "react";
import { Bell, BellOff, ShieldCheck } from "lucide-react";
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
import type { ActionResult, CertStatus, CertView } from "../shared/types";
import {
  errorCode,
  errorMessage,
  errorOutput,
  getStatus,
  setWatch,
} from "./api";
import { CertDetail } from "./CertDetail";
import { CertsView } from "./CertsView";
import { InspectView } from "./InspectView";
import { IssueForm } from "./IssueForm";
import { Loading } from "./Loading";
import { RenewalView } from "./RenewalView";

type View = "certificates" | "inspect" | "renewal";
type Screen =
  { kind: "list" } | { kind: "cert"; cert: CertView } | { kind: "issue" };

export interface Runner {
  busy: boolean;
  /** Runs an action and shows its output. Answers true when it worked. */
  run: (
    title: string,
    work: () => Promise<ActionResult>,
    done: string,
  ) => Promise<boolean>;
}

/** Certificates on one host: the list, issuing, inspecting and renewal. */
export function CertificatesTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostId = Number(host?.id);
  const [status, setStatus] = useState<CertStatus | null>(null);
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("certificates");
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
      setResult({ title, ok: true, output: out.output });
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
  const icon = <ShieldCheck className="size-4" />;

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
  const canEdit = status.canEdit;
  const hasClient = !!status.certbot || !!status.acmesh;
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

  if (screen.kind === "cert") {
    return (
      <PanelFrame>
        <CertDetail
          key={screen.cert.key}
          hostId={hostId}
          cert={screen.cert}
          status={status}
          runner={runner}
          onBack={back}
        />
        {output}
      </PanelFrame>
    );
  }
  if (screen.kind === "issue") {
    return (
      <PanelFrame>
        <IssueForm
          hostId={hostId}
          status={status}
          runner={runner}
          onClose={back}
        />
        {output}
      </PanelFrame>
    );
  }

  const statusLine = [
    status.certbot ? `certbot ${status.certbot}` : "",
    status.acmesh ? `acme.sh ${status.acmesh}` : "",
    !hasClient ? t("tab.noClient") : "",
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
            {canEdit && hasClient && view === "certificates" && (
              <AddButton
                label={t("issue.add")}
                onClick={() => setScreen({ kind: "issue" })}
              />
            )}
          </>
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "certificates", label: t("tab.viewCertificates") },
              { id: "inspect", label: t("tab.viewInspect") },
              { id: "renewal", label: t("tab.viewRenewal") },
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
      >
        <div className="flex shrink-0 flex-col">
          {canEdit && !status.root && (
            <Alert className="border-x-0 border-t-0 text-xs">
              {t("tab.sudo")}
            </Alert>
          )}
          {view === "certificates" ? (
            <CertsView
              key={tick}
              hostId={hostId}
              status={status}
              runner={runner}
              isVisible={isVisible}
              onOpen={(cert) => setScreen({ kind: "cert", cert })}
            />
          ) : view === "inspect" ? (
            <InspectView hostId={hostId} status={status} />
          ) : (
            <RenewalView status={status} />
          )}
        </div>
      </PanelShell>
      {output}
    </PanelFrame>
  );
}
