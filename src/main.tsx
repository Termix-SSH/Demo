import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./ui/index.css";
import "./ui/i18n/i18n";
import { Toaster } from "@/components/sonner";
import { applyAccentColor, applyFontSize, applyUiFont } from "@/lib/theme";
import { TooltipProvider } from "@/components/tooltip";
import { UiPreferencesProvider } from "@/contexts/UiPreferencesContext";
import { DemoAuth } from "@/auth/DemoAuth";
import { AppShell } from "@/AppShell";
import { startDashboardPluginCards } from "@/demo/dashboard-plugin-cards";

/**
 * Mirrors the real entry point's cross-fade between the auth screen and the
 * shell, minus session verification, Electron, service workers and the
 * query-param fullscreen routes.
 */

type Phase = "idle-auth" | "fading-in" | "idle-app" | "fading-out";

// index.css scales the whole UI off html.fs-*; with no class the browser
// default of 16px applies and every surface renders oversized. The real app
// sets these on boot, so the demo has to as well.
applyFontSize("md");
applyUiFont("jetbrains-mono");
applyAccentColor("#f59145");

// Plugin-contributed dashboard sections follow the plugin store from here on.
startDashboardPluginCards();

const FADE_MS = 450;

function App() {
  const [phase, setPhase] = useState<Phase>("idle-auth");
  const [username, setUsername] = useState("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  function handleLogin(user: string) {
    setUsername(user);
    setPhase("fading-in");
    timerRef.current = setTimeout(() => setPhase("idle-app"), FADE_MS);
  }

  function handleLogout() {
    setPhase("fading-out");
    timerRef.current = setTimeout(() => {
      setUsername("");
      setPhase("idle-auth");
    }, FADE_MS);
  }

  const showApp = phase !== "idle-auth";
  const showAuth = phase !== "idle-app";
  const isTransitioning = phase === "fading-in" || phase === "fading-out";

  return (
    <>
      {isTransitioning && (
        <div className="fixed inset-0 z-0 flex items-center justify-center bg-background">
          <div className="size-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {showApp && (
        <div
          className="fixed inset-0 z-10 transition-opacity duration-[450ms] ease-in-out"
          style={{
            opacity: phase === "idle-app" ? 1 : 0,
            pointerEvents: phase === "idle-app" ? "auto" : "none",
          }}
        >
          <UiPreferencesProvider>
            <AppShell username={username} onLogout={handleLogout} />
          </UiPreferencesProvider>
        </div>
      )}

      {showAuth && (
        <div
          className="fixed inset-0 z-20 transition-opacity duration-[450ms] ease-in-out"
          style={{
            opacity: phase === "idle-auth" ? 1 : 0,
            pointerEvents: phase === "idle-auth" ? "auto" : "none",
          }}
        >
          <DemoAuth onLogin={handleLogin} />
        </div>
      )}

      <Toaster position="bottom-right" />
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <TooltipProvider>
      <App />
    </TooltipProvider>
  </StrictMode>,
);
