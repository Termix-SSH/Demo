import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Activity, ArrowLeft, Box, Check, ChevronDown, ChevronRight, ChevronUp,
  Copy, Download, Filter, Folder, FolderOpen, FolderSearch, Globe, Info,
  KeyRound, LayoutDashboard, ListChecks, Lock, MoreHorizontal, Monitor, Network, Palette,
  Pencil, Pin, Plus, RefreshCw, Search, Server, Settings, Share2, Shield,
  Tag, Terminal, Trash2, Upload, User, Users, X, Zap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { SectionCard, SettingRow, FakeSwitch } from "@/ui/shared/SectionCard";
import { hosts, MOCK_CREDENTIALS } from "@/ui/data";
import type { Host, Credential } from "@/ui/types";

const HOST_TABS = [
  { id: "general",  label: "General",         icon: <Settings className="size-3.5"    /> },
  { id: "terminal", label: "Terminal",         icon: <Terminal className="size-3.5"    /> },
  { id: "tunnels",  label: "Tunnels",          icon: <Network className="size-3.5"     /> },
  { id: "docker",   label: "Docker",           icon: <Box className="size-3.5"         /> },
  { id: "files",    label: "Files",            icon: <FolderSearch className="size-3.5"/> },
  { id: "stats",    label: "Stats & Actions",  icon: <Activity className="size-3.5"    /> },
  { id: "remote",   label: "Remote Desktop",   icon: <Monitor className="size-3.5"     /> },
  { id: "sharing",  label: "Sharing",          icon: <Share2 className="size-3.5"      /> },
];

const CREDENTIAL_TABS = [
  { id: "general", label: "General",        icon: <Info className="size-3.5" /> },
  { id: "auth",    label: "Authentication", icon: <Lock className="size-3.5" /> },
];

function HostRow({ host, selectionMode, selected, onToggleSelect, onEdit, onDelete, onDragStart, onDragEnd }: {
  host: Host;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  return (
    <div
      draggable={!!onDragStart && !selectionMode}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={selectionMode ? onToggleSelect : undefined}
      className={`flex items-center justify-between px-3 py-2.5 border-b border-border last:border-0 group transition-colors ${selectionMode ? "cursor-pointer" : ""} ${selected ? "bg-accent-brand/5" : "hover:bg-muted/40"} ${onDragStart && !selectionMode ? "cursor-grab active:cursor-grabbing" : ""}`}
    >
      <div className="flex items-center gap-3 min-w-0">
        {selectionMode && (
          <div className="shrink-0">
            <div className={`size-4 border-2 flex items-center justify-center transition-colors ${selected ? "border-accent-brand bg-accent-brand" : "border-border bg-background"}`}>
              {selected && <Check className="size-2.5 text-background"/>}
            </div>
          </div>
        )}
        <div className={`size-2 rounded-full shrink-0 ${host.online ? "bg-accent-brand shadow-[0_0_4px_rgba(251,146,60,0.6)]" : "bg-muted-foreground/30"}`}/>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold truncate">{host.name}</span>
            {host.pin && <Pin className="size-3 text-accent-brand/60 shrink-0"/>}
            <span className={`text-[9px] px-1.5 py-0.5 font-bold border shrink-0 ${
              host.connectionType === "ssh" ? "border-border text-muted-foreground" :
              host.connectionType === "rdp" ? "border-blue-400/30 text-blue-400" : "border-border text-muted-foreground"
            }`}>{host.connectionType.toUpperCase()}</span>
          </div>
          <span className="text-xs text-muted-foreground truncate">{host.user}@{host.address}:{host.port}</span>
        </div>
        <div className="hidden md:flex items-center gap-1.5 ml-2">
          {host.tags?.slice(0, 3).map(tag => (
            <span key={tag} className="text-[10px] px-1.5 py-0.5 border border-border bg-muted/30 text-muted-foreground lowercase">{tag}</span>
          ))}
          {(host.tags?.length || 0) > 3 && <span className="text-[10px] text-muted-foreground">+{(host.tags?.length || 0) - 3}</span>}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0">
        {host.online && (
          <div className="hidden lg:flex items-center gap-3 mr-2">
            <div className="flex flex-col gap-0.5 w-16">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">CPU</span>
                <span className="text-[10px] font-bold text-accent-brand">{host.cpu}%</span>
              </div>
              <div className="h-0.5 bg-muted w-full"><div className="h-full bg-accent-brand" style={{ width: `${host.cpu}%` }}/></div>
            </div>
            <div className="flex flex-col gap-0.5 w-16">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">RAM</span>
                <span className="text-[10px] font-bold text-accent-brand">{host.ram}%</span>
              </div>
              <div className="h-0.5 bg-muted w-full"><div className="h-full bg-accent-brand" style={{ width: `${host.ram}%` }}/></div>
            </div>
          </div>
        )}

        {!selectionMode && (
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {host.enableTerminal && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open Terminal">
                <Terminal className="size-3.5"/>
              </Button>
            )}
            {host.enableFileManager && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open File Manager">
                <FolderSearch className="size-3.5"/>
              </Button>
            )}
            {host.enableDocker && (
              <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Open Docker">
                <Box className="size-3.5"/>
              </Button>
            )}
            <Separator orientation="vertical" className="h-4 mx-0.5"/>
            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" title="Edit Host" onClick={onEdit}>
              <Pencil className="size-3.5"/>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                  <MoreHorizontal className="size-3.5"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="text-xs">
                <DropdownMenuItem onClick={() => toast.success("Host cloned")}>
                  <Copy className="size-3.5 mr-2"/>Clone Host
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(`${host.user}@${host.address}`); toast.success("Copied to clipboard"); }}>
                  <Copy className="size-3.5 mr-2"/>Copy Address
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
                  <Trash2 className="size-3.5 mr-2"/>Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        <span className="text-[10px] text-muted-foreground/60 w-14 text-right shrink-0">{host.lastAccess}</span>
      </div>
    </div>
  );
}

function HostEditor({ host, activeTab, onBack, connectionType, onConnectionTypeChange }: {
  host: Host | null;
  activeTab: string;
  onBack: () => void;
  connectionType: string;
  onConnectionTypeChange: (t: string) => void;
}) {
  const [authMethod, setAuthMethod] = useState(host?.authType || "password");
  const setConnectionType = onConnectionTypeChange;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {activeTab === "general" && (
          <>
            {/* Connection type — most important, shown prominently at top */}
            <div className="flex flex-col border border-border bg-card">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border">
                <span className="text-muted-foreground"><Globe className="size-3.5"/></span>
                <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground flex-1">Connection Type</span>
              </div>
              <div className="grid grid-cols-4 divide-x divide-border border-b border-border">
                {([
                  { id: "ssh",    label: "SSH",     desc: "Secure Shell",         icon: <Terminal className="size-4"/> },
                  { id: "rdp",    label: "RDP",     desc: "Remote Desktop",       icon: <Monitor className="size-4"/> },
                  { id: "vnc",    label: "VNC",     desc: "Virtual Network",      icon: <Monitor className="size-4"/> },
                  { id: "telnet", label: "Telnet",  desc: "Unencrypted shell",    icon: <Terminal className="size-4"/> },
                ] as const).map(t => (
                  <button key={t.id} onClick={() => setConnectionType(t.id)}
                    className={`flex flex-col items-center gap-1.5 py-4 px-3 transition-colors ${connectionType === t.id ? "bg-accent-brand/10 text-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
                    {t.icon}
                    <span className="text-xs font-bold">{t.label}</span>
                    <span className={`text-[10px] ${connectionType === t.id ? "text-accent-brand/70" : "text-muted-foreground/60"}`}>{t.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <SectionCard title="Connection Details" icon={<Globe className="size-3.5" />}>
              <div className="flex flex-col gap-4 py-3">
                <div className="grid grid-cols-12 gap-4">
                  <div className="flex flex-col gap-1.5 col-span-8">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Address / IP</label>
                    <Input placeholder="10.0.0.1 or example.com" defaultValue={host?.address || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5 col-span-4">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port</label>
                    <Input type="number" placeholder={connectionType === "rdp" ? "3389" : connectionType === "vnc" ? "5900" : connectionType === "telnet" ? "23" : "22"} defaultValue={host?.port || (connectionType === "rdp" ? 3389 : connectionType === "vnc" ? 5900 : connectionType === "telnet" ? 23 : 22)} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Friendly Name</label>
                    <Input placeholder="e.g. Web Server Production" defaultValue={host?.name || ""} />
                  </div>
                  {connectionType === "ssh" && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MAC Address</label>
                      <Input placeholder="AA:BB:CC:DD:EE:FF" defaultValue={host?.macAddress || ""} />
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Authentication" icon={<Shield className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                {connectionType === "ssh" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Auth Method</label>
                      <div className="flex flex-wrap gap-2">
                        {["password", "key", "credential", "none", "opkssh"].map(m => (
                          <button key={m} onClick={() => setAuthMethod(m as any)}
                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${authMethod === m ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                          >{m}</button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 border-t border-border pt-4 mt-1">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                        <Input placeholder="root" defaultValue={host?.user || ""} />
                      </div>
                      {authMethod === "password" && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                          <Input type="password" placeholder="••••••••" defaultValue={host?.password || ""} />
                        </div>
                      )}
                      {authMethod === "key" && (
                        <>
                          <div className="flex flex-col gap-1.5 col-span-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Private Key</label>
                            <textarea placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows={5} defaultValue={host?.key || ""}
                              className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"/>
                          </div>
                          <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Passphrase</label>
                            <Input type="password" placeholder="Optional" defaultValue={host?.keyPassword || ""} />
                          </div>
                        </>
                      )}
                      {authMethod === "credential" && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Stored Credential</label>
                          <select defaultValue={host?.credentialId || ""} className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                            <option value="">Select a credential...</option>
                            {MOCK_CREDENTIALS.map(c => (
                              <option key={c.id} value={c.id}>{c.name} ({c.username})</option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    <SettingRow label="Force Keyboard Interactive" description="Force manual password entry even if keys are present">
                      <FakeSwitch />
                    </SettingRow>
                  </>
                )}

                {connectionType === "rdp" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                      <Input placeholder="Administrator" defaultValue={host?.user || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                      <Input type="password" placeholder="••••••••" defaultValue={host?.password || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Domain</label>
                      <Input placeholder="WORKGROUP" defaultValue={host?.domain || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security</label>
                      <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                        <option value="any">Any (auto-negotiate)</option>
                        <option value="nla">NLA (Network Level Auth)</option>
                        <option value="tls">TLS</option>
                        <option value="rdp">RDP classic</option>
                      </select>
                    </div>
                    <div className="col-span-2">
                      <SettingRow label="Ignore Certificate Errors" description="Skip TLS certificate validation (not recommended for production)">
                        <FakeSwitch defaultChecked={host?.ignoreCert} />
                      </SettingRow>
                    </div>
                  </div>
                )}

                {connectionType === "vnc" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">VNC Password</label>
                      <Input type="password" placeholder="••••••••" defaultValue={host?.password || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username (optional)</label>
                      <Input placeholder="Leave blank if not required" defaultValue={host?.user || ""} />
                    </div>
                  </div>
                )}

                {connectionType === "telnet" && (
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
                      <Input placeholder="admin" defaultValue={host?.user || ""} />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                      <Input type="password" placeholder="••••••••" defaultValue={host?.password || ""} />
                    </div>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard title="Proxy & Bastion" icon={<Network className="size-3.5" />}>
              <div className="flex flex-col gap-4 py-3">
                <SettingRow label="Use SOCKS5 Proxy" description="Route connection through a proxy server">
                  <FakeSwitch defaultChecked={host?.useSocks5} />
                </SettingRow>
                <div className="flex flex-col gap-3 p-3 bg-muted/20 border border-border">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Proxy Chain</span>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Node</Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 p-2 bg-background border border-border">
                      <span className="text-[10px] font-bold text-muted-foreground">1.</span>
                      <Input className="h-7 text-xs flex-1" placeholder="Host" defaultValue="proxy.internal" />
                      <Input className="h-7 text-xs w-20" placeholder="Port" defaultValue="1080" />
                      <Button variant="ghost" size="icon" className="size-7 text-destructive"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Jump Host Chain</span>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Jump</Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2 p-2 bg-background border border-border">
                      <span className="text-[10px] font-bold text-muted-foreground">1.</span>
                      <select className="flex h-7 flex-1 border border-border bg-background px-2 py-0 text-xs outline-none focus:ring-1 focus:ring-ring">
                        <option>Select a server...</option>
                        {hosts.map(h => <option key={h.id}>{h.name}</option>)}
                      </select>
                      <Button variant="ghost" size="icon" className="size-7 text-destructive"><Trash2 className="size-3.5" /></Button>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Folder & Advanced" icon={<Tag className="size-3.5" />}>
              <div className="grid grid-cols-2 gap-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Folder</label>
                  <Input placeholder="e.g. Production" defaultValue={host?.folder || ""} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</label>
                  <Input placeholder="space separated" defaultValue={host?.tags?.join(" ") || ""} />
                </div>
                <div className="flex flex-col gap-1.5 col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Private Notes</label>
                  <textarea rows={3} placeholder="Details about this server..." className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring" defaultValue={host?.notes || ""} />
                </div>
                <SettingRow label="Pin to Top" description="Always show this host at the top of the list">
                  <FakeSwitch defaultChecked={host?.pin} />
                </SettingRow>
              </div>
              <div className="flex flex-col gap-3 border-t border-border pt-4 pb-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Port Knocking Sequence</span>
                  <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Knock</Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex items-center gap-1.5 p-1.5 bg-muted/30 border border-border">
                    <Input className="h-7 text-xs w-16" placeholder="Port" />
                    <select className="h-7 text-[10px] bg-background border border-border"><option>TCP</option><option>UDP</option></select>
                    <Input className="h-7 text-xs w-14" placeholder="Delay" />
                    <button className="text-destructive p-1"><X className="size-3"/></button>
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === "terminal" && (
          <>
            <SectionCard title="Terminal Appearance" icon={<Palette className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Theme Preview</label>
                  <div className="w-full bg-[#111210] border border-border font-mono text-xs leading-relaxed overflow-hidden">
                    <div className="px-3 py-2.5 flex flex-col gap-0.5">
                      <div><span className="text-[#5af78e]">deploy@web-01</span><span className="text-[#555]">:</span><span className="text-[#57c7ff]">~</span><span className="text-[#555]">$</span><span className="text-[#f1f1f0]"> ls -la</span></div>
                      <div className="text-[#555]">total 48</div>
                      <div><span className="text-[#9aedfe]">drwxr-xr-x</span><span className="text-[#555]"> 5 deploy deploy 4096 May  1 09:12 </span><span className="text-[#57c7ff]">.</span></div>
                      <div><span className="text-[#9aedfe]">drwxr-xr-x</span><span className="text-[#555]"> 3 root   root   4096 Apr 15 18:44 </span><span className="text-[#57c7ff]">..</span></div>
                      <div><span className="text-[#9aedfe]">-rw-r--r--</span><span className="text-[#555]"> 1 deploy deploy  220 Apr 15 18:44 </span><span className="text-[#f1f1f0]">.bash_logout</span></div>
                      <div><span className="text-[#9aedfe]">-rwxr-xr-x</span><span className="text-[#555]"> 1 deploy deploy 8192 May  1 08:55 </span><span className="text-[#5af78e]">deploy.sh</span></div>
                      <div className="flex items-center gap-0.5 mt-0.5"><span className="text-[#5af78e]">deploy@web-01</span><span className="text-[#555]">:</span><span className="text-[#57c7ff]">~</span><span className="text-[#555]">$</span><span className="text-[#f1f1f0]"> </span><span className="inline-block w-1.5 h-3.5 bg-[#f1f1f0] animate-pulse"/></div>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color Theme</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option>Termix Dark</option><option>One Dark</option><option>Monokai</option><option>Dracula</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Family</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring font-mono">
                      <option>JetBrains Mono</option><option>Fira Code</option><option>Source Code Pro</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Size</label>
                    <Input type="number" defaultValue={14} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cursor Style</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option>Block</option><option>Underline</option><option>Bar</option>
                    </select>
                  </div>
                </div>
                <SettingRow label="Cursor Blinking" description="Enable blinking animation for the terminal cursor">
                  <FakeSwitch defaultChecked={true} />
                </SettingRow>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Letter Spacing</label>
                    <Input type="number" step="0.1" defaultValue={0} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Line Height</label>
                    <Input type="number" step="0.1" defaultValue={1.2} />
                  </div>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Behavior & Advanced" icon={<Zap className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scrollback Buffer</label>
                  <Input type="number" defaultValue={10000} />
                  <span className="text-[10px] text-muted-foreground">Maximum number of lines kept in history</span>
                </div>
                <SettingRow label="SSH Agent Forwarding" description="Pass your local SSH keys to this host"><FakeSwitch /></SettingRow>
                <SettingRow label="Enable Auto-Mosh" description="Prefer Mosh over SSH if available"><FakeSwitch /></SettingRow>
                <SettingRow label="Enable Auto-Tmux" description="Automatically launch or attach to tmux session"><FakeSwitch /></SettingRow>
                <SettingRow label="Sudo Password Auto-fill" description="Automatically provide sudo password when prompted"><FakeSwitch /></SettingRow>
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Environment Variables</span>
                    <Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Variable</Button>
                  </div>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <Input className="h-7 text-xs flex-1" placeholder="KEY" defaultValue="NODE_ENV" />
                      <Input className="h-7 text-xs flex-1" placeholder="VALUE" defaultValue="production" />
                      <button className="text-destructive"><X className="size-4"/></button>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 border-t border-border pt-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Keepalive Interval</label>
                    <Input type="number" defaultValue={30} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Max Keepalive Misses</label>
                    <Input type="number" defaultValue={3} />
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === "tunnels" && (
          <>
            <SectionCard title="Tunnel Settings" icon={<Network className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <SettingRow label="Enable Tunneling" description="Enable SSH tunnel functionality for this host">
                  <FakeSwitch defaultChecked={host?.enableTunnel ?? true} />
                </SettingRow>
                <div className="text-xs text-muted-foreground p-3 bg-muted/30 border border-border space-y-1">
                  <p><strong>Requirements:</strong> The SSH server must have <code className="bg-muted px-1">GatewayPorts yes</code>, <code className="bg-muted px-1">AllowTcpForwarding yes</code>, and <code className="bg-muted px-1">PermitRootLogin yes</code> set in <code className="bg-muted px-1">/etc/ssh/sshd_config</code>.</p>
                </div>
              </div>
            </SectionCard>
            <SectionCard
              title="Server Tunnels"
              icon={<Network className="size-3.5"/>}
              action={<Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Tunnel</Button>}
            >
              <div className="flex flex-col gap-3 py-3">
                {[
                  { mode: "remote",  endpointHost: "prod-db",    endpointPort: 5432, currentHostIp: "0.0.0.0", src: 5432, maxRetries: 3, retryInterval: 10, autoStart: true  },
                  { mode: "local",   endpointHost: "web-server",  endpointPort: 80,   currentHostIp: "127.0.0.1", src: 8080, maxRetries: 3, retryInterval: 10, autoStart: false },
                  { mode: "dynamic", endpointHost: "",            endpointPort: 0,    currentHostIp: "127.0.0.1", src: 1080, maxRetries: 3, retryInterval: 10, autoStart: true  },
                ].map((tun, i) => (
                  <div key={i} className="flex flex-col gap-3 p-3 border border-border bg-muted/20 relative group">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-muted-foreground">Server Tunnel {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div className={`size-1.5 rounded-full ${tun.autoStart ? "bg-accent-brand" : "bg-muted-foreground/40"}`}/>
                          <span className={`text-[10px] font-bold uppercase tracking-widest ${tun.autoStart ? "text-accent-brand" : "text-muted-foreground"}`}>{tun.autoStart ? "Connected" : "Idle"}</span>
                        </div>
                        <Button variant="outline" size="sm" className="h-6 text-[10px] px-2">Connect</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={() => toast.success("Tunnel removed")}>Delete</Button>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground">Tunnel Type</label>
                      <div className="flex gap-2">
                        {["remote", "local", "dynamic"].map(m => (
                          <button key={m} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${tun.mode === m ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}>{m}</button>
                        ))}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {tun.mode === "remote" ? "Remote (R→L): Opens a port on the remote server and forwards traffic to a local service." :
                         tun.mode === "local"  ? "Local (L→R): Opens a port locally and forwards traffic through the SSH server to a remote service." :
                                                  "Dynamic (SOCKS): Creates a local SOCKS proxy that routes traffic through the SSH server."}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      {tun.mode !== "dynamic" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground">Endpoint SSH Config</label>
                          <select defaultValue={tun.endpointHost || ""} className="h-7 text-xs bg-background border border-border px-2 outline-none focus:ring-1 focus:ring-ring">
                            <option value="">Select a host...</option>
                            {hosts.map(h => <option key={h.id} value={h.name}>{h.name}</option>)}
                          </select>
                        </div>
                      )}
                      {tun.mode !== "dynamic" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground">{tun.mode === "remote" ? "Remote Port" : "Endpoint Port"}</label>
                          <Input className="h-7 text-xs" defaultValue={tun.endpointPort} />
                        </div>
                      )}
                      {tun.mode !== "dynamic" && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[10px] font-bold text-muted-foreground">Current Host IP</label>
                          <Input className="h-7 text-xs" placeholder="0.0.0.0 or 127.0.0.1" defaultValue={tun.currentHostIp} />
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground">{tun.mode === "remote" ? "Local Port" : "Source Port"}</label>
                        <Input className="h-7 text-xs" defaultValue={tun.src} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground">Max Retries</label>
                        <Input className="h-7 text-xs" type="number" defaultValue={tun.maxRetries} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground">Retry Interval (s)</label>
                        <Input className="h-7 text-xs" type="number" defaultValue={tun.retryInterval} />
                      </div>
                    </div>
                    <SettingRow label="Auto-start" description="Automatically connect this tunnel when the host is loaded">
                      <FakeSwitch defaultChecked={tun.autoStart} />
                    </SettingRow>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === "docker" && (
          <SectionCard title="Docker Integration" icon={<Box className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-3">
              <SettingRow label="Enable Docker" description="Monitor and manage containers on this host via the Docker socket">
                <FakeSwitch defaultChecked={host?.enableDocker} />
              </SettingRow>
            </div>
          </SectionCard>
        )}

        {activeTab === "files" && (
          <SectionCard title="File Manager" icon={<FolderSearch className="size-3.5"/>}>
            <div className="flex flex-col gap-4 py-3">
              <SettingRow label="Enable File Manager" description="Browse and manage files on this host over SFTP">
                <FakeSwitch defaultChecked={host?.enableFileManager ?? true} />
              </SettingRow>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Default Path</label>
                <Input placeholder="~" defaultValue={host?.defaultPath || "~"} />
                <span className="text-[10px] text-muted-foreground">The directory to open when the file manager launches for this host.</span>
              </div>
            </div>
          </SectionCard>
        )}

        {activeTab === "stats" && (
          <>
            <SectionCard title="Status Checks" icon={<Activity className="size-3.5"/>}>
              <div className="flex flex-col gap-0 py-1">
                <SettingRow label="Enable Status Checks" description="Periodically ping this host to verify availability">
                  <FakeSwitch defaultChecked={host?.statsConfig?.statusCheckEnabled ?? true} />
                </SettingRow>
                <SettingRow label="Use Global Interval" description="Override with the server-wide status check interval">
                  <FakeSwitch defaultChecked={host?.statsConfig?.useGlobalStatusInterval ?? true} />
                </SettingRow>
                <SettingRow label="Check Interval (s)" description="Seconds between each connectivity ping">
                  <Input type="number" defaultValue={host?.statsConfig?.statusCheckInterval ?? 60} className="w-20 h-7 text-xs text-right" />
                </SettingRow>
              </div>
            </SectionCard>
            <SectionCard title="Metrics Collection" icon={<Server className="size-3.5"/>}>
              <div className="flex flex-col gap-0 py-1">
                <SettingRow label="Enable Metrics" description="Collect CPU, RAM, disk, and network usage from this host">
                  <FakeSwitch defaultChecked={host?.statsConfig?.metricsEnabled ?? true} />
                </SettingRow>
                <SettingRow label="Use Global Interval" description="Override with the server-wide metrics interval">
                  <FakeSwitch defaultChecked={host?.statsConfig?.useGlobalMetricsInterval ?? true} />
                </SettingRow>
                <SettingRow label="Metrics Interval (s)" description="Seconds between metric snapshots">
                  <Input type="number" defaultValue={host?.statsConfig?.metricsInterval ?? 30} className="w-20 h-7 text-xs text-right" />
                </SettingRow>
              </div>
            </SectionCard>
            <SectionCard title="Visible Widgets" icon={<LayoutDashboard className="size-3.5"/>}>
              <div className="flex flex-col gap-0 py-1">
                {[
                  { id: "cpu",       label: "CPU Usage",       desc: "CPU percent, load averages, sparkline graph" },
                  { id: "memory",    label: "Memory",          desc: "RAM usage, swap, cached" },
                  { id: "disk",      label: "Storage",         desc: "Disk usage per mount point" },
                  { id: "disk_io",   label: "Disk I/O",        desc: "Read/write MB/s per device" },
                  { id: "network",   label: "Network",         desc: "Interface list and bandwidth" },
                  { id: "processes", label: "Top Processes",   desc: "PID, CPU%, MEM%, command" },
                  { id: "logins",    label: "Recent Logins",   desc: "Successful and failed login events" },
                  { id: "ports",     label: "Listening Ports", desc: "Open ports with process and state" },
                  { id: "security",  label: "Security",        desc: "Firewall, AppArmor, SELinux status" },
                ].map(w => (
                  <SettingRow key={w.id} label={w.label} description={w.desc}>
                    <FakeSwitch defaultChecked={(host?.statsConfig?.enabledWidgets ?? []).includes(w.id) || !host?.statsConfig} />
                  </SettingRow>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Quick Actions" icon={<Zap className="size-3.5"/>}
              action={<Button variant="outline" size="sm" className="h-6 text-[10px] px-2 border-accent-brand/40 text-accent-brand"><Plus className="size-3 mr-1" /> Add Action</Button>}
            >
              <div className="flex flex-col gap-3 py-3">
                <p className="text-xs text-muted-foreground">Quick actions appear as buttons in the Server Stats toolbar for one-click command execution.</p>
                {[
                  { name: "Restart Nginx",  snippet: "System Update" },
                  { name: "Clear Logs",     snippet: "Clear Logs"    },
                ].map((a, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-muted/20 border border-border group">
                    <Input className="h-7 text-xs flex-1" placeholder="Button label" defaultValue={a.name} />
                    <select className="flex h-7 flex-1 border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option>System Update</option><option>Clear Logs</option><option>Check SSL</option><option>Disk Usage Report</option>
                    </select>
                    <button className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"><Trash2 className="size-3.5"/></button>
                  </div>
                ))}
                {host?.quickActions?.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-4 text-muted-foreground/40 gap-1.5">
                    <Zap className="size-6"/>
                    <span className="text-xs">No quick actions yet.</span>
                  </div>
                )}
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === "remote" && (
          <>
            {/* RDP Connection Settings */}
            {connectionType === "rdp" && (
              <SectionCard title="Connection Settings" icon={<Shield className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Security Mode</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="any">Any</option>
                      <option value="nla">NLA</option>
                      <option value="nla-ext">NLA Extended</option>
                      <option value="tls">TLS</option>
                      <option value="vmconnect">VMConnect</option>
                      <option value="rdp">RDP</option>
                    </select>
                  </div>
                  <SettingRow label="Ignore Certificate" description="Allow connections to hosts with self-signed certificates">
                    <FakeSwitch defaultChecked={host?.ignoreCert} />
                  </SettingRow>
                </div>
              </SectionCard>
            )}

            {/* Display Settings */}
            <SectionCard title="Display Settings" icon={<Monitor className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                {connectionType !== "telnet" && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color Depth</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option value="8">8-bit</option>
                      <option value="16">16-bit</option>
                      <option value="24">24-bit</option>
                      <option value="32">32-bit</option>
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Width</label>
                    <Input type="number" placeholder="Auto" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Height</label>
                    <Input type="number" placeholder="Auto" />
                  </div>
                </div>
                {connectionType !== "telnet" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">DPI</label>
                      <Input type="number" placeholder="96" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Resize Method</label>
                      <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                        <option value="auto">Auto</option>
                        <option value="display-update">Display Update</option>
                        <option value="reconnect">Reconnect</option>
                      </select>
                    </div>
                    <SettingRow label="Force Lossless" description="Force lossless image encoding (higher quality, more bandwidth)">
                      <FakeSwitch />
                    </SettingRow>
                  </>
                )}
              </div>
            </SectionCard>

            {/* Telnet Terminal Settings */}
            {connectionType === "telnet" && (
              <SectionCard title="Terminal Settings" icon={<Terminal className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Terminal Type</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option value="xterm">xterm</option>
                      <option value="xterm-256color">xterm-256color</option>
                      <option value="vt100">VT100</option>
                      <option value="vt220">VT220</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Name</label>
                    <Input placeholder="monospace" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Font Size</label>
                    <Input type="number" defaultValue={12} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Color Scheme</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option value="black-white">Black on White</option>
                      <option value="white-black">White on Black</option>
                      <option value="gray-black">Gray on Black</option>
                      <option value="green-black">Green on Black</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Backspace Key</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option value="127">DEL (127)</option>
                      <option value="8">BS (8)</option>
                    </select>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Audio */}
            {(connectionType === "rdp" || connectionType === "vnc") && (
              <SectionCard title="Audio Settings" icon={<Activity className="size-3.5"/>}>
                <div className="flex flex-col gap-0 py-1">
                  <SettingRow label="Disable Audio" description="Mute all audio from the remote session">
                    <FakeSwitch />
                  </SettingRow>
                  {connectionType === "rdp" && (
                    <SettingRow label="Enable Audio Input (Microphone)" description="Forward local microphone to the remote session">
                      <FakeSwitch />
                    </SettingRow>
                  )}
                </div>
              </SectionCard>
            )}

            {/* RDP Performance */}
            {connectionType === "rdp" && (
              <SectionCard title="RDP Performance" icon={<Zap className="size-3.5"/>}>
                <div className="flex flex-col gap-0 py-1">
                  <SettingRow label="Wallpaper" description="Show desktop wallpaper (disabling improves performance)"><FakeSwitch /></SettingRow>
                  <SettingRow label="Theming" description="Enable visual themes and styles"><FakeSwitch /></SettingRow>
                  <SettingRow label="Font Smoothing" description="Enable ClearType font rendering"><FakeSwitch defaultChecked={true} /></SettingRow>
                  <SettingRow label="Full Window Drag" description="Show window contents while dragging"><FakeSwitch /></SettingRow>
                  <SettingRow label="Desktop Composition" description="Enable Aero glass effects"><FakeSwitch /></SettingRow>
                  <SettingRow label="Menu Animations" description="Enable menu fade and slide animations"><FakeSwitch /></SettingRow>
                  <SettingRow label="Disable Bitmap Caching" description="Turn off bitmap cache (may help with glitches)"><FakeSwitch /></SettingRow>
                  <SettingRow label="Disable Offscreen Caching" description="Turn off offscreen cache"><FakeSwitch /></SettingRow>
                  <SettingRow label="Disable Glyph Caching" description="Turn off glyph cache"><FakeSwitch /></SettingRow>
                  <SettingRow label="Enable GFX" description="Use RemoteFX graphics pipeline"><FakeSwitch defaultChecked={true} /></SettingRow>
                </div>
              </SectionCard>
            )}

            {/* RDP Device Redirection */}
            {connectionType === "rdp" && (
              <SectionCard title="Device Redirection" icon={<Settings className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <SettingRow label="Enable Printing" description="Redirect local printers to the remote session"><FakeSwitch /></SettingRow>
                  <SettingRow label="Enable Drive Redirection" description="Map a local folder as a drive in the remote session"><FakeSwitch /></SettingRow>
                  <div className="grid grid-cols-2 gap-3 border-t border-border pt-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Drive Name</label>
                      <Input placeholder="Termix Drive" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Drive Path</label>
                      <Input placeholder="/home/user/shared" />
                    </div>
                  </div>
                  <SettingRow label="Create Drive Path" description="Automatically create the folder if it does not exist"><FakeSwitch /></SettingRow>
                  <SettingRow label="Disable Download" description="Prevent downloading files from the remote session"><FakeSwitch /></SettingRow>
                  <SettingRow label="Disable Upload" description="Prevent uploading files to the remote session"><FakeSwitch /></SettingRow>
                  <SettingRow label="Enable Touch" description="Enable touch input forwarding"><FakeSwitch /></SettingRow>
                </div>
              </SectionCard>
            )}

            {/* RDP Session */}
            {connectionType === "rdp" && (
              <SectionCard title="Session" icon={<Server className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Client Name</label>
                    <Input placeholder="Termix" />
                  </div>
                  <SettingRow label="Console Session" description="Connect to the console (session 0) instead of a new session"><FakeSwitch /></SettingRow>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Initial Program</label>
                    <Input placeholder="e.g. cmd.exe" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Server Layout</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option>en-us-qwerty</option><option>en-gb-qwerty</option>
                      <option>de-de-qwertz</option><option>fr-fr-azerty</option>
                      <option>it-it-qwerty</option><option>sv-se-qwerty</option>
                      <option>ja-jp-qwerty</option><option>pt-br-qwerty</option>
                      <option>es-es-qwerty</option><option>failsafe</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Timezone</label>
                    <Input placeholder="e.g. America/New_York" />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* RDP Gateway */}
            {connectionType === "rdp" && (
              <SectionCard title="Gateway" icon={<Network className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gateway Hostname</label>
                      <Input placeholder="gateway.example.com" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gateway Port</label>
                      <Input type="number" placeholder="443" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gateway Username</label>
                      <Input placeholder="user" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gateway Password</label>
                      <Input type="password" placeholder="••••••••" />
                    </div>
                    <div className="flex flex-col gap-1.5 col-span-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Gateway Domain</label>
                      <Input placeholder="DOMAIN" />
                    </div>
                  </div>
                </div>
              </SectionCard>
            )}

            {/* RDP RemoteApp */}
            {connectionType === "rdp" && (
              <SectionCard title="RemoteApp" icon={<Monitor className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">RemoteApp Program</label>
                    <Input placeholder="||MyApp" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Working Directory</label>
                    <Input placeholder="C:\Apps\MyApp" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Arguments</label>
                    <Input placeholder="--flag value" />
                  </div>
                </div>
              </SectionCard>
            )}

            {/* Clipboard */}
            <SectionCard title="Clipboard" icon={<Copy className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Normalize Line Endings</label>
                  <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                    <option value="auto">Auto</option>
                    <option value="preserve">Preserve</option>
                    <option value="unix">Unix (LF)</option>
                    <option value="windows">Windows (CRLF)</option>
                  </select>
                </div>
                <SettingRow label="Disable Copy" description="Prevent copying text from the remote session"><FakeSwitch /></SettingRow>
                <SettingRow label="Disable Paste" description="Prevent pasting text into the remote session"><FakeSwitch /></SettingRow>
              </div>
            </SectionCard>

            {/* VNC Specific */}
            {connectionType === "vnc" && (
              <SectionCard title="VNC Settings" icon={<Settings className="size-3.5"/>}>
                <div className="flex flex-col gap-4 py-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Cursor Mode</label>
                    <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                      <option value="auto">Auto</option>
                      <option value="local">Local</option>
                      <option value="remote">Remote</option>
                    </select>
                  </div>
                  <SettingRow label="Swap Red/Blue" description="Swap the red and blue color channels (fixes some colour issues)"><FakeSwitch /></SettingRow>
                  <SettingRow label="Read-only" description="View the remote screen without sending any input"><FakeSwitch /></SettingRow>
                </div>
              </SectionCard>
            )}

            {/* Recording */}
            <SectionCard title="Session Recording" icon={<Activity className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recording Path</label>
                  <Input placeholder="/var/lib/termix/recordings" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Recording Name</label>
                  <Input placeholder="${GUAC_USERNAME}-${GUAC_DATE}-${GUAC_TIME}" />
                </div>
                <SettingRow label="Create Path if Missing" description="Automatically create the recording directory"><FakeSwitch /></SettingRow>
                <SettingRow label="Exclude Output" description="Do not record screen output (metadata only)"><FakeSwitch /></SettingRow>
                <SettingRow label="Exclude Mouse" description="Do not record mouse movements"><FakeSwitch /></SettingRow>
                <SettingRow label="Include Keystrokes" description="Record raw keystrokes in addition to screen output"><FakeSwitch /></SettingRow>
              </div>
            </SectionCard>

            {/* Wake-on-LAN */}
            <SectionCard title="Wake-on-LAN" icon={<Zap className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <SettingRow label="Send WOL Packet" description="Send a magic packet to wake this host before connecting"><FakeSwitch /></SettingRow>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">MAC Address</label>
                    <Input placeholder="AA:BB:CC:DD:EE:FF" defaultValue={host?.macAddress || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Broadcast Address</label>
                    <Input placeholder="255.255.255.255" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">UDP Port</label>
                    <Input type="number" placeholder="9" />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Wait Time (s)</label>
                    <Input type="number" placeholder="0" />
                  </div>
                </div>
              </div>
            </SectionCard>
          </>
        )}

        {activeTab === "sharing" && (
          <>
            {host === null && (
              <div className="flex items-start gap-3 p-3 border border-yellow-500/30 bg-yellow-500/5 text-xs text-yellow-500">
                <Shield className="size-3.5 shrink-0 mt-0.5"/>
                <div><strong>Save the host first.</strong> Sharing options are available after the host has been saved.</div>
              </div>
            )}

            <SectionCard title="Share Host" icon={<Users className="size-3.5"/>}>
              <div className="flex flex-col gap-4 py-3">
                <div className="flex gap-2">
                  {["user", "role"].map(t => (
                    <button key={t} className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${t === "user" ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {t === "user" ? <><User className="size-3 inline mr-1"/>Share with User</> : <><Shield className="size-3 inline mr-1"/>Share with Role</>}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Select User</label>
                  <select className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring">
                    <option value="">Select a user...</option>
                    <option>alice</option>
                    <option>bob</option>
                    <option>charlie</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Permission Level</label>
                  <div className="px-3 py-2 border border-border bg-muted/30 text-xs text-muted-foreground">View only</div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Expires in (hours)</label>
                  <Input type="number" placeholder="Leave empty for no expiry" />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={() => toast.success("Host shared successfully")}>
                    <Plus className="size-3.5 mr-1.5"/>Share
                  </Button>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Current Access" icon={<ListChecks className="size-3.5"/>}>
              <div className="py-2">
                <div className="grid grid-cols-6 gap-2 px-2 py-1.5 text-[10px] font-bold uppercase tracking-widest text-muted-foreground border-b border-border">
                  <span>Type</span>
                  <span>Target</span>
                  <span>Permission</span>
                  <span>Granted By</span>
                  <span>Expires</span>
                  <span></span>
                </div>
                {[
                  { type: "User", target: "alice",     permission: "View",  grantedBy: "admin", expires: "Never",      expired: false },
                  { type: "Role", target: "Developers", permission: "View", grantedBy: "admin", expires: "2026-06-01", expired: false },
                  { type: "User", target: "bob",       permission: "View",  grantedBy: "alice", expires: "2026-04-01", expired: true  },
                ].map((r, i) => (
                  <div key={i} className="grid grid-cols-6 gap-2 px-2 py-2.5 border-b border-border last:border-0 items-center text-xs">
                    <div className="flex items-center gap-1">
                      {r.type === "User" ? <User className="size-3 text-muted-foreground"/> : <Shield className="size-3 text-muted-foreground"/>}
                      <span className="text-muted-foreground">{r.type}</span>
                    </div>
                    <span className="font-semibold">{r.target}</span>
                    <span>{r.permission}</span>
                    <span className="text-muted-foreground">{r.grantedBy}</span>
                    <span className={r.expired ? "text-destructive" : "text-muted-foreground"}>
                      {r.expired ? <span className="flex items-center gap-1"><X className="size-3"/>Expired</span> : r.expires}
                    </span>
                    <div className="flex justify-end">
                      <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive hover:bg-destructive/10" onClick={() => toast.success("Access revoked")}>
                        Revoke
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          </>
        )}
      </div>

      <div className="flex justify-end gap-3 mt-3 mb-6">
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
        <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand px-8" onClick={() => { toast.success("Host configuration saved"); onBack(); }}>
          Save Host
        </Button>
      </div>
    </div>
  );
}

function CredentialEditorView({ credential, activeTab, onBack }: { credential: Credential | null; activeTab: string; onBack: () => void }) {
  const [type, setType] = useState(credential?.type || "password");

  return (
    <div className="flex flex-col gap-3">
      {activeTab === "general" && (
        <SectionCard title="Basic Information" icon={<Info className="size-3.5"/>}>
          <div className="grid grid-cols-2 gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Friendly Name</label>
              <Input placeholder="e.g. Production SSH Key" defaultValue={credential?.name || ""} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Folder</label>
              <Input placeholder="e.g. Server Keys" defaultValue={credential?.folder || ""} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Description</label>
              <Input placeholder="Optional details..." defaultValue={credential?.description || ""} />
            </div>
            <div className="flex flex-col gap-1.5 col-span-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Tags</label>
              <Input placeholder="space separated" defaultValue={credential?.tags?.join(" ") || ""} />
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === "auth" && (
        <SectionCard title="Authentication Details" icon={<Lock className="size-3.5"/>}>
          <div className="flex flex-col gap-4 py-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Type</label>
              <div className="flex gap-2">
                {["password", "key"].map(m => (
                  <button key={m} onClick={() => setType(m as any)}
                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border transition-colors ${type === m ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
                  >{m === "key" ? "SSH Private Key" : "Password"}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Username</label>
              <Input placeholder="e.g. root or deploy" defaultValue={credential?.username || ""} />
            </div>
            {type === "password" && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Password</label>
                <Input type="password" placeholder="••••••••" defaultValue={credential?.value || ""} />
              </div>
            )}
            {type === "key" && (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Private Key</label>
                  <textarea placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" rows={8} defaultValue={credential?.value || ""}
                    className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"/>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">SSH Public Key (Optional)</label>
                  <textarea placeholder="ssh-rsa AAAAB3Nza..." rows={3} defaultValue={credential?.publicKey || ""}
                    className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"/>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Key Passphrase (Optional)</label>
                  <Input type="password" placeholder="••••••••" defaultValue={credential?.passphrase || ""} />
                </div>
              </div>
            )}
          </div>
        </SectionCard>
      )}

      <div className="flex justify-end gap-3 mt-3">
        <Button variant="ghost" onClick={onBack}>Cancel</Button>
        <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand px-8" onClick={() => { toast.success("Credential saved"); onBack(); }}>
          Save Credential
        </Button>
      </div>
    </div>
  );
}

export function HostManagerTab() {
  const [section, setSection]                       = useState<"hosts" | "credentials">("hosts");
  const [editingHost, setEditingHost]               = useState<Host | "new" | null>(null);
  const [editingCredential, setEditingCredential]   = useState<Credential | "new" | null>(null);
  const [activeHostTab, setActiveHostTab]           = useState("general");
  const [activeCredentialTab, setActiveCredentialTab] = useState("general");
  const [searchQuery, setSearchQuery]               = useState("");
  const [expandedFolders, setExpandedFolders]       = useState<Set<string>>(new Set(["Production", "Production / Web Servers", "Staging"]));
  const [selectionMode, setSelectionMode]           = useState(false);
  const [selectedHostIds, setSelectedHostIds]       = useState<Set<string>>(new Set());
  const [editingFolderName, setEditingFolderName]   = useState<string | null>(null);
  const [editingFolderValue, setEditingFolderValue] = useState("");
  const [draggedHost, setDraggedHost]               = useState<Host | null>(null);
  const [dragOverFolder, setDragOverFolder]         = useState<string | null>(null);
  const [editingHostConnectionType, setEditingHostConnectionType] = useState("ssh");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importOverwriteRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handleAddHost = () => { setSection("hosts"); setEditingHost("new"); setEditingCredential(null); setEditingHostConnectionType("ssh"); setActiveHostTab("general"); };
    const handleAddCredential = () => { setSection("credentials"); setEditingCredential("new"); setEditingHost(null); };
    const handleEditHost = (e: Event) => {
      const id = (e as CustomEvent<string>).detail;
      const host = hosts.find(h => h.id === id);
      if (host) { setSection("hosts"); setEditingHost(host); setEditingCredential(null); setActiveHostTab("general"); setEditingHostConnectionType(host.connectionType || "ssh"); }
    };
    window.addEventListener("host-manager:add-host", handleAddHost);
    window.addEventListener("host-manager:add-credential", handleAddCredential);
    window.addEventListener("host-manager:edit-host", handleEditHost);
    return () => {
      window.removeEventListener("host-manager:add-host", handleAddHost);
      window.removeEventListener("host-manager:add-credential", handleAddCredential);
      window.removeEventListener("host-manager:edit-host", handleEditHost);
    };
  }, []);

  const allHosts = hosts;
  const filteredHosts = allHosts.filter(h =>
    h.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
    h.tags?.some(t => t.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredCredentials = MOCK_CREDENTIALS.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.username.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const folders = Array.from(new Set(allHosts.map(h => h.folder))).sort();
  const pinnedHosts = filteredHosts.filter(h => h.pin);
  const hostsByFolder = folders.reduce<Record<string, Host[]>>((acc, folder) => {
    acc[folder] = filteredHosts.filter(h => h.folder === folder && !h.pin);
    return acc;
  }, {});
  const credentialFolders = Array.from(new Set(MOCK_CREDENTIALS.map(c => c.folder || "Uncategorized"))).sort();

  const toggleFolder = (folder: string) => {
    setExpandedFolders(prev => { const next = new Set(prev); if (next.has(folder)) next.delete(folder); else next.add(folder); return next; });
  };
  const toggleHostSelection = (id: string) => {
    setSelectedHostIds(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };
  const handleExportHosts = () => {
    const data = JSON.stringify({ hosts: allHosts }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "termix-hosts.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Hosts exported successfully");
  };

  const handleDownloadSample = () => {
    const sample = JSON.stringify({ hosts: [{ name: "My Server", address: "192.168.1.1", user: "root", port: 22, folder: "Production", connectionType: "ssh" }] }, null, 2);
    const blob = new Blob([sample], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "termix-hosts-sample.json";
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    toast.success("Sample file downloaded");
  };

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => { setRefreshing(false); toast.success("Host statuses refreshed"); }, 1200);
  };

  const navContent = () => {
    if (editingHost) {
      const connectionType = editingHostConnectionType;
      return (
        <>
          <button onClick={() => { setEditingHost(null); setActiveHostTab("general"); }}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l-2 border-transparent">
            <ArrowLeft className="size-3.5" />Back to Hosts
          </button>
          <Separator className="my-1 opacity-50" />
          {HOST_TABS.filter(tab => {
            if (connectionType === "ssh") return tab.id !== "remote";
            return tab.id === "general" || tab.id === "remote";
          }).map(tab => (
            <button key={tab.id} onClick={() => setActiveHostTab(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${activeHostTab === tab.id ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </>
      );
    }

    if (editingCredential) {
      return (
        <>
          <button onClick={() => { setEditingCredential(null); setActiveCredentialTab("general"); }}
            className="flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border-l-2 border-transparent">
            <ArrowLeft className="size-3.5" />Back to Credentials
          </button>
          <Separator className="my-1 opacity-50" />
          {CREDENTIAL_TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveCredentialTab(tab.id)}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${activeCredentialTab === tab.id ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"}`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </>
      );
    }

    return (
      <>
        <button onClick={() => { setSection("hosts"); setEditingCredential(null); setSearchQuery(""); }}
          className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${section === "hosts" ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"}`}>
          <Server className="size-3.5"/>Hosts
          <span className="ml-auto text-[10px] font-bold text-muted-foreground/60">{allHosts.length}</span>
        </button>
        <button onClick={() => { setSection("credentials"); setEditingHost(null); setSearchQuery(""); }}
          className={`flex items-center gap-2.5 px-3 py-2.5 text-sm font-medium transition-colors text-left ${section === "credentials" ? "bg-accent-brand/10 text-accent-brand border-l-2 border-accent-brand" : "text-muted-foreground hover:text-foreground hover:bg-muted border-l-2 border-transparent"}`}>
          <KeyRound className="size-3.5"/>Credentials
          <span className="ml-auto text-[10px] font-bold text-muted-foreground/60">{MOCK_CREDENTIALS.length}</span>
        </button>
      </>
    );
  };

  return (
    <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
      <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
        <div>
          <h1 className="text-2xl font-bold">Host Manager</h1>
          <p className="text-xs text-muted-foreground">{allHosts.length} hosts · {allHosts.filter(h => h.online).length} online · {MOCK_CREDENTIALS.length} credentials</p>
        </div>
        {!editingHost && !editingCredential && (
          <div className="flex items-center gap-2">
            {section === "hosts" && (
              <>
                <input ref={fileInputRef} type="file" accept=".json" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) toast.success(importOverwriteRef.current ? "Hosts imported (overwrite mode)" : "Hosts imported (skipped existing)"); }} />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs">
                      <Upload className="size-3.5 mr-1" />Import JSON
                      <ChevronDown className="size-3 ml-1 text-muted-foreground"/>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => { importOverwriteRef.current = false; fileInputRef.current?.click(); }}>
                      Skip existing hosts
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { importOverwriteRef.current = true; fileInputRef.current?.click(); }}>
                      Overwrite existing hosts
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportHosts} disabled={allHosts.length === 0}>
                  <Download className="size-3.5 mr-1" />Export All
                </Button>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleDownloadSample}>
                  <Download className="size-3.5 mr-1" />Sample
                </Button>
                <div className="w-px h-5 bg-border"/>
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleRefresh} disabled={refreshing}>
                  <RefreshCw className={`size-3.5 mr-1 ${refreshing ? "animate-spin" : ""}`}/>Refresh
                </Button>
              </>
            )}
            {section === "credentials" && (
              <Button variant="outline" size="sm" className="h-7 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={() => { setEditingCredential("new"); setActiveCredentialTab("general"); }}>
                <Plus className="size-3.5 mr-1.5"/>Add Credential
              </Button>
            )}
          </div>
        )}
      </Card>

      <div className="flex flex-row flex-1 min-h-0 overflow-hidden px-3 py-3 gap-3">
        <div className="flex flex-col gap-1 w-44 shrink-0">
          <Card className="flex flex-col overflow-hidden py-1 gap-0">{navContent()}</Card>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3">
          {section === "hosts" && (
            editingHost ? (
              <HostEditor
                host={editingHost === "new" ? null : editingHost}
                activeTab={activeHostTab}
                onBack={() => { setEditingHost(null); setActiveHostTab("general"); }}
                connectionType={editingHostConnectionType}
                onConnectionTypeChange={t => { setEditingHostConnectionType(t); setActiveHostTab("general"); }}
              />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                    <Input placeholder="Search hosts, addresses, tags..." className="pl-8 h-9 text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  </div>
                  <Button variant="outline" size="sm" className="h-9 text-xs shrink-0 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand" onClick={() => { setEditingHost("new"); setActiveHostTab("general"); setEditingHostConnectionType("ssh"); }}>
                    <Plus className="size-3.5 mr-1.5"/>Add Host
                  </Button>
                  <Button variant={selectionMode ? "default" : "outline"} size="sm" className="h-9 text-xs shrink-0" onClick={() => { setSelectionMode(s => !s); setSelectedHostIds(new Set()); }}>
                    <ListChecks className="size-3.5 mr-1.5"/>{selectionMode ? "Cancel" : "Select"}
                  </Button>
                  <Button variant="outline" size="sm" className="h-9 text-xs shrink-0" onClick={() => {
                    const allOpen = folders.every(f => expandedFolders.has(f));
                    setExpandedFolders(allOpen ? new Set() : new Set(folders));
                  }}>
                    {folders.every(f => expandedFolders.has(f)) ? <ChevronUp className="size-3.5 mr-1.5"/> : <ChevronDown className="size-3.5 mr-1.5"/>}
                    {folders.every(f => expandedFolders.has(f)) ? "Collapse" : "Expand All"}
                  </Button>
                </div>

                {pinnedHosts.length > 0 && (
                  <div className="flex flex-col border border-border overflow-hidden">
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border">
                      <Pin className="size-3 text-accent-brand"/>
                      <span className="text-[10px] font-bold uppercase tracking-widest text-accent-brand">Pinned</span>
                    </div>
                    {pinnedHosts.map(host => (
                      <HostRow key={host.id} host={host} selectionMode={selectionMode} selected={selectedHostIds.has(host.id)}
                        onToggleSelect={() => toggleHostSelection(host.id)}
                        onEdit={() => { setEditingHost(host); setActiveHostTab("general"); setEditingHostConnectionType(host.connectionType || "ssh"); }}
                        onDelete={() => toast.success(`Deleted ${host.name}`)} />
                    ))}
                  </div>
                )}

                {folders.map(folder => {
                  const folderHosts = hostsByFolder[folder] || [];
                  if (folderHosts.length === 0) return null;
                  const isExpanded = expandedFolders.has(folder);
                  const isOver = dragOverFolder === folder;
                  const onlineCount = folderHosts.filter(h => h.online).length;

                  return (
                    <div key={folder} className={`flex flex-col border overflow-hidden transition-colors ${isOver ? "border-accent-brand/60 bg-accent-brand/5" : "border-border"}`}
                      onDragOver={e => { e.preventDefault(); setDragOverFolder(folder); }}
                      onDragLeave={() => setDragOverFolder(null)}
                      onDrop={e => { e.preventDefault(); setDragOverFolder(null); if (draggedHost) { toast.success(`Moved ${draggedHost.name} to ${folder}`); setDraggedHost(null); } }}>
                      <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border-b border-border group/folder">
                        <button className="flex items-center gap-2 flex-1 text-left" onClick={() => toggleFolder(folder)}>
                          <ChevronRight className={`size-3 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}/>
                          {isExpanded ? <FolderOpen className="size-3.5 text-accent-brand/70"/> : <Folder className="size-3.5 text-accent-brand/70"/>}
                          {editingFolderName === folder ? (
                            <input autoFocus value={editingFolderValue} onChange={e => setEditingFolderValue(e.target.value)}
                              onBlur={() => { setEditingFolderName(null); toast.success(`Folder renamed to ${editingFolderValue}`); }}
                              onKeyDown={e => { if (e.key === "Enter") { setEditingFolderName(null); toast.success(`Folder renamed to ${editingFolderValue}`); } if (e.key === "Escape") setEditingFolderName(null); }}
                              onClick={e => e.stopPropagation()}
                              className="text-[10px] font-bold uppercase tracking-widest bg-background border border-accent-brand/60 px-1 outline-none text-foreground"/>
                          ) : (
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{folder}</span>
                          )}
                          <span className="text-[10px] text-muted-foreground/60 ml-0.5">{onlineCount}/{folderHosts.length}</span>
                        </button>
                        <div className="flex items-center gap-0.5 opacity-0 group-hover/folder:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground" onClick={e => { e.stopPropagation(); setEditingFolderName(folder); setEditingFolderValue(folder); }}>
                            <Pencil className="size-3"/>
                          </Button>
                          <Button variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-destructive" onClick={e => { e.stopPropagation(); toast.success(`Deleted folder ${folder}`); }}>
                            <Trash2 className="size-3"/>
                          </Button>
                        </div>
                      </div>

                      {isExpanded && folderHosts.map(host => (
                        <HostRow key={host.id} host={host} selectionMode={selectionMode} selected={selectedHostIds.has(host.id)}
                          onToggleSelect={() => toggleHostSelection(host.id)}
                          onEdit={() => { setEditingHost(host); setActiveHostTab("general"); setEditingHostConnectionType(host.connectionType || "ssh"); }}
                          onDelete={() => toast.success(`Deleted ${host.name}`)}
                          onDragStart={() => setDraggedHost(host)}
                          onDragEnd={() => setDraggedHost(null)} />
                      ))}
                    </div>
                  );
                })}

                {filteredHosts.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-border">
                    <Server className="size-10 text-muted-foreground/30 mb-3"/>
                    <span className="text-sm font-semibold text-muted-foreground">No hosts found</span>
                    <span className="text-xs text-muted-foreground/60 mt-1">{searchQuery ? "Try a different search term" : "Add your first host to get started"}</span>
                    {!searchQuery && (
                      <Button variant="outline" size="sm" className="mt-4 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10" onClick={() => { setEditingHost("new"); setActiveHostTab("general"); setEditingHostConnectionType("ssh"); }}>
                        <Plus className="size-3.5 mr-1.5"/>Add Host
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )
          )}

          {section === "credentials" && (
            editingCredential ? (
              <CredentialEditorView credential={editingCredential === "new" ? null : editingCredential} activeTab={activeCredentialTab} onBack={() => { setEditingCredential(null); setActiveCredentialTab("general"); }} />
            ) : (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                  <Input placeholder="Search credentials..." className="pl-8 h-9 text-xs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                </div>

                {credentialFolders.map(folder => {
                  const creds = filteredCredentials.filter(c => (c.folder || "Uncategorized") === folder);
                  if (creds.length === 0) return null;
                  return (
                    <div key={folder} className="flex flex-col border border-border overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20 border-b border-border">
                        <Folder className="size-3.5 text-accent-brand/70"/>
                        <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{folder}</span>
                        <span className="text-[10px] text-muted-foreground/60">{creds.length}</span>
                      </div>
                      {creds.map(cred => {
                        const usedByHosts = allHosts.filter(h => h.credentialId === cred.id);
                        return (
                          <div key={cred.id} className="flex items-center justify-between px-3 py-3 border-b border-border last:border-0 hover:bg-muted/30 group">
                            <div className="flex items-center gap-3">
                              <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0">
                                {cred.type === "key" ? <Shield className="size-3.5 text-accent-brand"/> : <Lock className="size-3.5 text-accent-brand"/>}
                              </div>
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">{cred.name}</span>
                                  <span className={`text-[10px] px-1.5 py-0.5 font-bold border ${cred.type === "key" ? "border-accent-brand/30 text-accent-brand bg-accent-brand/10" : "border-border text-muted-foreground"}`}>
                                    {cred.type === "key" ? "SSH KEY" : "PASSWORD"}
                                  </span>
                                </div>
                                <span className="text-xs text-muted-foreground">{cred.username}
                                  {usedByHosts.length > 0 && <span className="ml-2 text-[10px] text-muted-foreground/60">· used by {usedByHosts.length} host{usedByHosts.length !== 1 ? "s" : ""}</span>}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              {cred.type === "key" && (
                                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground" onClick={() => { navigator.clipboard.writeText(`ssh-copy-id -i ~/.ssh/id_rsa.pub ${cred.username}@<host>`); toast.success("Deploy command copied"); }}>
                                  <Copy className="size-3 mr-1"/>Deploy
                                </Button>
                              )}
                              <Button variant="ghost" size="icon" className="size-7" onClick={() => { setEditingCredential(cred); setActiveCredentialTab("general"); }}>
                                <Pencil className="size-3.5"/>
                              </Button>
                              <Button variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => toast.success(`Deleted ${cred.name}`)}>
                                <Trash2 className="size-3.5"/>
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}

                {filteredCredentials.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-16 border border-dashed border-border text-center">
                    <KeyRound className="size-10 text-muted-foreground/30 mb-3"/>
                    <span className="text-sm font-semibold text-muted-foreground">No credentials found</span>
                    <Button variant="outline" size="sm" className="mt-4 border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10" onClick={() => { setEditingCredential("new"); setActiveCredentialTab("general"); }}>
                      <Plus className="size-3.5 mr-1.5"/>Add Credential
                    </Button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {/* Floating selection bar */}
      {selectionMode && (
        <div className="absolute bottom-6 inset-x-0 flex justify-center z-50 pointer-events-none">
          <div className="bg-popover border border-border shadow-xl px-3 py-2 flex items-center gap-2 pointer-events-auto">
            <span className="text-sm font-semibold tabular-nums whitespace-nowrap pr-1">
              {selectedHostIds.size} selected
            </span>
            <div className="w-px h-5 bg-border"/>
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
              if (selectedHostIds.size === allHosts.length) setSelectedHostIds(new Set());
              else setSelectedHostIds(new Set(allHosts.map(h => h.id)));
            }}>
              {selectedHostIds.size === allHosts.length ? "Deselect All" : "Select All"}
            </Button>
            <div className="w-px h-5 bg-border"/>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={selectedHostIds.size === 0}>
                  <FolderSearch className="size-3.5 mr-1.5"/>Features<ChevronDown className="size-3 ml-1.5 text-muted-foreground"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => toast.success(`Enabled all features on ${selectedHostIds.size} hosts`)}>
                  <Check className="size-3.5 mr-2 text-green-500"/>Enable All Features
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Disabled all features on ${selectedHostIds.size} hosts`)}>
                  <X className="size-3.5 mr-2 text-red-500"/>Disable All Features
                </DropdownMenuItem>
                <div className="h-px bg-border my-1"/>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Terminal className="size-3.5 mr-2"/>Enable Terminal</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Terminal className="size-3.5 mr-2 opacity-30"/>Disable Terminal</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><FolderSearch className="size-3.5 mr-2"/>Enable File Manager</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><FolderSearch className="size-3.5 mr-2 opacity-30"/>Disable File Manager</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Network className="size-3.5 mr-2"/>Enable Tunnels</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Network className="size-3.5 mr-2 opacity-30"/>Disable Tunnels</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Box className="size-3.5 mr-2"/>Enable Docker</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Done")}><Box className="size-3.5 mr-2 opacity-30"/>Disable Docker</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={selectedHostIds.size === 0}>
                  <Folder className="size-3.5 mr-1.5"/>Move to Folder<ChevronDown className="size-3 ml-1.5 text-muted-foreground"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                {folders.map(f => (
                  <DropdownMenuItem key={f} onClick={() => toast.success(`Moved ${selectedHostIds.size} hosts to ${f}`)}>
                    <FolderOpen className="size-3.5 mr-2"/>{f}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 text-xs" disabled={selectedHostIds.size === 0}>
                  <Pin className="size-3.5 mr-1.5"/>Pin<ChevronDown className="size-3 ml-1.5 text-muted-foreground"/>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center">
                <DropdownMenuItem onClick={() => toast.success(`Pinned ${selectedHostIds.size} hosts`)}>
                  <Pin className="size-3.5 mr-2 text-yellow-500"/>Pin Selected
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Unpinned ${selectedHostIds.size} hosts`)}>
                  <Pin className="size-3.5 mr-2 opacity-30"/>Unpin Selected
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="w-px h-5 bg-border"/>
            <Button variant="outline" size="sm" className="h-7 text-xs" disabled={selectedHostIds.size === 0} onClick={() => { handleExportHosts(); }}>
              <Download className="size-3.5 mr-1.5"/>Export
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={selectedHostIds.size === 0} onClick={() => { toast.success(`Deleted ${selectedHostIds.size} hosts`); setSelectedHostIds(new Set()); }}>
              <Trash2 className="size-3.5 mr-1.5"/>Delete
            </Button>
            <div className="w-px h-5 bg-border"/>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setSelectionMode(false); setSelectedHostIds(new Set()); }}>
              <X className="size-3.5 mr-1.5"/>Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
