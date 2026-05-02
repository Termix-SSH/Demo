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
} from "@/components/ui/dialog";
import {
  Activity,
  AlertCircle,
  Database,
  Eye,
  KeyRound,
  Network,
  Pencil,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  Shield,
  Trash2,
  User,
  X,
} from "lucide-react";
import { SectionCard, SettingRow } from "@/ui/shared/SectionCard";
import { MOCK_USERS, MOCK_SESSIONS, MOCK_ROLES, MOCK_API_KEYS } from "@/ui/data";
import type { AdminSection } from "@/ui/types";

const ADMIN_SECTIONS: { id: AdminSection; label: string; icon: React.ReactNode }[] = [
  { id: "general",  label: "General",  icon: <Settings className="size-3.5"/>  },
  { id: "oidc",     label: "OIDC",     icon: <Shield className="size-3.5"/>    },
  { id: "users",    label: "Users",    icon: <User className="size-3.5"/>      },
  { id: "sessions", label: "Sessions", icon: <Activity className="size-3.5"/>  },
  { id: "roles",    label: "Roles",    icon: <KeyRound className="size-3.5"/>  },
  { id: "database", label: "Database", icon: <Database className="size-3.5"/> },
  { id: "api-keys", label: "API Keys", icon: <Network className="size-3.5"/>   },
];

function AdminToggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center border-2 transition-colors ${on ? "bg-accent-brand border-accent-brand" : "bg-muted border-border"}`}
    >
      <span className={`pointer-events-none inline-block h-3 w-3 bg-background shadow-sm transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`}/>
    </button>
  );
}

export function AdminSettingsTab() {
  const [section, setSection] = useState<AdminSection>("general");
  const [allowRegistration, setAllowRegistration] = useState(true);
  const [allowPasswordLogin, setAllowPasswordLogin] = useState(true);
  const [allowPasswordReset, setAllowPasswordReset] = useState(true);
  const [sessionTimeout, setSessionTimeout] = useState("24");
  const [statusInterval, setStatusInterval] = useState("60");
  const [metricsInterval, setMetricsInterval] = useState("30");
  const [guacEnabled, setGuacEnabled] = useState(false);
  const [guacUrl, setGuacUrl] = useState("guacd:4822");
  const [logLevel, setLogLevel] = useState("info");
  const [importFile, setImportFile] = useState<string | null>(null);
  const [showCreateRole, setShowCreateRole] = useState(false);
  const [showCreateKey, setShowCreateKey] = useState(false);
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [editUserOpen, setEditUserOpen] = useState(false);
  const [editUserTarget, setEditUserTarget] = useState<typeof MOCK_USERS[0] | null>(null);
  const [linkAccountOpen, setLinkAccountOpen] = useState(false);
  const [linkAccountTarget, setLinkAccountTarget] = useState<{ id: string; username: string } | null>(null);

  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Admin Settings</h1>
          <p className="text-xs text-muted-foreground">Manage users, authentication, sessions, and security</p>
        </div>
      </Card>

      <div className="flex flex-row flex-1 min-h-0 overflow-hidden px-3 py-3 gap-3">
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">
            {ADMIN_SECTIONS.map(s => (
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
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col [&>*]:shrink-0 gap-3">

          {section === "general" && (
            <>
              <SectionCard title="Registration & Login" icon={<User className="size-3.5"/>}>
                <SettingRow label="Allow User Registration" description="Let new users create accounts on their own">
                  <AdminToggle on={allowRegistration} onToggle={() => setAllowRegistration(o => !o)}/>
                </SettingRow>
                <SettingRow label="Allow Password Login" description="Allow users to log in with username and password">
                  <AdminToggle on={allowPasswordLogin} onToggle={() => setAllowPasswordLogin(o => !o)}/>
                </SettingRow>
                <SettingRow label="Allow Password Reset" description="Let users reset their password via email">
                  <AdminToggle on={allowPasswordReset} onToggle={() => setAllowPasswordReset(o => !o)}/>
                </SettingRow>
              </SectionCard>

              <SectionCard title="Session Timeout" icon={<Activity className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">How long before inactive sessions are automatically expired</span>
                  <div className="flex items-center gap-2">
                    <Input type="number" min={1} max={720} value={sessionTimeout} onChange={e => setSessionTimeout(e.target.value)} className="w-24"/>
                    <span className="text-sm text-muted-foreground">hours</span>
                  </div>
                  <span className="text-xs text-muted-foreground">Min: 1 hour · Max: 720 hours (30 days). Existing sessions are unaffected until next activity.</span>
                </div>
              </SectionCard>

              <SectionCard title="Monitoring Defaults" icon={<Activity className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Default polling intervals applied to all hosts unless overridden per-host</span>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Status Check Interval</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={statusInterval} onChange={e => setStatusInterval(e.target.value)} className="w-24"/>
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Metrics Interval</label>
                    <div className="flex items-center gap-2">
                      <Input type="number" value={metricsInterval} onChange={e => setMetricsInterval(e.target.value)} className="w-24"/>
                      <span className="text-sm text-muted-foreground">seconds</span>
                    </div>
                  </div>
                </div>
              </SectionCard>

              <SectionCard title="Guacamole Integration" icon={<Network className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Enable Apache Guacamole for RDP and VNC remote desktop sessions</span>
                  <SettingRow label="Enable Guacamole">
                    <AdminToggle on={guacEnabled} onToggle={() => setGuacEnabled(o => !o)}/>
                  </SettingRow>
                  {guacEnabled && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">guacd URL</label>
                      <Input value={guacUrl} onChange={e => setGuacUrl(e.target.value)} placeholder="guacd:4822"/>
                      <span className="text-xs text-muted-foreground">The host:port of your guacd daemon</span>
                    </div>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Log Level" icon={<Settings className="size-3.5"/>}>
                <div className="flex flex-col gap-3 py-3">
                  <span className="text-xs text-muted-foreground">Controls verbosity of server-side logs</span>
                  <div className="flex gap-2">
                    {["debug", "info", "warn", "error"].map(l => (
                      <button
                        key={l}
                        onClick={() => setLogLevel(l)}
                        className={`px-3 py-1.5 text-xs font-semibold border capitalize transition-colors ${logLevel === l ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                      >
                        {l}
                      </button>
                    ))}
                  </div>
                </div>
              </SectionCard>
            </>
          )}

          {section === "oidc" && (
            <SectionCard title="External Authentication (OIDC)" icon={<Shield className="size-3.5"/>}>
              <div className="flex flex-col gap-3 py-3">
                <span className="text-xs text-muted-foreground">Configure an OpenID Connect provider for SSO login. All fields marked * are required.</span>
                {([
                  { label: "Client ID", placeholder: "your-client-id", required: true },
                  { label: "Client Secret", placeholder: "your-client-secret", type: "password", required: true },
                  { label: "Authorization URL", placeholder: "https://your-provider.com/oauth2/auth", required: true },
                  { label: "Issuer URL", placeholder: "https://your-provider.com", required: true },
                  { label: "Token URL", placeholder: "https://your-provider.com/oauth2/token", required: true },
                  { label: "User Identifier Path", placeholder: "sub", required: true },
                  { label: "Display Name Path", placeholder: "name", required: true },
                  { label: "Scopes", placeholder: "openid email profile", required: true },
                  { label: "Override Userinfo URL", placeholder: "https://your-provider.com/oauth2/userinfo" },
                ] as { label: string; placeholder: string; type?: string; required?: boolean }[]).map(f => (
                  <div key={f.label} className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                      {f.label}{f.required && <span className="text-accent-brand ml-0.5">*</span>}
                    </label>
                    <Input type={f.type ?? "text"} placeholder={f.placeholder}/>
                  </div>
                ))}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Allowed Users</label>
                  <span className="text-xs text-muted-foreground">One email per line. Leave empty to allow all authenticated users.</span>
                  <textarea
                    placeholder={"user@example.com\nanother@example.com"}
                    rows={3}
                    className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
                <div className="flex justify-end gap-2 mt-1">
                  <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
                    <Trash2 className="size-3.5"/>Remove OIDC
                  </Button>
                  <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                    <RefreshCw className="size-3.5"/>Save Configuration
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {section === "users" && (
            <SectionCard title="User Management" icon={<User className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_USERS.length} users</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                    onClick={() => setCreateUserOpen(true)}
                  >
                    <Plus className="size-3.5"/>Create User
                  </Button>
                </div>
              </div>
              {MOCK_USERS.map(user => {
                const authLabel = user.isOidc && user.passwordHash ? "Dual Auth" : user.isOidc ? "OIDC" : "Local";
                return (
                  <div key={user.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex items-center gap-3">
                      <div className="size-8 bg-muted border border-border flex items-center justify-center text-xs font-bold shrink-0">
                        {user.username[0].toUpperCase()}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-semibold">{user.username}</span>
                        <div className="flex items-center gap-1.5">
                          {user.isAdmin && <span className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">ADMIN</span>}
                          <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground">{authLabel.toUpperCase()}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title="Edit user"
                        onClick={() => { setEditUserTarget(user); setEditUserOpen(true); }}
                      >
                        <Pencil className="size-3.5"/>
                      </Button>
                      {user.isOidc && !user.passwordHash && (
                        <Button
                          variant="ghost" size="icon"
                          className="size-7 text-muted-foreground hover:text-foreground"
                          title="Link to password account"
                          onClick={() => { setLinkAccountTarget({ id: user.id, username: user.username }); setLinkAccountOpen(true); }}
                        >
                          <Share2 className="size-3.5"/>
                        </Button>
                      )}
                      {user.isOidc && user.passwordHash && (
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-accent-brand" title="Unlink OIDC">
                          <X className="size-3.5"/>
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive" disabled={user.isAdmin} title="Delete user">
                        <Trash2 className="size-3.5"/>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </SectionCard>
          )}

          {section === "sessions" && (
            <SectionCard title="Session Management" icon={<Activity className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_SESSIONS.length} active sessions</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                </div>
              </div>
              {MOCK_SESSIONS.map(session => (
                <div key={session.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{session.username}</span>
                      {session.isCurrentSession && <span className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">CURRENT</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">{session.deviceInfo}</span>
                    <span className="text-xs text-muted-foreground">
                      Created: {session.createdAt} · Last active: {session.lastActiveAt} · Expires: {session.expiresAt}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-4">
                    <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-destructive h-7 px-2">
                      Revoke All
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-3.5"/>
                    </Button>
                  </div>
                </div>
              ))}
            </SectionCard>
          )}

          {section === "roles" && (
            <>
              <SectionCard title="Role Management" icon={<KeyRound className="size-3.5"/>}>
                <div className="flex items-center justify-between py-2.5 border-b border-border">
                  <span className="text-xs text-muted-foreground">{MOCK_ROLES.length} roles</span>
                  <Button
                    variant="outline" size="sm"
                    className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                    onClick={() => setShowCreateRole(o => !o)}
                  >
                    <Plus className="size-3.5"/>Create Role
                  </Button>
                </div>
                {showCreateRole && (
                  <div className="flex flex-col gap-3 py-3 border-b border-border">
                    <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New Role</span>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Role Name <span className="text-accent-brand">*</span></label>
                      <Input placeholder="e.g., developer"/>
                      <span className="text-xs text-muted-foreground">Lowercase, no spaces. Used internally.</span>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Display Name <span className="text-accent-brand">*</span></label>
                      <Input placeholder="e.g., Developer"/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Description</label>
                      <textarea rows={2} placeholder="Optional description" className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"/>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowCreateRole(false)}>Cancel</Button>
                      <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">Create</Button>
                    </div>
                  </div>
                )}
                {MOCK_ROLES.map(role => (
                  <div key={role.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{role.displayName}</span>
                        {role.isSystem
                          ? <span className="text-[10px] font-semibold px-1.5 py-px border border-border text-muted-foreground">SYSTEM</span>
                          : <span className="text-[10px] font-semibold px-1.5 py-px border border-accent-brand/40 bg-accent-brand/10 text-accent-brand">CUSTOM</span>
                        }
                      </div>
                      <span className="text-xs font-mono text-muted-foreground">{role.name}</span>
                      {role.description && <span className="text-xs text-muted-foreground">{role.description}</span>}
                    </div>
                    {!role.isSystem && (
                      <div className="flex items-center gap-1 shrink-0 ml-4">
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                          <Pencil className="size-3.5"/>
                        </Button>
                        <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive">
                          <Trash2 className="size-3.5"/>
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </SectionCard>
            </>
          )}

          {section === "database" && (
            <SectionCard title="Database" icon={<Database className="size-3.5"/>}>
              <div className="flex items-center justify-between py-3 border-b border-border">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Export Database</span>
                  <span className="text-xs text-muted-foreground">Download a backup of all hosts, credentials, and settings</span>
                </div>
                <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand shrink-0 ml-8">
                  Export
                </Button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Import Database</span>
                  <span className="text-xs text-muted-foreground">
                    {importFile ? `Selected: ${importFile}` : "Restore data from a previously exported .sqlite backup file"}
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-8">
                  <div className="relative">
                    <input
                      type="file" accept=".sqlite,.db"
                      onChange={e => setImportFile(e.target.files?.[0]?.name ?? null)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <Button variant="outline" size="sm" className="pointer-events-none">
                      {importFile ? "Change File" : "Select File"}
                    </Button>
                  </div>
                  {importFile && (
                    <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                      Import
                    </Button>
                  )}
                </div>
              </div>
            </SectionCard>
          )}

          {section === "api-keys" && (
            <SectionCard title="API Keys" icon={<Network className="size-3.5"/>}>
              <div className="flex items-center justify-between py-2.5 border-b border-border">
                <span className="text-xs text-muted-foreground">{MOCK_API_KEYS.length} keys</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                    <RefreshCw className="size-3.5"/>
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
                    onClick={() => setShowCreateKey(o => !o)}
                  >
                    <Plus className="size-3.5"/>Create Key
                  </Button>
                </div>
              </div>
              {showCreateKey && (
                <div className="flex flex-col gap-3 py-3 border-b border-border">
                  <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">New API Key</span>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Key Name <span className="text-accent-brand">*</span></label>
                    <Input placeholder="e.g., CI Pipeline"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Scoped User <span className="text-accent-brand">*</span></label>
                    <Input placeholder="Select a user"/>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">Expires At <span className="text-muted-foreground font-normal">(optional)</span></label>
                    <Input type="date"/>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setShowCreateKey(false)}>Cancel</Button>
                    <Button variant="outline" size="sm" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">Create Key</Button>
                  </div>
                </div>
              )}
              {MOCK_API_KEYS.map(key => (
                <div key={key.id} className="flex items-center justify-between py-3 border-b border-border last:border-0">
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{key.name}</span>
                      {!key.isActive && <span className="text-[10px] font-semibold px-1.5 py-px border border-destructive/40 bg-destructive/10 text-destructive">REVOKED</span>}
                    </div>
                    <span className="text-xs text-muted-foreground">User: {key.username}</span>
                    <span className="text-xs font-mono text-muted-foreground">{key.tokenPrefix}…</span>
                    <span className="text-xs text-muted-foreground">
                      Created: {key.createdAt.split("T")[0]} · Last used: {key.lastUsedAt.split("T")[0]} · Expires: {key.expiresAt ? key.expiresAt.split("T")[0] : "Never"}
                    </span>
                  </div>
                  <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive shrink-0 ml-4" title="Revoke key">
                    <Trash2 className="size-3.5"/>
                  </Button>
                </div>
              ))}
            </SectionCard>
          )}

        </div>
      </div>

      <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Create User</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Create a new local account with a username and password.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username <span className="text-accent-brand">*</span></label>
              <Input placeholder="Enter username"/>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password <span className="text-accent-brand">*</span></label>
              <div className="relative">
                <Input type="password" placeholder="Enter password" className="pr-9"/>
                <button className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <Eye className="size-4"/>
                </button>
              </div>
              <span className="text-xs text-muted-foreground">Minimum 6 characters.</span>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setCreateUserOpen(false)}>Cancel</Button>
            <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
              Create User
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editUserOpen} onOpenChange={setEditUserOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Manage User: {editUserTarget?.username}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Edit roles, admin status, sessions, and account settings.
            </DialogDescription>
          </DialogHeader>
          {editUserTarget && (
            <div className="flex flex-col gap-0 mt-1 divide-y divide-border">
              <div className="grid grid-cols-2 gap-x-6 gap-y-2 py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Username</span>
                  <span className="text-sm font-semibold">{editUserTarget.username}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Auth Type</span>
                  <span className="text-sm font-semibold">
                    {editUserTarget.isOidc && editUserTarget.passwordHash ? "Dual Auth" : editUserTarget.isOidc ? "OIDC" : "Local"}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Admin Status</span>
                  <span className="text-sm font-semibold">{editUserTarget.isAdmin ? "Administrator" : "Regular User"}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">User ID</span>
                  <span className="text-xs font-mono text-muted-foreground truncate">{editUserTarget.id}</span>
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Administrator</span>
                  <span className="text-xs text-muted-foreground">Full access to all admin settings</span>
                </div>
                <AdminToggle on={editUserTarget.isAdmin} onToggle={() => {}}/>
              </div>
              <div className="flex flex-col gap-2 py-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Roles</span>
                <div className="flex flex-wrap gap-1.5">
                  {MOCK_ROLES.filter(r => !r.isSystem).map(role => (
                    <div key={role.id} className="flex items-center gap-1 px-2 py-1 border border-border text-xs">
                      <span>{role.displayName}</span>
                      <button className="text-muted-foreground hover:text-destructive ml-1"><X className="size-3"/></button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" className="h-7 text-xs border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
                    <Plus className="size-3"/>Add Role
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between py-3">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-medium">Revoke All Sessions</span>
                  <span className="text-xs text-muted-foreground">Force this user to log in again on all devices</span>
                </div>
                <Button variant="outline" size="sm" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive shrink-0 ml-8">
                  Revoke
                </Button>
              </div>
              <div className="flex flex-col gap-2 py-3">
                <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                  <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
                  <span className="text-xs text-destructive">Deleting this user is permanent. All their data will be removed.</span>
                </div>
                <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={editUserTarget.isAdmin}>
                  <Trash2 className="size-3.5"/>Delete {editUserTarget.username}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={linkAccountOpen} onOpenChange={setLinkAccountOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Link OIDC to Password Account</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Merge the OIDC account <span className="font-semibold text-foreground">{linkAccountTarget?.username}</span> with an existing local account.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 mt-1">
            <div className="flex items-start gap-2.5 border border-destructive/30 bg-destructive/5 px-3 py-2.5">
              <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5"/>
              <div className="flex flex-col gap-1 text-xs text-destructive">
                <span>This will:</span>
                <ul className="list-disc list-inside space-y-0.5 ml-1">
                  <li>Delete the OIDC-only account</li>
                  <li>Add OIDC login capability to the target account</li>
                  <li>Allow the user to log in via both OIDC and password</li>
                </ul>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Target Username <span className="text-accent-brand">*</span></label>
              <Input placeholder="Enter the local account username to link to"/>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-2">
            <Button variant="ghost" onClick={() => setLinkAccountOpen(false)}>Cancel</Button>
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive">
              Link Accounts
            </Button>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}
