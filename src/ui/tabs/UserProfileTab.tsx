import { useState } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  FolderSearch,
  KeyRound,
  Languages,
  Lock,
  Monitor,
  Moon,
  Network,
  Palette,
  Play,
  Plus,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Sun,
  Terminal,
  Trash2,
  User,
  X,
} from "lucide-react";
import { SectionCard, SettingRow, FakeSwitch } from "@/ui/shared/SectionCard";
import { ACCENT_COLORS, applyAccentColor, MOCK_API_KEYS } from "@/ui/data";
import type { UserProfileSection, AccentColorId } from "@/ui/types";
import { toast } from "sonner";

const SECTIONS: { id: UserProfileSection; label: string; icon: React.ReactNode }[] = [
  { id: "account",    label: "Account",    icon: <User className="size-3.5"/>     },
  { id: "appearance", label: "Appearance", icon: <Palette className="size-3.5"/>  },
  { id: "security",   label: "Security",   icon: <Shield className="size-3.5"/>   },
  { id: "api-keys",   label: "API Keys",   icon: <Network className="size-3.5"/>  },
];

const THEMES = [
  { id: "light",      label: "Light",      icon: <Sun className="size-3.5"/>     },
  { id: "dark",       label: "Dark",       icon: <Moon className="size-3.5"/>    },
  { id: "system",     label: "System",     icon: <Monitor className="size-3.5"/> },
  { id: "dracula",    label: "Dracula",    icon: <Palette className="size-3.5"/> },
  { id: "catppuccin", label: "Catppuccin", icon: <Palette className="size-3.5"/> },
];

function NewApiKeyDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (key: any) => void;
}) {
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read"]);

  const allScopes = ["read", "write", "terminal", "files", "docker", "admin"];
  const toggleScope = (s: string) => setScopes(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const handleCreate = () => {
    if (!name.trim()) { toast.error("API key name is required"); return; }
    const prefix = `tmx_${name.toLowerCase().replace(/\s+/g, "_").substring(0, 6)}_${Math.random().toString(36).substring(2, 6)}`;
    onAdd({
      id: Math.random().toString(36).substring(2, 8),
      name: name.trim(),
      username: "admin",
      tokenPrefix: prefix,
      createdAt: new Date().toISOString(),
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      lastUsedAt: null,
      isActive: true,
      scopes,
    });
    onOpenChange(false);
    setName("");
    setExpiry("");
    setScopes(["read"]);
    toast.success(`API key "${name}" created`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md rounded-none border-border bg-card p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
              <Network className="size-3.5 text-accent-brand" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold leading-none">Create API Key</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">Generate a new API key for programmatic access.</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-4 px-5 py-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Name</label>
            <Input
              autoFocus
              placeholder="e.g. CI Pipeline"
              value={name}
              onChange={e => setName(e.target.value)}
              className="rounded-none bg-muted/50 border-border text-sm h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Expiry Date <span className="text-muted-foreground/50 normal-case font-medium">(optional)</span></label>
            <Input
              type="date"
              value={expiry}
              onChange={e => setExpiry(e.target.value)}
              className="rounded-none bg-muted/50 border-border text-sm h-9"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Scopes</label>
            <div className="flex flex-wrap gap-1.5">
              {allScopes.map(s => (
                <button
                  key={s}
                  onClick={() => toggleScope(s)}
                  className={`px-2 py-1 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                    scopes.includes(s)
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border bg-muted/20">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="rounded-none text-[10px] font-bold uppercase tracking-widest">Cancel</Button>
          <Button
            variant="outline"
            className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 rounded-none text-[10px] font-bold uppercase tracking-widest gap-1.5"
            onClick={handleCreate}
          >
            <KeyRound className="size-3" /> Create Key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserProfileTab() {
  const [section, setSection] = useState<UserProfileSection>("account");
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [themeChoice, setThemeChoice] = useState("dark");
  const [accentColor, setAccentColor] = useState<AccentColorId>(
    () => (localStorage.getItem("termix-accent") as AccentColorId) ?? "orange"
  );
  const [apiKeys, setApiKeys] = useState(MOCK_API_KEYS);
  const [newKeyOpen, setNewKeyOpen] = useState(false);

  function handleAccentChange(id: AccentColorId) {
    setAccentColor(id);
    localStorage.setItem("termix-accent", id);
    applyAccentColor(id);
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <NewApiKeyDialog
        open={newKeyOpen}
        onOpenChange={setNewKeyOpen}
        onAdd={key => setApiKeys(prev => [key, ...prev])}
      />

      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">User Profile</h1>
          <p className="text-xs text-muted-foreground">Manage your account, appearance, and security</p>
        </div>
      </Card>

      <div className="flex flex-row min-h-0 flex-1 overflow-hidden px-3 py-3 gap-3">
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${
                  section === s.id
                    ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </Card>

          <Card className="flex flex-col overflow-hidden py-0 gap-0 mt-auto">
            <button
              onClick={() => window.dispatchEvent(new CustomEvent("termix:logout"))}
              className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors text-left"
            >
              <X className="size-3.5"/>
              Logout
            </button>
          </Card>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>*]:shrink-0 gap-3">

          {section === "account" && (
            <>
              <SectionCard title="Account Info" icon={<User className="size-3.5"/>}>
                <div className="grid grid-cols-2 gap-x-8 py-2">
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Username</span>
                    <span className="text-base font-semibold mt-0.5">admin</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Role</span>
                    <div className="flex gap-1.5 mt-0.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">Administrator</span>
                    </div>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Auth Method</span>
                    <span className="text-base font-semibold mt-0.5">Local</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Two-Factor Auth</span>
                    <span className="flex items-center gap-1.5 mt-0.5">
                      {totpEnabled
                        ? <><ShieldCheck className="size-4 text-accent-brand"/><span className="text-base font-semibold text-accent-brand">Enabled</span></>
                        : <span className="text-base font-semibold text-muted-foreground">Disabled</span>
                      }
                    </span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Version" icon={<RefreshCw className="size-3.5"/>}>
                <div className="grid grid-cols-2 gap-x-8 py-2">
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">App Version</span>
                    <span className="text-base font-bold text-accent-brand mt-0.5">v1.0.0</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Build</span>
                    <span className="text-base font-semibold text-muted-foreground mt-0.5 font-mono">stable</span>
                  </div>
                  <div className="flex flex-col py-2">
                    <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Update Status</span>
                    <span className="flex items-center gap-1.5 mt-0.5 text-sm font-semibold text-accent-brand">
                      <CheckCircle2 className="size-4"/> Up to date
                    </span>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Danger Zone" icon={<AlertCircle className="size-3.5"/>}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-destructive">Delete Account</span>
                    <span className="text-xs text-muted-foreground">Permanently delete your account and all data</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 ml-8"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    Delete Account
                  </Button>
                </div>
              </SectionCard>
            </>
          )}

          {section === "appearance" && (
            <>
              <SectionCard title="Language & Localization" icon={<Languages className="size-3.5"/>}>
                <SettingRow label="Language" description="Select your preferred display language">
                  <select className="px-2.5 py-1.5 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring">
                    <option>English</option>
                    <option>French</option>
                    <option>German</option>
                    <option>Spanish</option>
                    <option>Japanese</option>
                    <option>Chinese (Simplified)</option>
                  </select>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Theme" icon={<Palette className="size-3.5"/>}>
                <div className="flex flex-col gap-2 py-3">
                  <span className="text-xs text-muted-foreground">Select your preferred color theme</span>
                  <div className="grid grid-cols-5 gap-2 mt-1">
                    {THEMES.map(t => (
                      <button
                        key={t.id}
                        onClick={() => setThemeChoice(t.id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-2.5 border text-xs font-semibold transition-colors ${
                          themeChoice === t.id
                            ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        {t.icon}
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Accent Color" icon={<Palette className="size-3.5"/>}>
                <div className="flex flex-col gap-2 py-3">
                  <span className="text-xs text-muted-foreground">Choose the accent color used throughout the app</span>
                  <div className="grid grid-cols-6 gap-2 mt-1">
                    {ACCENT_COLORS.map(ac => (
                      <button
                        key={ac.id}
                        onClick={() => handleAccentChange(ac.id)}
                        className={`flex flex-col items-center gap-1.5 px-2 py-2 border text-xs font-semibold transition-colors ${
                          accentColor === ac.id
                            ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                            : "border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="size-4 rounded-full border border-border/50" style={{ background: ac.value }}/>
                        {ac.label}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="File Manager" icon={<FolderSearch className="size-3.5"/>}>
                <SettingRow label="File Color Coding" description="Color-code files by type in the file manager">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Terminal" icon={<Terminal className="size-3.5"/>}>
                <SettingRow label="Command Autocomplete" description="Show autocomplete suggestions while typing">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Command History Tracking" description="Track commands run in terminal sessions">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Terminal Syntax Highlighting" badge="BETA" description="Highlight syntax in terminal output">
                  <FakeSwitch/>
                </SettingRow>
                <SettingRow label="Command Palette Shortcut" description="Enable the command palette keyboard shortcut">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
                <SettingRow label="Terminal Session Persistence" badge="BETA" description="Keep terminal sessions alive between reconnects">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Host Sidebar" icon={<Server className="size-3.5"/>}>
                <SettingRow label="Show Host Tags" description="Display tags on hosts in the sidebar">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Snippets" icon={<Play className="size-3.5"/>}>
                <SettingRow label="Default Folders Collapsed" description="Collapse snippet folders by default">
                  <FakeSwitch defaultChecked={true}/>
                </SettingRow>
                <SettingRow label="Confirm Before Execution" description="Show a confirmation dialog before running a snippet">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Updates" icon={<RefreshCw className="size-3.5"/>}>
                <SettingRow label="Disable Update Checks" description="Stop Termix from checking for new versions on startup">
                  <FakeSwitch/>
                </SettingRow>
              </SectionCard>
            </>
          )}

          {section === "security" && (
            <>
              <SectionCard title="Two-Factor Authentication" icon={<Shield className="size-3.5"/>}>
                <div className="flex items-center justify-between py-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">TOTP Authenticator</span>
                    <span className="text-xs text-muted-foreground">
                      {totpEnabled ? "Two-factor authentication is currently enabled on your account" : "Add an extra layer of security using an authenticator app"}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className={`shrink-0 ml-8 ${totpEnabled ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" : "border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"}`}
                    onClick={() => {
                      if (totpEnabled) setTotpEnabled(false);
                      else setShowTotpSetup(true);
                    }}
                  >
                    {totpEnabled ? "Disable TOTP" : "Enable TOTP"}
                  </Button>
                </div>
                {showTotpSetup && !totpEnabled && (
                  <div className="border border-border bg-muted/20 p-4 mb-3 flex flex-col gap-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Setup TOTP</span>
                      <button onClick={() => setShowTotpSetup(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="size-3.5"/>
                      </button>
                    </div>
                    <div className="flex items-center justify-center p-4 bg-background border border-border">
                      <div className="size-32 bg-muted flex items-center justify-center text-xs text-muted-foreground">QR Code</div>
                    </div>
                    <div className="flex items-center gap-2 bg-muted/30 border border-border px-3 py-2">
                      <span className="text-xs font-mono flex-1 tracking-widest select-all">JBSWY3DPEHPK3PXP</span>
                      <button onClick={() => { navigator.clipboard.writeText("JBSWY3DPEHPK3PXP"); toast.info("Secret copied"); }} className="text-muted-foreground hover:text-accent-brand">
                        <Copy className="size-3.5"/>
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground text-center">Scan the QR code or enter the secret in your authenticator app, then enter the 6-digit code below</span>
                    <Input placeholder="000000" className="text-center font-mono tracking-widest text-lg h-10"/>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm" className="flex-1" onClick={() => setShowTotpSetup(false)}>Cancel</Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                        onClick={() => { setTotpEnabled(true); setShowTotpSetup(false); toast.success("TOTP enabled successfully"); }}
                      >
                        <CheckCircle2 className="size-3.5"/>Verify & Enable
                      </Button>
                    </div>
                  </div>
                )}
              </SectionCard>

              <SectionCard title="Change Password" icon={<Lock className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Current Password</label>
                    <div className="relative">
                      <Input type={showPassword ? "text" : "password"} placeholder="Current password" className="pr-9"/>
                      <button
                        onClick={() => setShowPassword(o => !o)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">New Password</label>
                    <Input type="password" placeholder="New password"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Confirm New Password</label>
                    <Input type="password" placeholder="Confirm new password"/>
                  </div>
                  <div className="flex justify-end">
                    <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={() => toast.success("Password updated")}>
                      <KeyRound className="size-3.5"/>Update Password
                    </Button>
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {section === "api-keys" && (
            <>
              <SectionCard
                title="API Keys"
                icon={<Network className="size-3.5"/>}
                action={
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-[10px] font-bold uppercase tracking-widest border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 gap-1.5"
                    onClick={() => setNewKeyOpen(true)}
                  >
                    <Plus className="size-3"/> New Key
                  </Button>
                }
              >
                <div className="flex flex-col gap-0 divide-y divide-border">
                  {apiKeys.length === 0 ? (
                    <div className="py-8 text-center text-muted-foreground text-sm">
                      No API keys yet. Create one to get started.
                    </div>
                  ) : (
                    apiKeys.map(key => (
                      <div key={key.id} className="flex items-center justify-between py-3 gap-4">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{key.name}</span>
                            {key.isActive && (
                              <span className="text-[9px] font-bold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand uppercase">Active</span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                            <span className="font-mono">{key.tokenPrefix}…</span>
                            <span>User: {key.username}</span>
                            {key.expiresAt && <span>Expires: {new Date(key.expiresAt).toLocaleDateString()}</span>}
                            {key.lastUsedAt && <span>Last used: {new Date(key.lastUsedAt).toLocaleString()}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-accent-brand"
                            onClick={() => { navigator.clipboard.writeText(key.tokenPrefix + "_demo_token"); toast.info("Token prefix copied — full token shown once at creation"); }}
                          >
                            <Copy className="size-3.5"/>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-7 text-muted-foreground hover:text-destructive"
                            onClick={() => { setApiKeys(prev => prev.filter(k => k.id !== key.id)); toast.error(`Revoked "${key.name}"`); }}
                          >
                            <Trash2 className="size-3.5"/>
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </SectionCard>

              <SectionCard title="API Usage" icon={<AlertCircle className="size-3.5"/>}>
                <div className="flex flex-col gap-2 py-2 text-xs text-muted-foreground">
                  <p>API keys provide programmatic access to Termix. Include your key in the <code className="font-mono text-accent-brand bg-accent-brand/10 px-1">Authorization: Bearer</code> header.</p>
                  <p>Keys inherit the permissions of the user who created them. Revoke any key you suspect has been compromised.</p>
                </div>
              </SectionCard>
            </>
          )}
        </div>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Delete Account</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action is permanent and cannot be undone. All your data will be removed.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
              <span className="text-xs text-destructive">All sessions, hosts, credentials, and settings associated with your account will be permanently deleted.</span>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Confirm Password</label>
              <Input type="password" placeholder="Enter your password to confirm"/>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="size-3.5"/>Delete Account
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
