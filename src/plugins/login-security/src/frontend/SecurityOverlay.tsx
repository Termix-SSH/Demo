import { useEffect, useRef, useState } from "react";
import {
  useTranslation,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AuthEnrollmentSections,
  Button,
  getUserInfo,
  logoutUser,
} from "@termix-ssh/plugin-sdk/ui";
import { ACTIVITY_EVENTS, readLastActive, writeLastActive } from "./idle";

const SETUP = "second-factor-setup";
const CHECK_MS = 15_000;
const HEARTBEAT_MS = 60_000;
const SETUP_POLL_MS = 5_000;

async function signOut() {
  await logoutUser().catch(() => {});
  window.location.reload();
}

async function needsSetup(): Promise<boolean> {
  const info = (await getUserInfo().catch(() => null)) as {
    restriction?: string | null;
  } | null;
  return info?.restriction === SETUP;
}

function useIdleSignOut(app: TermixApp, idleMinutes: number) {
  const last = useRef(0);
  useEffect(() => {
    if (idleMinutes <= 0) return;
    const limit = idleMinutes * 60_000;
    last.current = Date.now();
    writeLastActive(last.current);
    let lastWrite = 0;
    let lastBeat = Date.now();

    const mark = () => {
      const now = Date.now();
      last.current = now;
      if (now - lastWrite > 5_000) {
        lastWrite = now;
        writeLastActive(now);
      }
    };
    const check = () => {
      const now = Date.now();
      const lastActive = readLastActive(last.current);
      if (now - lastActive > limit) {
        void signOut();
        return;
      }
      // A terminal makes no HTTP requests, so tell the server we are here.
      if (now - lastActive < HEARTBEAT_MS && now - lastBeat >= HEARTBEAT_MS) {
        lastBeat = now;
        void app.api.post("/activity").catch(() => {});
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };

    for (const name of ACTIVITY_EVENTS) {
      window.addEventListener(name, mark, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisible);
    const timer = window.setInterval(check, CHECK_MS);
    return () => {
      for (const name of ACTIVITY_EVENTS) {
        window.removeEventListener(name, mark);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
    };
  }, [app, idleMinutes]);
}

function SetupGate() {
  const { t } = useTranslation();
  useEffect(() => {
    // Setting up a factor lifts the restriction on the server.
    const timer = window.setInterval(() => {
      void needsSetup().then((still) => {
        if (!still) window.location.reload();
      });
    }, SETUP_POLL_MS);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-security-setup-title"
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-background p-4"
    >
      <div className="flex w-full max-w-lg flex-col gap-4 border border-border bg-card p-6">
        <h2 id="login-security-setup-title" className="text-lg font-semibold">
          {t("setup.title")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("setup.body")}</p>
        <AuthEnrollmentSections factorsOnly />
        <p className="text-xs text-muted-foreground">{t("setup.none")}</p>
        <div className="flex justify-end">
          <Button variant="outline" onClick={() => void signOut()}>
            {t("setup.signOut")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function createSecurityOverlay(app: TermixApp) {
  return function SecurityOverlay() {
    const [idleMinutes, setIdleMinutes] = useState(0);
    const [setup, setSetup] = useState(false);

    useEffect(() => {
      let cancelled = false;
      void needsSetup().then((value) => {
        if (!cancelled) setSetup(value);
      });
      app.api
        .get<{ idleTimeoutMinutes?: number }>("/policy")
        .then(({ data }) => {
          if (!cancelled) setIdleMinutes(Number(data?.idleTimeoutMinutes) || 0);
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }, []);

    useIdleSignOut(app, idleMinutes);
    return setup ? <SetupGate /> : null;
  };
}
