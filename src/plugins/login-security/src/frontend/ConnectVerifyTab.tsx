import { useEffect, useMemo, useState, type ComponentType } from "react";
import { toast } from "sonner";
import {
  Button,
  LoadingState,
  NoticePanel,
  PANEL,
  PanelFrame,
  PanelShell,
  Segmented,
  challengeStepUp,
  listStepUpFactors,
  useSecondFactors,
  verifyStepUp,
} from "@termix-ssh/plugin-sdk/ui";
import {
  useTranslation,
  type TabProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";

function errorText(error: unknown, fallback: string): string {
  const message = (error as { message?: unknown })?.message;
  return typeof message === "string" && message ? message : fallback;
}

type StepUp = () => Promise<boolean>;

/**
 * Where a person proves a second factor before connecting to a host. Newer
 * cores ask in a prompt the shell owns, since the factor screens come from
 * other plugins and the code should never pass through this one.
 */
export function createConnectVerifyTab(
  app: TermixApp,
): ComponentType<TabProps> {
  const stepUp = (app as { stepUp?: StepUp }).stepUp;
  if (typeof stepUp !== "function") return ConnectVerifyTab;
  return function ShellConnectVerifyTab() {
    return <ShellVerify stepUp={stepUp} />;
  };
}

function ShellVerify({ stepUp }: { stepUp: StepUp }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function verify() {
    setBusy(true);
    try {
      if (await stepUp()) setDone(true);
    } catch (error) {
      toast.error(errorText(error, t("verify.failed")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PanelFrame>
      <PanelShell>
        {done ? (
          <NoticePanel title={t("verify.done")}>
            {t("verify.retry")}
          </NoticePanel>
        ) : (
          <div className={`flex max-w-sm flex-col gap-3 ${PANEL.body}`}>
            <p className="text-sm text-muted-foreground">{t("verify.intro")}</p>
            <div>
              <Button disabled={busy} onClick={() => void verify()}>
                {t("verify.start")}
              </Button>
            </div>
          </div>
        )}
      </PanelShell>
    </PanelFrame>
  );
}

/** The older flow: draws the factor screens itself, in the page. */
export function ConnectVerifyTab() {
  const { t } = useTranslation();
  const uis = useSecondFactors();
  const [ids, setIds] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    listStepUpFactors()
      .then((factors) => setIds(factors.map((factor) => factor.id)))
      .catch(() => setIds([]));
  }, []);

  const factors = useMemo(
    () => uis.filter((ui) => ids?.includes(ui.id)),
    [uis, ids],
  );
  const factor = factors.find((ui) => ui.id === picked) ?? factors[0];

  async function verify(body: Record<string, unknown>) {
    if (!factor) return;
    setBusy(true);
    try {
      await verifyStepUp(factor.id, body);
      setDone(true);
    } catch (error) {
      toast.error(errorText(error, t("verify.failed")));
    } finally {
      setBusy(false);
    }
  }

  let body;
  if (done) {
    body = (
      <NoticePanel title={t("verify.done")}>{t("verify.retry")}</NoticePanel>
    );
  } else if (ids === null) {
    body = <LoadingState />;
  } else if (!factor) {
    body = (
      <NoticePanel tone="warning" title={t("verify.noFactor")}>
        {t("verify.noFactorHint")}
      </NoticePanel>
    );
  } else {
    const Challenge = factor.component;
    body = (
      <div className={`flex max-w-sm flex-col gap-3 ${PANEL.body}`}>
        <p className="text-sm text-muted-foreground">{t("verify.intro")}</p>
        {factors.length > 1 && (
          <Segmented
            value={factor.id}
            onChange={setPicked}
            options={factors.map((entry) => ({
              value: entry.id,
              label: t(entry.titleKey),
            }))}
          />
        )}
        <Challenge
          key={factor.id}
          factorId={factor.id}
          rememberMe={false}
          disabled={busy}
          verify={verify}
          challenge={() => challengeStepUp(factor.id)}
          cancel={() => setPicked(null)}
        />
      </div>
    );
  }

  return (
    <PanelFrame>
      <PanelShell>{body}</PanelShell>
    </PanelFrame>
  );
}
