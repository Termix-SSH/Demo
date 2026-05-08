import { useState, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Auth, getStoredAuth, clearStoredAuth } from "@/ui/auth/Auth";
import { AppShell } from "@/ui/AppShell";
import { applyAccentColor } from "@/ui/utils/data";
import type { AccentColorId } from "@/ui/utils/types";

// idle-auth: only auth visible
// fading-in: auth fades out, app fades in
// idle-app: only app visible
// fading-out: app fades out, auth fades in
type Phase = "idle-auth" | "fading-in" | "idle-app" | "fading-out";

function App() {
  const stored = getStoredAuth();
  const [phase, setPhase] = useState<Phase>(stored?.loggedIn ? "idle-app" : "idle-auth");
  const [authUsername, setAuthUsername] = useState(stored?.username ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem("termix-accent") as AccentColorId | null;
    if (saved) applyAccentColor(saved);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  function handleLogin(u: string) {
    setAuthUsername(u);
    setPhase("fading-in");
    timerRef.current = setTimeout(() => setPhase("idle-app"), 450);
  }

  function handleLogout() {
    clearStoredAuth();
    setPhase("fading-out");
    timerRef.current = setTimeout(() => { setAuthUsername(""); setPhase("idle-auth"); }, 450);
  }

  const showApp  = phase === "idle-app" || phase === "fading-in" || phase === "fading-out";
  const showAuth = phase === "idle-auth" || phase === "fading-in" || phase === "fading-out";

  const appOpacity  = phase === "idle-app"  ? 1 : 0;
  const authOpacity = phase === "idle-auth" ? 1 : 0;

  return (
    <>
      {showApp && (
        <div
          className="fixed inset-0 z-0 transition-opacity duration-[450ms] ease-in-out"
          style={{ opacity: appOpacity, pointerEvents: phase === "idle-app" ? "auto" : "none" }}
        >
          <AppShell username={authUsername} onLogout={handleLogout} />
        </div>
      )}

      {showAuth && (
        <div
          className="fixed inset-0 z-10 transition-opacity duration-[450ms] ease-in-out"
          style={{ opacity: authOpacity, pointerEvents: phase === "idle-auth" ? "auto" : "none" }}
        >
          <Auth onLogin={handleLogin} />
        </div>
      )}

      {/* Always on top so toasts never fade with either panel */}
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
