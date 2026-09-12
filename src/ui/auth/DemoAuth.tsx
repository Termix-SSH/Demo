import { useState } from "react";
import { KeyRound, User } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Checkbox } from "@/components/checkbox";
import { PasswordInput } from "@/components/password-input";


type AuthView = "login" | "register";

export function DemoAuth({ onLogin }: { onLogin: (username: string) => void }) {
  const { t } = useTranslation();
  const [view, setView] = useState<AuthView>("login");
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [rememberMe, setRememberMe] = useState(true);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    onLogin(username.trim() || "demo");
  }

  const TAB_ITEMS: { id: AuthView; label: string }[] = [
    { id: "login", label: t("common.login") },
    { id: "register", label: t("common.register") },
  ];

  return (
    <div className="fixed inset-0 flex flex-col bg-background overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Left decorative panel */}
        <div className="hidden lg:flex flex-col w-[420px] shrink-0 bg-sidebar border-r border-border relative overflow-hidden select-none">
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "radial-gradient(circle, color-mix(in oklch, var(--border) 80%, transparent) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-10 px-12">
            <img
              src="/icon.svg"
              alt=""
              className="w-16 h-16 object-contain mb-1"
            />
            <span className="text-4xl font-bold tracking-[0.3em] font-mono uppercase">
              Termix
            </span>
            <div className="w-8 h-px bg-accent-brand" />
            <span className="text-[11px] font-mono text-muted-foreground uppercase tracking-[0.25em] text-center">
              {t("auth.tagline")}
            </span>
          </div>
        </div>

        {/* Right panel */}
        <div className="flex flex-1 items-center justify-center p-6 overflow-y-auto relative">
          <div className="w-full max-w-sm flex flex-col gap-6">
            <div className="flex flex-col gap-5">
              <div className="flex border border-border overflow-hidden">
                {TAB_ITEMS.map((item) => {
                  const disabled = item.id === "register";
                  return (
                    <button
                      key={item.id}
                      disabled={disabled}
                      onClick={() => {
                        if (!disabled) setView(item.id);
                      }}
                      className={`flex-1 py-2.5 text-xs font-bold uppercase tracking-widest transition-colors ${
                        disabled
                          ? "text-muted-foreground/40 cursor-not-allowed"
                          : view === item.id
                            ? "bg-accent-brand text-background"
                            : "text-muted-foreground hover:text-foreground hover:bg-muted"
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col gap-1">
                <h1 className="text-xl font-bold">
                  {view === "login"
                    ? t("auth.loginTitle")
                    : t("auth.registerTitle")}
                </h1>
              </div>

              <form onSubmit={submit} className="flex flex-col gap-4">
                <Field label={t("common.username")} htmlFor="login-user">
                  <div className="relative">
                    <User className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="login-user"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="username"
                      className="pl-8"
                      autoFocus
                    />
                  </div>
                </Field>

                <Field label={t("common.password")} htmlFor="login-pass">
                  <PasswordInput
                    id="login-pass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                  />
                  <label
                    htmlFor="rememberMe"
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    {t("auth.rememberMe")}
                  </label>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-accent-brand hover:bg-accent-brand/90 text-background font-bold h-10"
                >
                  <span className="flex items-center gap-2">
                    <KeyRound className="size-4" />
                    {view === "login"
                      ? t("common.login")
                      : t("common.register")}
                  </span>
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={htmlFor}
        className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      {children}
    </div>
  );
}
