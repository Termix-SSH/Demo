import { useState, useEffect } from "react";
import Logo from "@/assets/icon.svg?react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Eye,
  EyeOff,
  Lock,
  User,
  KeyRound,
  ArrowLeft,
  Shield,
  AlertCircle,
  CheckCircle2,
  Globe,
  ChevronDown,
} from "lucide-react";

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "zh", label: "中文" },
  { code: "ja", label: "日本語" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
];

const STORAGE_KEY = "termix_demo_auth";

export function getStoredAuth(): { loggedIn: boolean; username: string } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearStoredAuth() {
  localStorage.removeItem(STORAGE_KEY);
}

function storeAuth(username: string) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ loggedIn: true, username }));
}

type AuthView = "login" | "register" | "reset";
type ResetStep = "email" | "code" | "newpass";

interface AuthProps {
  onLogin: (username: string) => void;
}

function PasswordInput({
  value,
  onChange,
  placeholder,
  disabled,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? "••••••••"}
        disabled={disabled}
        className="pr-9 font-mono"
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow((o) => !o)}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </label>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
      {children}
    </div>
  );
}

export function Auth({ onLogin }: AuthProps) {
  const [view, setView] = useState<AuthView>("login");
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState(LANGUAGES[0]);

  // login / register fields
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // reset flow
  const [resetStep, setResetStep] = useState<ResetStep>("email");
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  function resetAll() {
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setResetStep("email");
    setResetEmail("");
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  }

  function switchView(v: AuthView) {
    resetAll();
    setView(v);
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { toast.error("Username is required"); return; }
    if (!password) { toast.error("Password is required"); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    storeAuth(username.trim());
    toast.success(`Welcome back, ${username.trim()}!`);
    onLogin(username.trim());
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) { toast.error("Username is required"); return; }
    if (password.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (password !== confirmPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 700));
    storeAuth(username.trim());
    toast.success(`Account created! Welcome, ${username.trim()}`);
    onLogin(username.trim());
    setLoading(false);
  }

  async function handleResetInitiate(e: React.FormEvent) {
    e.preventDefault();
    if (!resetEmail.trim()) { toast.error("Username is required"); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    setLoading(false);
    setResetStep("code");
    toast.info("Reset code sent (demo: use 123456)");
  }

  async function handleResetVerify(e: React.FormEvent) {
    e.preventDefault();
    if (resetCode !== "123456") { toast.error("Invalid code. Use 123456 in demo mode."); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 400));
    setLoading(false);
    setResetStep("newpass");
  }

  async function handleResetComplete(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("Password must be at least 6 characters"); return; }
    if (newPassword !== confirmNewPassword) { toast.error("Passwords do not match"); return; }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    setLoading(false);
    toast.success("Password reset! You can now log in.");
    switchView("login");
  }

  const TAB_ITEMS: { id: AuthView; label: string }[] = [
    { id: "login", label: "Login" },
    { id: "register", label: "Register" },
  ];

  return (
    <div className="fixed inset-0 flex bg-background overflow-hidden">
      {/* Left panel — decorative */}
      <div className="hidden lg:flex flex-col w-[420px] shrink-0 bg-sidebar border-r border-border relative overflow-hidden select-none">
        {/* Dot grid pattern */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(circle, color-mix(in oklch, var(--border) 80%, transparent) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Centered text block */}
        <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-12">
          <div className="flex flex-col gap-3 border border-border bg-card px-6 py-5">
            <div className="flex items-center gap-3">
              <Logo className="size-9 text-accent-brand" />
              <span className="text-3xl font-bold tracking-widest font-mono">TERMIX</span>
            </div>
            <span className="text-xs font-mono text-muted-foreground uppercase tracking-[0.25em]">
              SSH Server Management
            </span>
          </div>
        </div>

      </div>

      {/* Right panel — auth form */}
      <div className="flex flex-1 items-center justify-center p-6 overflow-y-auto relative">
        {/* Language selector */}
        <div className="absolute top-4 right-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-border hover:border-border/80 bg-background hover:bg-muted transition-colors">
                <Globe className="size-3.5" />
                <span className="font-mono">{language.label}</span>
                <ChevronDown className="size-3" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              {LANGUAGES.map((lang) => (
                <DropdownMenuItem
                  key={lang.code}
                  onClick={() => setLanguage(lang)}
                  className={`text-xs font-mono ${language.code === lang.code ? "text-accent-brand" : ""}`}
                >
                  {lang.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="w-full max-w-sm flex flex-col gap-6">

          {/* Mobile logo */}
          <div className="flex lg:hidden items-center gap-2">
            <Logo className="size-6 text-accent-brand" />
            <span className="text-lg font-bold font-mono tracking-wider">TERMIX</span>
          </div>

          {/* Demo notice */}
          <Card className="flex items-start gap-3 px-4 py-3 border-accent-brand/30 bg-accent-brand/5 gap-0">
            <AlertCircle className="size-4 text-accent-brand shrink-0 mt-0.5 mr-3" />
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-accent-brand uppercase tracking-widest">Demo Mode</span>
              <span className="text-xs text-muted-foreground">
                This is a UI demo. Enter <span className="font-bold text-foreground">any username and password</span> to continue.
              </span>
            </div>
          </Card>

          {view === "reset" ? (
            /* ── Password Reset Flow ── */
            <div className="flex flex-col gap-5">
              <button
                onClick={() => switchView("login")}
                className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
              >
                <ArrowLeft className="size-3.5" />
                Back to login
              </button>

              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold">Reset Password</h1>
                <p className="text-xs text-muted-foreground">
                  {resetStep === "email" && "Enter your username to receive a reset code."}
                  {resetStep === "code" && `Enter the 6-digit code sent to ${resetEmail}.`}
                  {resetStep === "newpass" && "Choose a new password for your account."}
                </p>
              </div>

              {/* Step indicator */}
              <div className="flex items-center gap-2">
                {(["email", "code", "newpass"] as ResetStep[]).map((step, i) => {
                  const stepIdx = ["email", "code", "newpass"].indexOf(resetStep);
                  const done = i < stepIdx;
                  const active = i === stepIdx;
                  return (
                    <div key={step} className="flex items-center gap-2 flex-1">
                      <div className={`size-5 flex items-center justify-center text-[10px] font-bold border transition-colors ${
                        done ? "bg-accent-brand border-accent-brand text-background" :
                        active ? "border-accent-brand text-accent-brand" :
                        "border-border text-muted-foreground"
                      }`}>
                        {done ? <CheckCircle2 className="size-3" /> : i + 1}
                      </div>
                      {i < 2 && <div className={`h-px flex-1 transition-colors ${done ? "bg-accent-brand" : "bg-border"}`} />}
                    </div>
                  );
                })}
              </div>

              {resetStep === "email" && (
                <form onSubmit={handleResetInitiate} className="flex flex-col gap-4">
                  <Field label="Username" htmlFor="reset-user">
                    <Input id="reset-user" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="your_username" disabled={loading} />
                  </Field>
                  <Button type="submit" className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Code"}
                  </Button>
                </form>
              )}

              {resetStep === "code" && (
                <form onSubmit={handleResetVerify} className="flex flex-col gap-4">
                  <Field label="Reset Code" htmlFor="reset-code">
                    <Input id="reset-code" value={resetCode} onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
                      placeholder="123456" maxLength={6} className="text-center font-mono text-lg tracking-widest" disabled={loading} />
                  </Field>
                  <Button type="submit" className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold"
                    disabled={loading || resetCode.length !== 6}>
                    {loading ? "Verifying..." : "Verify Code"}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full" onClick={() => setResetStep("email")} disabled={loading}>
                    Back
                  </Button>
                </form>
              )}

              {resetStep === "newpass" && (
                <form onSubmit={handleResetComplete} className="flex flex-col gap-4">
                  <Field label="New Password" htmlFor="new-pass">
                    <PasswordInput id="new-pass" value={newPassword} onChange={setNewPassword} disabled={loading} />
                  </Field>
                  <Field label="Confirm Password" htmlFor="confirm-new-pass">
                    <PasswordInput id="confirm-new-pass" value={confirmNewPassword} onChange={setConfirmNewPassword} disabled={loading} />
                  </Field>
                  <Button type="submit" className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold" disabled={loading}>
                    {loading ? "Resetting..." : "Reset Password"}
                  </Button>
                </form>
              )}
            </div>
          ) : (
            /* ── Login / Register ── */
            <div className="flex flex-col gap-5">
              {/* Tab switcher */}
              <div className="flex border border-border overflow-hidden">
                {TAB_ITEMS.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => switchView(t.id)}
                    className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                      view === t.id
                        ? "bg-accent-brand text-background"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Heading */}
              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold">
                  {view === "login" ? "Sign in to Termix" : "Create an account"}
                </h1>
                <p className="text-xs text-muted-foreground">
                  {view === "login"
                    ? "Enter any credentials to access the demo."
                    : "Register a new account to get started."}
                </p>
              </div>

              {view === "login" ? (
                <form onSubmit={handleLogin} className="flex flex-col gap-4">
                  <Field label="Username" htmlFor="login-user">
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input id="login-user" value={username} onChange={(e) => setUsername(e.target.value)}
                        placeholder="username" className="pl-8" disabled={loading} autoFocus />
                    </div>
                  </Field>
                  <Field label="Password" htmlFor="login-pass">
                    <div className="relative">
                      <PasswordInput id="login-pass" value={password} onChange={setPassword} disabled={loading} />
                    </div>
                  </Field>

                  <div className="flex items-center justify-end">
                    <button
                      type="button"
                      onClick={() => switchView("reset")}
                      className="text-xs text-muted-foreground hover:text-accent-brand transition-colors"
                    >
                      Forgot password?
                    </button>
                  </div>

                  <Button type="submit"
                    className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold h-10"
                    disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                        Signing in...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <KeyRound className="size-4" />
                        Sign In
                      </span>
                    )}
                  </Button>
                </form>
              ) : (
                <form onSubmit={handleRegister} className="flex flex-col gap-4">
                  <Field label="Username" htmlFor="reg-user">
                    <div className="relative">
                      <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                      <Input id="reg-user" value={username} onChange={(e) => setUsername(e.target.value)}
                        placeholder="choose_a_username" className="pl-8" disabled={loading} autoFocus />
                    </div>
                  </Field>
                  <Field label="Password" htmlFor="reg-pass">
                    <PasswordInput id="reg-pass" value={password} onChange={setPassword}
                      placeholder="min. 6 characters" disabled={loading} />
                  </Field>
                  <Field label="Confirm Password" htmlFor="reg-confirm">
                    <PasswordInput id="reg-confirm" value={confirmPassword} onChange={setConfirmPassword} disabled={loading} />
                  </Field>

                  <Button type="submit"
                    className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold h-10"
                    disabled={loading}>
                    {loading ? (
                      <span className="flex items-center gap-2">
                        <svg className="animate-spin size-4" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"/>
                        </svg>
                        Creating account...
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <Shield className="size-4" />
                        Create Account
                      </span>
                    )}
                  </Button>
                </form>
              )}

              <Separator />

              <p className="text-center text-xs text-muted-foreground">
                {view === "login" ? (
                  <>Don't have an account?{" "}
                    <button onClick={() => switchView("register")} className="text-accent-brand hover:text-accent-brand/70 font-bold transition-colors">
                      Register
                    </button>
                  </>
                ) : (
                  <>Already have an account?{" "}
                    <button onClick={() => switchView("login")} className="text-accent-brand hover:text-accent-brand/70 font-bold transition-colors">
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
