import { useState, useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Auth, getStoredAuth, clearStoredAuth } from "@/ui/Auth";
import { AppShell } from "@/ui/AppShell";
import { applyAccentColor } from "@/ui/data";
import type { AccentColorId } from "@/ui/types";

function App() {
  const stored = getStoredAuth();
  const [authed, setAuthed] = useState(!!stored?.loggedIn);
  const [authUsername, setAuthUsername] = useState(stored?.username ?? "");

  useEffect(() => {
    const saved = localStorage.getItem("termix-accent") as AccentColorId | null;
    if (saved) applyAccentColor(saved);
  }, []);

  if (!authed) {
    return (
      <>
        <Auth onLogin={(u) => { setAuthUsername(u); setAuthed(true); }}/>
        <Toaster position="bottom-right"/>
      </>
    );
  }

  return (
    <AppShell
      username={authUsername}
      onLogout={() => { clearStoredAuth(); setAuthed(false); setAuthUsername(""); }}
    />
  );
}

export default App;
