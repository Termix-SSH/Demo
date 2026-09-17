import { useState } from "react";
import {
  ArrowRight,
  Check,
  Fingerprint,
  Globe,
  Loader2,
  Lock,
  ShieldCheck,
  User,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Checkbox } from "@/components/checkbox";
import { PasswordInput } from "@/components/password-input";

/**
 * Sign-in screen for the demo.
 *
 * The left half is the same hairline/mono chrome the panels use: brand mark,
 * tagline, version in the corner. The right half is the form: password by
 * default, with the passkey and external provider paths the real app offers
 * shown but inert, plus the TOTP step so the flow reads as complete.
 */

type Step = "credentials" | "totp";

export function DemoAuth({ onLogin }: { onLogin: (username: string) => void }) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("demo");
  const [password, setPassword] = useState("demo");
  const [code, setCode] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [pending, setPending] = useState(false);

  function finish() {
    setPending(true);
    window.setTimeout(() => onLogin(username.trim() || "demo"), 350);
  }

  function submitCredentials(e: React.FormEvent) {
    e.preventDefault();
    setStep("totp");
  }

  function submitCode(e: React.FormEvent) {
    e.preventDefault();
    finish();
  }

  return (
    <div className="fixed inset-0 flex bg-background overflow-hidden">
      <BrandPanel tagline={t("auth.tagline")} />

      <div className="flex flex-1 items-center justify-center overflow-y-auto p-6">
        <div className="w-full max-w-[360px]">
          <div className="mb-6 flex items-center gap-2.5 lg:hidden">
            <img src="./icon.svg" alt="" className="size-7 object-contain" />
            <span className="font-mono text-sm font-bold uppercase tracking-[0.3em]">
              Termix
            </span>
          </div>

          <div className="border border-border bg-card">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
              <span className="text-muted-foreground">
                {step === "credentials" ? (
                  <Lock className="size-3.5" />
                ) : (
                  <ShieldCheck className="size-3.5" />
                )}
              </span>
              <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {step === "credentials"
                  ? t("auth.signInHeading")
                  : t("auth.twoFactorAuth")}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {step === "credentials" ? "1/2" : "2/2"}
              </span>
            </div>

            {step === "credentials" ? (
              <form onSubmit={submitCredentials} className="flex flex-col p-4">
                <p className="mb-4 text-sm font-semibold tracking-tight">
                  {t("auth.loginTitle")}
                </p>

                <Field label={t("common.username")} htmlFor="login-user">
                  <div className="relative">
                    <User className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
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

                <div className="h-3" />

                <Field
                  label={t("common.password")}
                  htmlFor="login-pass"
                  aside={
                    <button
                      type="button"
                      className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                    >
                      {t("auth.forgotPassword")}
                    </button>
                  }
                >
                  <PasswordInput
                    id="login-pass"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>

                <label
                  htmlFor="rememberMe"
                  className="mt-3.5 flex cursor-pointer items-center gap-2 text-xs text-muted-foreground"
                >
                  <Checkbox
                    id="rememberMe"
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                  />
                  {t("auth.rememberDevice")}
                </label>

                <Button
                  type="submit"
                  size="lg"
                  className="mt-4 w-full justify-between bg-accent-brand font-bold uppercase tracking-widest text-background hover:bg-accent-brand/90"
                >
                  {t("common.login")}
                  <ArrowRight className="size-3.5" />
                </Button>

                <Divider label={t("auth.orContinueWith")} />

                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="gap-1.5">
                    <Fingerprint className="size-3.5" />
                    {t("auth.passkey")}
                  </Button>
                  <Button type="button" variant="outline" className="gap-1.5">
                    <Globe className="size-3.5" />
                    {t("auth.external")}
                  </Button>
                </div>
              </form>
            ) : (
              <form onSubmit={submitCode} className="flex flex-col p-4">
                <p className="text-sm font-semibold tracking-tight">
                  {t("auth.enterCode")}
                </p>
                <p className="mt-1 mb-4 text-xs leading-snug text-muted-foreground">
                  {t("auth.totpHint", { username: username || "demo" })}
                </p>

                <Input
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                  placeholder="000000"
                  inputMode="numeric"
                  autoFocus
                  className="h-11 text-center font-mono text-lg tracking-[0.5em]"
                />

                <Button
                  type="submit"
                  size="lg"
                  disabled={pending}
                  className="mt-4 w-full justify-between bg-accent-brand font-bold uppercase tracking-widest text-background hover:bg-accent-brand/90"
                >
                  {pending ? t("auth.redirectingToApp") : t("auth.verifyCode")}
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                </Button>

                <div className="mt-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep("credentials")}
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("common.back")}
                  </button>
                  <button
                    type="button"
                    className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
                  >
                    {t("auth.backupCode")}
                  </button>
                </div>
              </form>
            )}
          </div>

          <p className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
            {t("auth.demoHint")}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Left half: brand mark, tagline, version footer. */
function BrandPanel({ tagline }: { tagline: string }) {
  return (
    <div className="relative hidden w-[46%] max-w-[560px] shrink-0 select-none flex-col justify-between overflow-hidden border-r border-border bg-sidebar p-10 lg:flex">
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(circle, color-mix(in oklch, var(--border) 80%, transparent) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-accent-brand/60" />

      <div className="relative flex items-center gap-3">
        <img src="./icon.svg" alt="" className="size-8 object-contain" />
        <span className="font-mono text-lg font-bold uppercase tracking-[0.35em]">
          Termix
        </span>
      </div>

      <div className="relative max-w-[380px]">
        <h2 className="text-2xl font-semibold leading-tight tracking-tight">
          {tagline}
        </h2>
        <div className="mt-4 h-px w-10 bg-accent-brand" />
      </div>

      <div className="relative flex items-center gap-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>v3.0.0</span>
        <span className="h-3 w-px bg-border" />
        <span>Demo build</span>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  aside,
  children,
}: {
  label: string;
  htmlFor?: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label
          htmlFor={htmlFor}
          className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          {label}
        </label>
        {aside}
      </div>
      {children}
    </div>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <div className="my-4 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}
