import { useState, useRef } from "react";
import type React from "react";
import { Button } from "@/components/ui/button";
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
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Network,
  Palette,
  Plus,
  Shield,
  ShieldCheck,
  Trash2,
  Type,
  User,
  X,
} from "lucide-react";
import { SettingRow, FakeSwitch } from "@/ui/shared/SectionCard";
import { ACCENT_PRESET_COLORS, applyAccentColor, applyFontSize, FONT_SIZES, MOCK_API_KEYS } from "@/ui/utils/data";
import { useTheme } from "@/components/theme-provider";
import type { FontSizeId, ThemeId } from "@/ui/utils/types";
import { toast } from "sonner";

type UserProfileSection = "account" | "appearance" | "security" | "api-keys";

const SECTIONS: { id: UserProfileSection; label: string; icon: React.ReactNode }[] = [
  { id: "account",    label: "Account",    icon: <User className="size-3.5"/>    },
  { id: "appearance", label: "Appearance", icon: <Palette className="size-3.5"/> },
  { id: "security",   label: "Security",   icon: <Shield className="size-3.5"/>  },
  { id: "api-keys",   label: "API Keys",   icon: <Network className="size-3.5"/> },
];

const THEMES: { id: ThemeId; label: string; preview: string }[] = [
  { id: "system",      label: "System",       preview: "auto" },
  { id: "light",       label: "Light",        preview: "#ffffff" },
  { id: "dark",        label: "Dark",         preview: "#1a1c22" },
  { id: "dracula",     label: "Dracula",      preview: "#282a36" },
  { id: "catppuccin",  label: "Catppuccin",   preview: "#1e1e2e" },
  { id: "nord",        label: "Nord",         preview: "#2e3440" },
  { id: "solarized",   label: "Solarized",    preview: "#002b36" },
  { id: "tokyo-night", label: "Tokyo Night",  preview: "#1a1b26" },
  { id: "one-dark",    label: "One Dark",     preview: "#282c34" },
  { id: "gruvbox",     label: "Gruvbox",      preview: "#282828" },
];

function AccordionSection({ id, label, icon, open, onToggle, children }: {
  id: string;
  label: string;
  icon: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border bg-card overflow-hidden">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 w-full px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-xs font-bold uppercase tracking-widest text-foreground flex-1">{label}</span>
        <ChevronDown className={`size-3.5 text-muted-foreground shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}/>
      </button>
      {open && (
        <div className="border-t border-border px-3 pb-3">
          {children}
        </div>
      )}
    </div>
  );
}

function NewApiKeyDialog({ open, onOpenChange, onAdd }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAdd: (key: any) => void;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [expiry, setExpiry] = useState("");

  const handleCreate = () => {
    if (!name.trim()) { toast.error("API key name is required"); return; }
    if (!username.trim()) { toast.error("Username is required"); return; }
    const prefix = `tmx_${name.toLowerCase().replace(/\s+/g, "_").substring(0, 6)}_${Math.random().toString(36).substring(2, 6)}`;
    onAdd({
      id: Math.random().toString(36).substring(2, 8),
      name: name.trim(),
      username: username.trim(),
      tokenPrefix: prefix,
      createdAt: new Date().toISOString(),
      expiresAt: expiry ? new Date(expiry).toISOString() : null,
      lastUsedAt: null,
      isActive: true,
    });
    onOpenChange(false);
    setName("");
    setUsername("");
    setExpiry("");
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
            <label className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Username</label>
            <Input
              placeholder="e.g. admin"
              value={username}
              onChange={e => setUsername(e.target.value)}
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

export function UserProfilePanel() {
  const [openSection, setOpenSection] = useState<UserProfileSection | null>("account");
  const [showTotpSetup, setShowTotpSetup] = useState(false);
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [accentColor, setAccentColor] = useState<string>(
    () => localStorage.getItem("termix-accent") ?? "#f59145"
  );
  const [customColorInput, setCustomColorInput] = useState<string>(
    () => localStorage.getItem("termix-accent") ?? "#f59145"
  );
  const [fontSize, setFontSize] = useState<FontSizeId>(
    () => (localStorage.getItem("termix-font-size") as FontSizeId) ?? "md"
  );
  const [apiKeys, setApiKeys] = useState(MOCK_API_KEYS);
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const { theme, setTheme } = useTheme();

  function handleAccentChange(value: string) {
    setAccentColor(value);
    setCustomColorInput(value);
    localStorage.setItem("termix-accent", value);
    applyAccentColor(value);
  }

  function handleFontSizeChange(id: FontSizeId) {
    setFontSize(id);
    applyFontSize(id);
  }

  function toggle(id: UserProfileSection) {
    setOpenSection(prev => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <NewApiKeyDialog
        open={newKeyOpen}
        onOpenChange={setNewKeyOpen}
        onAdd={key => setApiKeys(prev => [key, ...prev])}
      />

      {/* Account */}
      <AccordionSection id="account" label="Account" icon={<User className="size-3.5"/>} open={openSection === "account"} onToggle={() => toggle("account")}>
        <div className="flex flex-col gap-0 pt-2">
          <div className="grid grid-cols-2 gap-x-4 gap-y-0">
            <div className="flex flex-col py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Username</span>
              <span className="text-sm font-semibold mt-0.5">admin</span>
            </div>
            <div className="flex flex-col py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Role</span>
              <span className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-semibold border border-accent-brand/40 bg-accent-brand/10 text-accent-brand mt-0.5 w-fit">Administrator</span>
            </div>
            <div className="flex flex-col py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Auth Method</span>
              <span className="text-sm font-semibold mt-0.5">Local</span>
            </div>
            <div className="flex flex-col py-2">
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">2FA</span>
              <span className="flex items-center gap-1 mt-0.5">
                {totpEnabled
                  ? <><ShieldCheck className="size-3.5 text-accent-brand"/><span className="text-sm font-semibold text-accent-brand">On</span></>
                  : <span className="text-sm font-semibold text-muted-foreground">Off</span>
                }
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-sm font-bold text-accent-brand">v1.0.0 <span className="text-muted-foreground font-normal text-xs">stable</span></span>
              <span className="flex items-center gap-1 text-xs font-semibold text-accent-brand"><CheckCircle2 className="size-3.5"/>Up to date</span>
            </div>
          </div>

          <div className="border-t border-border pt-3 mt-3">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium text-destructive">Delete Account</span>
                <span className="text-[10px] text-muted-foreground">Permanently delete your account</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 ml-3 text-[10px] h-7"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>
      </AccordionSection>

      {/* Appearance */}
      <AccordionSection id="appearance" label="Appearance" icon={<Palette className="size-3.5"/>} open={openSection === "appearance"} onToggle={() => toggle("appearance")}>
        <div className="flex flex-col gap-4 pt-3">
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Language</span>
            <select className="px-2.5 py-1.5 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring w-full">
              <option>English</option>
              <option>French</option>
              <option>German</option>
              <option>Spanish</option>
              <option>Japanese</option>
              <option>Chinese (Simplified)</option>
            </select>
          </div>

          {/* Theme — dropdown */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme</span>
            <div className="relative">
              <select
                value={theme}
                onChange={e => setTheme(e.target.value as ThemeId)}
                className="w-full px-2.5 py-1.5 text-xs bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring appearance-none pr-7"
              >
                {THEMES.map(t => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none"/>
            </div>
            {/* Live preview strip */}
            <div className="flex gap-1 mt-0.5">
              {THEMES.filter(t => t.id !== "system").map(t => (
                <button
                  key={t.id}
                  title={t.label}
                  onClick={() => setTheme(t.id)}
                  className={`h-4 flex-1 border transition-all ${theme === t.id ? "border-accent-brand ring-1 ring-accent-brand" : "border-border/50"}`}
                  style={{ background: t.preview }}
                />
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Type className="size-3"/>Font Size
            </span>
            <div className="flex gap-1">
              {FONT_SIZES.map(fs => (
                <button
                  key={fs.id}
                  onClick={() => handleFontSizeChange(fs.id)}
                  className={`flex-1 py-1.5 border text-[10px] font-bold transition-colors ${
                    fontSize === fs.id
                      ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fs.label}
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Accent Color</span>

            {/* Preset swatches */}
            <div className="grid grid-cols-6 gap-1">
              {ACCENT_PRESET_COLORS.map(ac => (
                <button
                  key={ac.value}
                  title={ac.label}
                  onClick={() => handleAccentChange(ac.value)}
                  className={`h-6 border-2 transition-all ${
                    accentColor === ac.value
                      ? "border-foreground scale-110"
                      : "border-transparent hover:border-foreground/40"
                  }`}
                  style={{ background: ac.value }}
                />
              ))}
            </div>

            {/* Custom color input */}
            <div className="flex items-center gap-2 border border-border bg-muted/30 px-2 py-1.5">
              <button
                onClick={() => colorInputRef.current?.click()}
                className="size-5 shrink-0 border border-border/60 cursor-pointer"
                style={{ background: accentColor }}
                title="Open color picker"
              />
              <input
                ref={colorInputRef}
                type="color"
                value={accentColor.startsWith("#") ? accentColor : "#f97316"}
                onChange={e => handleAccentChange(e.target.value)}
                className="sr-only"
              />
              <Input
                value={customColorInput}
                onChange={e => setCustomColorInput(e.target.value)}
                onBlur={() => {
                  const v = customColorInput.trim();
                  if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
                    handleAccentChange(v);
                  } else {
                    setCustomColorInput(accentColor);
                  }
                }}
                onKeyDown={e => {
                  if (e.key === "Enter") {
                    const v = customColorInput.trim();
                    if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) {
                      handleAccentChange(v);
                    }
                  }
                }}
                placeholder="#f97316"
                className="h-6 text-[11px] font-mono border-0 bg-transparent p-0 focus-visible:ring-0 flex-1 min-w-0"
              />
              <span className="text-[10px] text-muted-foreground shrink-0">hex</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">File Manager</span>
            <SettingRow label="File Color Coding" description="Color-code files by type">
              <FakeSwitch defaultChecked={true}/>
            </SettingRow>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Terminal</span>
            <SettingRow label="Command Autocomplete" description="Show autocomplete while typing">
              <FakeSwitch/>
            </SettingRow>
            <SettingRow label="History Tracking" description="Track terminal commands">
              <FakeSwitch/>
            </SettingRow>
            <SettingRow label="Syntax Highlighting" description="Highlight terminal output" badge="BETA">
              <FakeSwitch/>
            </SettingRow>
            <SettingRow label="Command Palette" description="Enable keyboard shortcut">
              <FakeSwitch defaultChecked={true}/>
            </SettingRow>
            <SettingRow label="Session Persistence" description="Keep sessions between reconnects" badge="BETA">
              <FakeSwitch/>
            </SettingRow>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Sidebar</span>
            <SettingRow label="Show Host Tags" description="Display tags in host list">
              <FakeSwitch defaultChecked={true}/>
            </SettingRow>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Snippets</span>
            <SettingRow label="Folders Collapsed" description="Collapse folders by default">
              <FakeSwitch defaultChecked={true}/>
            </SettingRow>
            <SettingRow label="Confirm Execution" description="Confirm before running snippets">
              <FakeSwitch/>
            </SettingRow>
          </div>

          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Updates</span>
            <SettingRow label="Disable Update Checks" description="Stop checking for updates">
              <FakeSwitch/>
            </SettingRow>
          </div>
        </div>
      </AccordionSection>

      {/* Security */}
      <AccordionSection id="security" label="Security" icon={<Shield className="size-3.5"/>} open={openSection === "security"} onToggle={() => toggle("security")}>
        <div className="flex flex-col gap-4 pt-3">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs font-medium">TOTP Authenticator</span>
                <span className="text-[10px] text-muted-foreground">
                  {totpEnabled ? "2FA is enabled" : "Add extra login security"}
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                className={`shrink-0 ml-3 text-[10px] h-7 ${totpEnabled ? "border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" : "border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"}`}
                onClick={() => { if (totpEnabled) setTotpEnabled(false); else setShowTotpSetup(true); }}
              >
                {totpEnabled ? "Disable" : "Enable"}
              </Button>
            </div>

            {showTotpSetup && !totpEnabled && (
              <div className="border border-border bg-muted/20 p-3 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Setup TOTP</span>
                  <button onClick={() => setShowTotpSetup(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="size-3.5"/>
                  </button>
                </div>
                <div className="flex items-center justify-center p-3 bg-background border border-border">
                  <div className="size-24 bg-muted flex items-center justify-center text-[10px] text-muted-foreground">QR Code</div>
                </div>
                <div className="flex items-center gap-2 bg-muted/30 border border-border px-2 py-1.5">
                  <span className="text-[10px] font-mono flex-1 tracking-widest select-all truncate">JBSWY3DPEHPK3PXP</span>
                  <button onClick={() => { navigator.clipboard.writeText("JBSWY3DPEHPK3PXP"); toast.info("Secret copied"); }} className="text-muted-foreground hover:text-accent-brand shrink-0">
                    <Copy className="size-3.5"/>
                  </button>
                </div>
                <span className="text-[10px] text-muted-foreground text-center">Scan QR code or enter secret in your authenticator app, then enter the 6-digit code</span>
                <Input placeholder="000000" className="text-center font-mono tracking-widest text-lg h-10"/>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="flex-1 text-xs" onClick={() => setShowTotpSetup(false)}>Cancel</Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                    onClick={() => { setTotpEnabled(true); setShowTotpSetup(false); toast.success("TOTP enabled successfully"); }}
                  >
                    <CheckCircle2 className="size-3.5"/>Verify
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 border-t border-border pt-3">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Change Password</span>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Current Password</label>
              <div className="relative">
                <Input type={showPassword ? "text" : "password"} placeholder="Current password" className="pr-9 text-sm"/>
                <button
                  onClick={() => setShowPassword(o => !o)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}
                </button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">New Password</label>
              <Input type="password" placeholder="New password" className="text-sm"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Confirm New Password</label>
              <Input type="password" placeholder="Confirm new password" className="text-sm"/>
            </div>
            <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand self-end" onClick={() => toast.success("Password updated")}>
              <KeyRound className="size-3.5"/>Update Password
            </Button>
          </div>
        </div>
      </AccordionSection>

      {/* API Keys */}
      <AccordionSection id="api-keys" label="API Keys" icon={<Network className="size-3.5"/>} open={openSection === "api-keys"} onToggle={() => toggle("api-keys")}>
        <div className="flex flex-col gap-2 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{apiKeys.length} keys</span>
            <Button
              variant="outline"
              size="sm"
              className="h-6 text-[10px] font-bold uppercase tracking-widest border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 gap-1"
              onClick={() => setNewKeyOpen(true)}
            >
              <Plus className="size-3"/> New Key
            </Button>
          </div>

          <div className="flex flex-col divide-y divide-border">
            {apiKeys.length === 0 ? (
              <div className="py-6 text-center text-muted-foreground text-xs">No API keys yet.</div>
            ) : (
              apiKeys.map(key => (
                <div key={key.id} className="flex items-start justify-between py-2.5 gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">{key.name}</span>
                      {key.isActive && (
                        <span className="text-[9px] font-bold px-1 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand uppercase shrink-0">Active</span>
                      )}
                    </div>
                    <span className="text-[10px] font-mono text-muted-foreground truncate">{key.tokenPrefix}…</span>
                    <span className="text-[10px] text-muted-foreground">User: {key.username}</span>
                    {key.expiresAt && <span className="text-[10px] text-muted-foreground">Exp: {new Date(key.expiresAt).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-accent-brand"
                      onClick={() => { navigator.clipboard.writeText(key.tokenPrefix + "_demo_token"); toast.info("Token prefix copied"); }}
                    >
                      <Copy className="size-3"/>
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 text-muted-foreground hover:text-destructive"
                      onClick={() => { setApiKeys(prev => prev.filter(k => k.id !== key.id)); toast.error(`Revoked "${key.name}"`); }}
                    >
                      <Trash2 className="size-3"/>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-border pt-2 text-[10px] text-muted-foreground flex flex-col gap-1">
            <p>Include your key in the <code className="font-mono text-accent-brand bg-accent-brand/10 px-1">Authorization: Bearer</code> header.</p>
            <p>Keys inherit the permissions of the creating user.</p>
          </div>
        </div>
      </AccordionSection>

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-destructive">Delete Account</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              This action is permanent and cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-1">
            <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
              <span className="text-xs text-destructive">All sessions, hosts, credentials, and settings will be permanently deleted.</span>
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
