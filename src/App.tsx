import Logo from "@/assets/icon.svg?react"
import {Separator} from "@/components/ui/separator";
import {Button} from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Activity,
    Box,
    ChevronDown,
    ChevronUp,
    ChevronRight,
    Cloud,
    Copy,
    Cpu,
    Database,
    Eye,
    EyeOff,
    Folder,
    FolderOpen,
    FolderSearch,
    Globe,
    Hammer,
    KeyRound,
    LayoutDashboard,
    Menu,
    MoreHorizontal,
    Network,
    Pencil,
    Play,
    Plus,
    RefreshCw,
    Search,
    Server,
    Settings,
    Share2,
    Terminal,
    Trash2,
    User,
    X,
    Zap,
} from "lucide-react";
import {Input} from "@/components/ui/input";
import {useState} from "react";
import type React from "react";
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

type Host = {
    name: string;
    user: string;
    address: string;
    folder: string;
    online: boolean;
    cpu: number;
    ram: number;
    lastAccess: string;
};

type HostFolder = {
    name: string;
    children: (Host | HostFolder)[];
};

type TabType = "dashboard" | "terminal" | "stats" | "files" | "host-manager" | "user-profile" | "admin-settings" | "docker" | "tunnel";

type Tab = {
    id: string;
    type: TabType;
    label: string;
};

function isFolder(item: Host | HostFolder): item is HostFolder {
    return "children" in item;
}

function tabIcon(type: TabType) {
    switch (type) {
        case "dashboard":      return <LayoutDashboard className="size-3.5"/>;
        case "terminal":       return <Terminal className="size-3.5"/>;
        case "stats":          return <Server className="size-3.5"/>;
        case "files":          return <FolderSearch className="size-3.5"/>;
        case "host-manager":   return <Server className="size-3.5"/>;
        case "user-profile":   return <User className="size-3.5"/>;
        case "admin-settings": return <Settings className="size-3.5"/>;
        case "docker":         return <Box className="size-3.5"/>;
        case "tunnel":         return <Network className="size-3.5"/>;
    }
}

const hosts: Host[] = [
    {name: "web-01",     user: "deploy",   address: "10.0.1.10", folder: "Production / Web Servers", online: true,  cpu: 12, ram: 34, lastAccess: "2m ago"},
    {name: "web-02",     user: "deploy",   address: "10.0.1.11", folder: "Production / Web Servers", online: true,  cpu: 8,  ram: 27, lastAccess: "12m ago"},
    {name: "db-primary", user: "postgres", address: "10.0.2.10", folder: "Production",               online: true,  cpu: 45, ram: 71, lastAccess: "5m ago"},
    {name: "db-replica", user: "postgres", address: "10.0.2.11", folder: "Production",               online: false, cpu: 0,  ram: 0,  lastAccess: "31m ago"},
    {name: "stage-web",  user: "deploy",   address: "10.1.1.10", folder: "Staging",                  online: true,  cpu: 3,  ram: 18, lastAccess: "25m ago"},
    {name: "stage-db",   user: "postgres", address: "10.1.2.10", folder: "Staging",                  online: false, cpu: 0,  ram: 0,  lastAccess: "45m ago"},
];

const hostTree: HostFolder = {
    name: "root",
    children: [
        {
            name: "Production",
            children: [
                {
                    name: "Web Servers",
                    children: hosts.filter(h => h.folder === "Production / Web Servers"),
                },
                ...hosts.filter(h => h.folder === "Production"),
            ],
        },
        {
            name: "Staging",
            children: hosts.filter(h => h.folder === "Staging"),
        },
    ],
};

const recentActivity = [...hosts]
    .sort((a, b) => a.lastAccess.localeCompare(b.lastAccess))
    .map(h => ({host: h.name, action: "Terminal", time: h.lastAccess, online: h.online}));

const hostStatuses = hosts;

const DASHBOARD_TAB: Tab = {id: "dashboard", type: "dashboard", label: "Dashboard"};

function DashboardTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <Card className="flex-row items-center justify-between px-3 py-3 shrink-0 mx-3 mt-3 gap-0">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="text-xs text-muted-foreground">Thursday, May 1, 2026</p>
                </div>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
                        <a href="https://github.com" target="_blank" rel="noreferrer">GitHub</a>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" asChild>
                        <a href="https://discord.com" target="_blank" rel="noreferrer">Discord</a>
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">Support</Button>
                    <Separator orientation="vertical" className="mx-1"/>
                    <Button variant="ghost" size="icon"><Settings className="size-4 text-orange-400"/></Button>
                </div>
            </Card>
            <div className="flex flex-row flex-1 min-h-0 px-3 py-3 gap-3">
            <div className="flex w-3/4 flex-col gap-3 min-h-0">

                {/* Row 1: Version / Uptime / Database / Hosts Online */}
                <Card className="grid grid-cols-4 divide-x divide-border overflow-hidden shrink-0 py-0 gap-0">
                    <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Version</span>
                        <span className="text-3xl font-bold text-orange-400">v1.0.0</span>
                        <span className="text-xs bg-orange-400/20 text-orange-400 px-1.5 py-0.5 w-fit font-semibold">STABLE</span>
                    </div>
                    <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Uptime</span>
                        <span className="text-3xl font-bold">6d 3h</span>
                    </div>
                    <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Database</span>
                        <span className="text-3xl font-bold text-orange-400">Healthy</span>
                    </div>
                    <div className="flex flex-col justify-center px-4 py-3 gap-0.5">
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Hosts Online</span>
                        <div className="flex items-baseline gap-1">
                            <span className="text-3xl font-bold">{hostStatuses.filter(h => h.online).length}</span>
                            <span className="text-xl text-muted-foreground">/{hostStatuses.length}</span>
                        </div>
                    </div>
                </Card>

                {/* Row 2: Total Hosts / Credentials / Tunnels */}
                <Card className="grid grid-cols-3 divide-x divide-border overflow-hidden shrink-0 py-0 gap-0">
                    <div className="flex items-center gap-3 px-4 py-2.5">
                        <Server className="size-4 text-muted-foreground shrink-0"/>
                        <span className="text-xl font-bold">{hostStatuses.length}</span>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Total Hosts</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                        <KeyRound className="size-4 text-muted-foreground shrink-0"/>
                        <span className="text-xl font-bold">2</span>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Credentials</span>
                    </div>
                    <div className="flex items-center gap-3 px-4 py-2.5">
                        <Cpu className="size-4 text-muted-foreground shrink-0"/>
                        <span className="text-xl font-bold">0</span>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Tunnels</span>
                    </div>
                </Card>

                {/* Row 3: Quick Actions */}
                <Card className="flex flex-col overflow-hidden shrink-0 py-0 gap-0">
                    <div className="flex items-center gap-2 px-4 py-2 border-b border-border">
                        <Zap className="size-3.5 text-muted-foreground"/>
                        <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Quick Actions</span>
                    </div>
                    <div className="flex flex-1">
                        <div className="flex flex-col flex-1 border-r border-border">
                            <button className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                                <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-orange-400/20 group-hover/btn:border-orange-400/40 transition-colors">
                                    <Plus className="size-3.5 text-orange-400"/>
                                </div>
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-sm font-semibold text-foreground">Add Host</span>
                                    <span className="text-xs text-muted-foreground">Register a new server</span>
                                </div>
                            </button>
                            <button className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                                <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-orange-400/20 group-hover/btn:border-orange-400/40 transition-colors">
                                    <Settings className="size-3.5 text-orange-400"/>
                                </div>
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-sm font-semibold text-foreground">Admin Settings</span>
                                    <span className="text-xs text-muted-foreground">Configure the application</span>
                                </div>
                            </button>
                        </div>
                        <div className="flex flex-col flex-1">
                            <button className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer border-b border-border flex-1">
                                <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-orange-400/20 group-hover/btn:border-orange-400/40 transition-colors">
                                    <KeyRound className="size-3.5 text-orange-400"/>
                                </div>
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-sm font-semibold text-foreground">Add Credential</span>
                                    <span className="text-xs text-muted-foreground">Store SSH key or password</span>
                                </div>
                            </button>
                            <button className="group/btn flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors cursor-pointer flex-1">
                                <div className="size-8 border border-border bg-muted flex items-center justify-center shrink-0 group-hover/btn:bg-orange-400/20 group-hover/btn:border-orange-400/40 transition-colors">
                                    <User className="size-3.5 text-orange-400"/>
                                </div>
                                <div className="flex flex-col items-start text-left">
                                    <span className="text-sm font-semibold text-foreground">User Profile</span>
                                    <span className="text-xs text-muted-foreground">Manage your account</span>
                                </div>
                            </button>
                        </div>
                    </div>
                </Card>

                {/* Row 4: Host Status */}
                <Card className="flex flex-col overflow-hidden flex-1 min-h-0 py-0 gap-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                            <Database className="size-3.5 text-muted-foreground"/>
                            <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Host Status</span>
                        </div>
                        <span className="text-xs text-muted-foreground">{hostStatuses.filter(h => h.online).length}/{hostStatuses.length} online</span>
                    </div>
                    <div className="flex flex-col overflow-auto flex-1">
                        {hostStatuses.map((host, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50">
                                <div className="flex items-center gap-3">
                                    <span className={`size-2 rounded-full shrink-0 ${host.online ? "bg-orange-400" : "bg-muted-foreground/40"}`}/>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-semibold">{host.name}</span>
                                        <span className="text-xs text-muted-foreground">{host.address}</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    {host.online ? (
                                        <div className="flex items-center gap-4">
                                            <div className="flex flex-col gap-1 w-20">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-muted-foreground">CPU</span>
                                                    <span className="text-xs font-bold text-orange-400">{host.cpu}%</span>
                                                </div>
                                                <div className="h-1 bg-muted w-full">
                                                    <div className="h-full bg-orange-400" style={{width: `${host.cpu}%`}}/>
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-1 w-20">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs text-muted-foreground">RAM</span>
                                                    <span className="text-xs font-bold text-orange-400">{host.ram}%</span>
                                                </div>
                                                <div className="h-1 bg-muted w-full">
                                                    <div className="h-full bg-orange-400" style={{width: `${host.ram}%`}}/>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4">
                                            <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                                            <span className="text-xs text-muted-foreground w-20 text-center">—</span>
                                        </div>
                                    )}
                                    <span className={`text-xs px-2.5 py-1 font-semibold border ${host.online ? "border-orange-400/40 text-orange-400 bg-orange-400/10" : "border-border text-muted-foreground"}`}>
                                        {host.online ? "ONLINE" : "OFFLINE"}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Right: Recent Activity */}
            <div className="w-1/4 min-h-0">
                <Card className="h-full flex flex-col overflow-hidden py-0 gap-0">
                    <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
                        <div className="flex items-center gap-2">
                            <Activity className="size-3.5 text-muted-foreground"/>
                            <span className="text-xs text-muted-foreground uppercase tracking-widest font-semibold">Recent Activity</span>
                        </div>
                        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground h-auto py-0.5 px-2 text-orange-400">Clear</Button>
                    </div>
                    <div className="flex flex-col overflow-auto flex-1">
                        {recentActivity.map((item, i) => (
                            <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 hover:bg-muted/50">
                                <div className="flex items-center gap-2.5">
                                    <span className={`size-1.5 rounded-full shrink-0 ${item.online ? "bg-orange-400" : "bg-muted-foreground/40"}`}/>
                                    <div className="flex flex-col">
                                        <span className="text-xs font-semibold truncate max-w-24">{item.host}</span>
                                        <div className="flex items-center gap-1 text-muted-foreground">
                                            <Terminal className="size-3"/>
                                            <span className="text-xs">{item.action}</span>
                                        </div>
                                    </div>
                                </div>
                                <span className="text-xs text-muted-foreground shrink-0">{item.time}</span>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>
            </div>
        </div>
    );
}

function TerminalTab({label}: {label: string}) {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function StatsTab({label}: {label: string}) {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function FilesTab({label}: {label: string}) {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function HostManagerTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function UserProfileTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function AdminSettingsTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function DockerTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function TunnelTab() {
    return (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        </div>
    );
}

function HostItem({host, onOpenTab}: { host: Host; onOpenTab: (type: TabType) => void }) {
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const isOnline = host.online;

    return (
        <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <div
                className="flex items-center justify-between group px-2 py-1 hover:bg-muted cursor-pointer border-l-2 border-l-transparent"
                onClick={() => onOpenTab("terminal")}
                onContextMenu={e => { e.preventDefault(); setDropdownOpen(true); }}
            >
                <div className="flex flex-col min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                        <span className={`size-1.5 rounded-full shrink-0 ${isOnline ? "bg-orange-400" : "bg-muted-foreground/40"}`}/>
                        <span className="text-xs font-medium truncate">{host.name}</span>
                    </div>
                    <span className="text-xs text-muted-foreground truncate">{host.user}@{host.address}</span>
                </div>
                <div className={`flex items-center gap-0.5 shrink-0 transition-opacity ${dropdownOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
                    <Button variant="ghost" size="icon-xs" className="text-orange-400" onClick={e => { e.stopPropagation(); onOpenTab("terminal"); }}>
                        <Terminal/>
                    </Button>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-xs" className="text-muted-foreground" onClick={e => e.stopPropagation()}>
                            <MoreHorizontal/>
                        </Button>
                    </DropdownMenuTrigger>
                </div>
            </div>
            <DropdownMenuContent side="right" align="start" sideOffset={9} alignOffset={0} className="w-44 [clip-path:inset(-4px_-4px_-4px_0px)]">
                <DropdownMenuItem onClick={() => onOpenTab("terminal")}>
                    <Terminal className="size-3.5"/>
                    Open Terminal
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenTab("stats")}>
                    <Server className="size-3.5"/>
                    Open Server Stats
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenTab("files")}>
                    <FolderSearch className="size-3.5"/>
                    Open File Manager
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenTab("docker")}>
                    <Box className="size-3.5"/>
                    Open Docker
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onOpenTab("tunnel")}>
                    <Network className="size-3.5"/>
                    Open Tunnel
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <Pencil className="size-3.5"/>
                    Edit
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

function FolderItem({folder, depth = 0, onOpenTab}: { folder: HostFolder; depth?: number; onOpenTab: (host: Host, type: TabType) => void }) {
    const [open, setOpen] = useState(depth === 0);

    return (
        <div>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center gap-1 w-full px-2 py-1 hover:bg-muted text-left"
            >
                <ChevronRight className={`size-3 shrink-0 transition-transform ${open ? "rotate-90 text-orange-400" : "text-muted-foreground"}`}/>
                {open
                    ? <FolderOpen className="size-3.5 shrink-0 text-orange-400"/>
                    : <Folder className="size-3.5 shrink-0 text-muted-foreground"/>
                }
                <span className="text-xs font-medium">{folder.name}</span>
            </button>
            {open && (
                <div className="ml-3 border-l border-border pl-1">
                    {folder.children.map((child, i) =>
                        isFolder(child)
                            ? <FolderItem key={i} folder={child} depth={depth + 1} onOpenTab={onOpenTab}/>
                            : <HostItem key={i} host={child} onOpenTab={(type) => onOpenTab(child, type)}/>
                    )}
                </div>
            )}
        </div>
    );
}


const SINGLETON_TAB_LABELS: Partial<Record<TabType, string>> = {
    "host-manager":   "Host Manager",
    "user-profile":   "User Profile",
    "admin-settings": "Admin Settings",
    "docker":         "Docker",
    "tunnel":         "Tunnel",
};

function App() {
    const [tabs, setTabs] = useState<Tab[]>([DASHBOARD_TAB]);
    const [activeTabId, setActiveTabId] = useState("dashboard");
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [tabBarOpen, setTabBarOpen] = useState(true);
    const [quickConnectOpen, setQuickConnectOpen] = useState(false);
    const [toolsOpen, setToolsOpen] = useState(false);

    function openTab(host: Host, type: TabType) {
        const id = `${host.name}-${type}`;
        setTabs(prev => {
            if (prev.find(t => t.id === id)) return prev;
            return [...prev, {id, type, label: host.name}];
        });
        setActiveTabId(id);
    }

    function openSingletonTab(type: TabType) {
        const id = type;
        setTabs(prev => {
            if (prev.find(t => t.id === id)) return prev;
            return [...prev, {id, type, label: SINGLETON_TAB_LABELS[type] ?? type}];
        });
        setActiveTabId(id);
    }

    return (
        <>
        <div className="flex w-screen h-screen bg-background">
            <div className={`flex flex-col bg-sidebar shrink-0 transition-all duration-200 overflow-hidden ${sidebarOpen ? "w-64 border-r border-border" : "w-0"}`}>
                <div className="flex flex-row items-center gap-2 border-b border-border h-12.5 px-3 shrink-0">
                    <Logo className="w-6 h-6 shrink-0 text-muted-foreground"/>
                    <span className="text-xl font-semibold text-muted-foreground">
                        Termix
                    </span>
                    <Button variant="ghost" size="icon" className="ml-auto text-muted-foreground">
                        <RefreshCw/>
                    </Button>
                    <Button variant="ghost" size="icon" className="text-muted-foreground" onClick={() => setSidebarOpen(false)}>
                        <Menu/>
                    </Button>
                </div>
                <div className="flex flex-col flex-1 min-h-0 overflow-y-auto">
                    <div className="p-2">
                        <Button variant="outline" className="w-full border-orange-400/40 text-orange-400 hover:bg-orange-400/10 hover:text-orange-400" onClick={() => openSingletonTab("host-manager")}>
                            <Server/>
                            Host Manager
                        </Button>
                    </div>
                    <Separator/>
                    <div className="p-2">
                        <Input placeholder="Search hosts..."/>
                    </div>
                    <Separator/>
                    <div className="px-2 py-1">
                        {hostTree.children.map((child, i) =>
                            isFolder(child)
                                ? <FolderItem key={i} folder={child} onOpenTab={openTab}/>
                                : <HostItem key={i} host={child} onOpenTab={(type) => openTab(child, type)}/>
                        )}
                    </div>
                </div>
                <div className="border-t border-border p-1 shrink-0">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="w-full justify-between h-auto py-2 px-2">
                                <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">
                                        U
                                    </div>
                                    <div className="flex flex-col items-start text-left">
                                        <span className="text-sm font-semibold leading-tight">Username</span>
                                        <span className="text-xs text-muted-foreground leading-tight">Role</span>
                                    </div>
                                </div>
                                <ChevronUp className="text-orange-400"/>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="top" align="center" sideOffset={5} avoidCollisions={false} className="w-[calc(16rem-1px)] [clip-path:inset(-4px_0px_0px_0px)]">
                            <DropdownMenuItem onClick={() => openSingletonTab("user-profile")}>
                                <User className="size-3.5"/>
                                User Profile
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openSingletonTab("admin-settings")}>
                                <Settings className="size-3.5"/>
                                Admin Settings
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive">
                                <KeyRound className="size-3.5"/>
                                Logout
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <div className={`relative flex flex-row flex-1 min-w-0 overflow-hidden transition-all duration-200 ${!sidebarOpen ? "pl-4" : ""}`}>
                {!sidebarOpen && (
                    <button
                        onClick={() => setSidebarOpen(true)}
                        className="absolute left-0 top-0 bottom-0 z-20 flex items-center justify-center w-4 bg-sidebar border-r border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <ChevronRight className="size-3"/>
                    </button>
                )}
                <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
                <div className={`flex items-end bg-sidebar shrink-0 min-w-0 transition-all duration-200 overflow-hidden ${tabBarOpen ? "h-12.5 border-b border-border" : "h-0"}`}>
                    {/* Scrollable tab list */}
                    <div className="flex h-full flex-1 min-w-0 overflow-x-auto scrollbar-none">
                        {tabs.map(tab => {
                            const active = tab.id === activeTabId;
                            return (
                                <div
                                    key={tab.id}
                                    onClick={() => setActiveTabId(tab.id)}
                                    onMouseDown={e => {
                                        if (e.button === 1 && tab.type !== "dashboard") {
                                            e.preventDefault();
                                            setTabs(prev => {
                                                const next = prev.filter(t => t.id !== tab.id);
                                                if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                                                return next;
                                            });
                                        }
                                    }}
                                    className={`group/tab flex items-center gap-2 shrink-0 cursor-pointer transition-colors border-r border-border text-sm
                                        ${tab.type === "dashboard"
                                            ? `px-3.5 ${active ? "border-r border-b-2 border-b-orange-400 bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                                            : `px-4 font-medium ${active ? "border-b-2 border-b-orange-400 bg-surface text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`
                                        }`}
                                >
                                    {tabIcon(tab.type)}
                                    {tab.type !== "dashboard" && tab.label}
                                    {tab.type !== "dashboard" && (
                                        <button
                                            onClick={e => {
                                                e.stopPropagation();
                                                setTabs(prev => {
                                                    const next = prev.filter(t => t.id !== tab.id);
                                                    if (active) setActiveTabId(next[next.length - 1].id);
                                                    return next;
                                                });
                                            }}
                                            className={`flex items-center justify-center size-4 rounded-sm transition-opacity text-muted-foreground hover:text-foreground hover:bg-muted ml-1 ${active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"}`}
                                        >
                                            <X className="size-3"/>
                                        </button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex items-center h-full shrink-0">
                        <Separator orientation="vertical"/>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground">
                                    <ChevronDown className="size-4"/>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" sideOffset={1} className="w-56 border-t-0 [clip-path:inset(0px_-4px_-4px_-4px)]">
                                {tabs.map(tab => (
                                    <DropdownMenuItem
                                        key={tab.id}
                                        onClick={() => setActiveTabId(tab.id)}
                                        className={`flex items-center justify-between ${tab.id === activeTabId ? "text-foreground" : ""}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            {tabIcon(tab.type)}
                                            {tab.type === "dashboard" ? "Dashboard" : tab.label}
                                        </div>
                                        {tab.type !== "dashboard" && (
                                            <button
                                                onClick={e => {
                                                    e.stopPropagation();
                                                    setTabs(prev => {
                                                        const next = prev.filter(t => t.id !== tab.id);
                                                        if (tab.id === activeTabId) setActiveTabId(next[next.length - 1].id);
                                                        return next;
                                                    });
                                                }}
                                                className="text-muted-foreground hover:text-foreground ml-2"
                                            >
                                                <X className="size-3"/>
                                            </button>
                                        )}
                                    </DropdownMenuItem>
                                ))}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Separator orientation="vertical"/>
                        <Button variant="ghost" size="icon" className={`h-full w-12.5 rounded-none hover:text-foreground ${toolsOpen ? "text-orange-400 bg-orange-400/10" : "text-muted-foreground"}`} onClick={() => setToolsOpen(o => !o)}>
                            <Hammer className="size-4"/>
                        </Button>
                        <Separator orientation="vertical"/>
                        <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground" onClick={() => setQuickConnectOpen(true)}>
                            <Zap className="size-4"/>
                        </Button>
                        <Separator orientation="vertical"/>
                        <Button variant="ghost" size="icon" className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground" onClick={() => setTabBarOpen(o => !o)}>
                            <ChevronUp className={`size-4 transition-transform ${tabBarOpen ? "" : "rotate-180"}`}/>
                        </Button>
                    </div>
                </div>
                {!tabBarOpen && (
                    <button
                        onClick={() => setTabBarOpen(true)}
                        className="flex items-center justify-center w-full h-4 bg-sidebar border-b border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
                    >
                        <ChevronDown className="size-3"/>
                    </button>
                )}
                {(() => {
                    const activeTab = tabs.find(t => t.id === activeTabId)!;
                    switch (activeTab.type) {
                        case "dashboard":      return <DashboardTab/>;
                        case "terminal":       return <TerminalTab label={activeTab.label}/>;
                        case "stats":          return <StatsTab label={activeTab.label}/>;
                        case "files":          return <FilesTab label={activeTab.label}/>;
                        case "host-manager":   return <HostManagerTab/>;
                        case "user-profile":   return <UserProfileTab/>;
                        case "admin-settings": return <AdminSettingsTab/>;
                        case "docker":         return <DockerTab/>;
                        case "tunnel":         return <TunnelTab/>;
                    }
                })()}
                </div>
                <div className={`flex flex-col bg-sidebar shrink-0 transition-all duration-200 overflow-hidden ${toolsOpen ? "w-76 border-l border-border" : "w-0"}`}>
                    <ToolsSidebar onClose={() => setToolsOpen(false)}/>
                </div>
            </div>
        </div>

        <QuickConnectDialog open={quickConnectOpen} onOpenChange={setQuickConnectOpen}/>
        <Toaster position="bottom-right" richColors/>
        </>
    )
}

type ToolsTab = "ssh-tools" | "snippets" | "history" | "split-screen";
type SplitMode = "none" | "2-way" | "3-way" | "4-way" | "5-way" | "6-way";

type Snippet = {
    id: number;
    name: string;
    description?: string;
    command: string;
    folderId: number | null;
};

type SnippetFolder = {
    id: number;
    name: string;
    color: string;
    icon: FolderIconId;
    open: boolean;
};

const TOOLS_TABS: {id: ToolsTab; label: string}[] = [
    {id: "ssh-tools",     label: "SSH Tools"},
    {id: "snippets",      label: "Snippets"},
    {id: "history",       label: "History"},
    {id: "split-screen",  label: "Split Screen"},
];

const SPLIT_MODES: {id: SplitMode; label: string}[] = [
    {id: "none",  label: "None"},
    {id: "2-way", label: "2-Way"},
    {id: "3-way", label: "3-Way"},
    {id: "4-way", label: "4-Way"},
    {id: "5-way", label: "5-Way"},
    {id: "6-way", label: "6-Way"},
];

const FOLDER_COLORS = [
    "#ef4444", "#f97316", "#eab308", "#22c55e",
    "#3b82f6", "#a855f7", "#ec4899", "#6b7280",
];

const FOLDER_ICONS = ["folder", "server", "cloud", "database", "box", "network", "copy", "settings", "cpu", "globe"] as const;
type FolderIconId = typeof FOLDER_ICONS[number];

function FolderIconEl({icon, className, style}: {icon: FolderIconId; className?: string; style?: React.CSSProperties}) {
    const props = {className, style};
    switch (icon) {
        case "folder":   return <Folder {...props}/>;
        case "server":   return <Server {...props}/>;
        case "cloud":    return <Cloud {...props}/>;
        case "database": return <Database {...props}/>;
        case "box":      return <Box {...props}/>;
        case "network":  return <Network {...props}/>;
        case "copy":     return <Copy {...props}/>;
        case "settings": return <Settings {...props}/>;
        case "cpu":      return <Cpu {...props}/>;
        case "globe":    return <Globe {...props}/>;
    }
}

const INITIAL_FOLDERS: SnippetFolder[] = [
    {id: 1, name: "test",          color: "#f97316", icon: "server", open: true},
    {id: 2, name: "Uncategorized", color: "#6b7280", icon: "folder", open: true},
];

const INITIAL_SNIPPETS: Snippet[] = [
    {id: 2, name: "test",                       command: "test", folderId: 1},
    {id: 1, name: "test", description: "test",  command: "test", folderId: 2},
];

function CreateSnippetDialog({open, onOpenChange, folders, onCreate}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    folders: SnippetFolder[];
    onCreate: (s: Omit<Snippet, "id">) => void;
}) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [folderId, setFolderId] = useState<number | null>(null);
    const [command, setCommand] = useState("");

    function handleCreate() {
        if (!name.trim() || !command.trim()) return;
        onCreate({name: name.trim(), description: description.trim() || undefined, command: command.trim(), folderId});
        setName(""); setDescription(""); setFolderId(null); setCommand("");
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Create Snippet</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Create a new command snippet for quick execution
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold">Name <span className="text-orange-400">*</span></label>
                        <Input placeholder="e.g., Restart Nginx" value={name} onChange={e => setName(e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-muted-foreground">Description <span className="font-normal">(Optional)</span></label>
                        <Input placeholder="Optional description" value={description} onChange={e => setDescription(e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                            <Folder className="size-3.5"/>
                            Folder <span className="font-normal">(Optional)</span>
                        </label>
                        <select
                            value={folderId ?? ""}
                            onChange={e => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
                            className="px-3 py-2 text-sm bg-background border border-border text-foreground outline-none focus:ring-1 focus:ring-ring"
                        >
                            <option value="">No folder (Uncategorized)</option>
                            {folders.filter(f => f.name !== "Uncategorized").map(f => (
                                <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold">Command <span className="text-orange-400">*</span></label>
                        <textarea
                            placeholder="e.g., sudo systemctl restart nginx"
                            value={command}
                            onChange={e => setCommand(e.target.value)}
                            className="w-full h-36 px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                        />
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="outline" className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-400" onClick={handleCreate}>
                        Create Snippet
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function CreateFolderDialog({open, onOpenChange, onCreate}: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    onCreate: (f: Omit<SnippetFolder, "id" | "open">) => void;
}) {
    const [name, setName] = useState("");
    const [color, setColor] = useState(FOLDER_COLORS[0]);
    const [icon, setIcon] = useState<FolderIconId>("folder");

    function handleCreate() {
        if (!name.trim()) return;
        onCreate({name: name.trim(), color, icon});
        setName(""); setColor(FOLDER_COLORS[0]); setIcon("folder");
        onOpenChange(false);
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Create Folder</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Organize your snippets into folders
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold">Folder Name <span className="text-orange-400">*</span></label>
                        <Input placeholder="e.g., System Commands, Docker Scripts" value={name} onChange={e => setName(e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold">Folder Color</label>
                        <div className="grid grid-cols-4 gap-2">
                            {FOLDER_COLORS.map(c => (
                                <button
                                    key={c}
                                    onClick={() => setColor(c)}
                                    className={`h-10 transition-all ${color === c ? "ring-2 ring-offset-2 ring-offset-background ring-white/50" : "opacity-75 hover:opacity-100"}`}
                                    style={{backgroundColor: c}}
                                />
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-2">
                        <label className="text-xs font-semibold">Folder Icon</label>
                        <div className="grid grid-cols-5 gap-2">
                            {FOLDER_ICONS.map(ic => (
                                <button
                                    key={ic}
                                    onClick={() => setIcon(ic)}
                                    className={`flex items-center justify-center h-11 border transition-colors ${
                                        icon === ic
                                            ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                                            : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
                                    }`}
                                >
                                    <FolderIconEl icon={ic} className="size-5"/>
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold">Preview</label>
                        <div className="flex items-center gap-2 px-3 py-3 border border-border bg-muted/20">
                            <FolderIconEl icon={icon} className="size-4 shrink-0" style={{color}}/>
                            <span className="text-sm font-semibold">{name || "Folder Name"}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="outline" className="border-orange-500/40 text-orange-400 hover:bg-orange-500/10 hover:text-orange-400" onClick={handleCreate}>
                        Create Folder
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

type HistoryEntry = {
    id: number;
    command: string;
    host: string;
    time: string;
};

const HISTORY_ENTRIES: HistoryEntry[] = [
    {id: 1,  command: "sudo systemctl restart nginx",           host: "web-01",     time: "2m ago"},
    {id: 2,  command: "tail -f /var/log/nginx/error.log",      host: "web-01",     time: "4m ago"},
    {id: 3,  command: "docker ps -a",                          host: "web-02",     time: "9m ago"},
    {id: 4,  command: "df -h",                                 host: "db-primary", time: "12m ago"},
    {id: 5,  command: "pg_dump mydb > backup.sql",             host: "db-primary", time: "15m ago"},
    {id: 6,  command: "top",                                   host: "db-replica", time: "21m ago"},
    {id: 7,  command: "ls -la /var/www",                       host: "web-02",     time: "28m ago"},
    {id: 8,  command: "cat /etc/hosts",                        host: "stage-web",  time: "34m ago"},
    {id: 9,  command: "sudo apt update && sudo apt upgrade -y", host: "stage-db",  time: "41m ago"},
    {id: 10, command: "systemctl status postgresql",           host: "db-primary", time: "55m ago"},
    {id: 11, command: "free -m",                               host: "web-01",     time: "1h ago"},
    {id: 12, command: "netstat -tlnp",                         host: "stage-web",  time: "1h ago"},
];

function HistoryTab() {
    const [search, setSearch] = useState("");
    const [entries, setEntries] = useState<HistoryEntry[]>(HISTORY_ENTRIES);

    const filtered = search
        ? entries.filter(e =>
            e.command.toLowerCase().includes(search.toLowerCase()) ||
            e.host.toLowerCase().includes(search.toLowerCase())
          )
        : entries;

    return (
        <>
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                <Input placeholder="Search history..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8"/>
            </div>
            <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{filtered.length} command{filtered.length !== 1 ? "s" : ""}</span>
                <button
                    onClick={() => setEntries([])}
                    className="text-xs text-orange-400 hover:text-orange-300"
                >
                    Clear All
                </button>
            </div>
            <div className="flex flex-col gap-1">
                {filtered.length === 0 && (
                    <span className="text-xs text-muted-foreground/60 text-center py-8">No history entries</span>
                )}
                {filtered.map(entry => (
                    <div
                        key={entry.id}
                        className="group flex flex-col gap-1 px-2.5 py-2 border border-border bg-background hover:border-muted-foreground/30 transition-colors"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-mono text-foreground break-all leading-relaxed">{entry.command}</span>
                            <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="ghost" size="icon"
                                    className="size-6 text-muted-foreground hover:text-foreground"
                                    onClick={() => navigator.clipboard.writeText(entry.command)}
                                >
                                    <Copy className="size-3"/>
                                </Button>
                                <Button
                                    variant="ghost" size="icon"
                                    className="size-6 text-muted-foreground hover:text-destructive"
                                    onClick={() => setEntries(prev => prev.filter(e => e.id !== entry.id))}
                                >
                                    <Trash2 className="size-3"/>
                                </Button>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground/60">{entry.host}</span>
                            <span className="text-xs text-muted-foreground/40">·</span>
                            <span className="text-xs text-muted-foreground/60">{entry.time}</span>
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

function ToolsSidebar({onClose}: {onClose: () => void}) {
    const [activeTab, setActiveTab] = useState<ToolsTab>("ssh-tools");
    const [splitMode, setSplitMode] = useState<SplitMode>("none");
    const [snippetSearch, setSnippetSearch] = useState("");
    const [keyRecording, setKeyRecording] = useState(false);
    const [rightClickPaste, setRightClickPaste] = useState(false);
    const [folders, setFolders] = useState<SnippetFolder[]>(INITIAL_FOLDERS);
    const [snippets, setSnippets] = useState<Snippet[]>(INITIAL_SNIPPETS);
    const [createSnippetOpen, setCreateSnippetOpen] = useState(false);
    const [createFolderOpen, setCreateFolderOpen] = useState(false);

    function handleCreateSnippet(s: Omit<Snippet, "id">) {
        const id = Math.max(0, ...snippets.map(x => x.id)) + 1;
        setSnippets(prev => [...prev, {...s, id}]);
        toast.success("Snippet created successfully");
    }

    function handleCreateFolder(f: Omit<SnippetFolder, "id" | "open">) {
        const id = Math.max(0, ...folders.map(x => x.id)) + 1;
        setFolders(prev => [...prev, {...f, id, open: true}]);
        toast.success("Folder created successfully");
    }

    function toggleFolder(id: number) {
        setFolders(prev => prev.map(f => f.id === id ? {...f, open: !f.open} : f));
    }

    function deleteSnippet(id: number) {
        setSnippets(prev => prev.filter(s => s.id !== id));
    }

    const filtered = snippetSearch
        ? snippets.filter(s =>
            s.name.toLowerCase().includes(snippetSearch.toLowerCase()) ||
            s.command.toLowerCase().includes(snippetSearch.toLowerCase())
          )
        : snippets;

    const namedFolders = folders.filter(f => f.name !== "Uncategorized");
    const uncategorized = folders.find(f => f.name === "Uncategorized");
    const allFolders = [...namedFolders, ...(uncategorized ? [uncategorized] : [])];

    return (
        <>
        <div className="flex flex-col w-76 bg-sidebar border-l border-border shrink-0 h-full relative">
            <div className="flex items-center justify-between px-4 h-12.5 border-b border-border shrink-0">
                <span className="text-base font-bold">Tools</span>
                <div className="flex items-center gap-1">
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground">
                        <RefreshCw className="size-3.5"/>
                    </Button>
                    <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground" onClick={onClose}>
                        <X className="size-3.5"/>
                    </Button>
                </div>
            </div>

            <div className="flex shrink-0 border-b border-border">
                {TOOLS_TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 text-xs font-semibold border-b-2 transition-colors ${
                            activeTab === tab.id
                                ? "border-b-orange-400 text-foreground"
                                : "border-b-transparent text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 gap-3">
                {activeTab === "ssh-tools" && (
                    <>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest">Key Recording</span>
                            <Button
                                variant="outline"
                                className={`w-full ${keyRecording ? "border-orange-500/40 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 hover:text-orange-400" : ""}`}
                                onClick={() => setKeyRecording(o => !o)}
                            >
                                {keyRecording ? "Stop Key Recording" : "Start Key Recording"}
                            </Button>
                        </div>
                        <Separator/>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest">Settings</span>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={rightClickPaste}
                                    onChange={e => setRightClickPaste(e.target.checked)}
                                    className="size-3.5 accent-orange-400"
                                />
                                <span className="text-sm text-muted-foreground">Enable right-click copy/paste</span>
                            </label>
                        </div>
                    </>
                )}

                {activeTab === "snippets" && (
                    <>
                        <div className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">Select Terminals <span className="text-muted-foreground font-normal">(optional)</span></span>
                            <span className="text-xs text-muted-foreground">Execute on current terminal (click to select multiple)</span>
                            <div className="flex items-center gap-2 mt-0.5">
                                <button className="text-xs text-orange-400 hover:text-orange-300">Select All</button>
                                <button className="text-xs text-orange-400 hover:text-orange-300">Deselect All</button>
                            </div>
                        </div>
                        <Separator/>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                            <Input placeholder="Search snippets..." value={snippetSearch} onChange={e => setSnippetSearch(e.target.value)} className="pl-8"/>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateSnippetOpen(true)}>
                                <Plus className="size-3.5"/>New Snippet
                            </Button>
                            <Button variant="outline" className="flex-1 text-xs" onClick={() => setCreateFolderOpen(true)}>
                                <Folder className="size-3.5"/>New Folder
                            </Button>
                        </div>
                        <div className="flex flex-col gap-4">
                            {allFolders.map(folder => {
                                const folderSnippets = filtered.filter(s =>
                                    folder.name === "Uncategorized"
                                        ? s.folderId === null || s.folderId === folder.id
                                        : s.folderId === folder.id
                                );
                                if (folderSnippets.length === 0 && snippetSearch) return null;
                                return (
                                    <div key={folder.id} className="flex flex-col gap-2">
                                        <button
                                            onClick={() => toggleFolder(folder.id)}
                                            className="flex items-center gap-1.5 w-full text-left"
                                        >
                                            <ChevronDown className={`size-3 text-muted-foreground shrink-0 transition-transform ${folder.open ? "" : "-rotate-90"}`}/>
                                            <FolderIconEl icon={folder.icon} className="size-3.5 shrink-0" style={{color: folder.color}}/>
                                            <span className="text-xs font-semibold flex-1 truncate" style={{color: folder.name === "Uncategorized" ? undefined : folder.color}}>
                                                {folder.name}
                                            </span>
                                            <span className="text-xs text-muted-foreground shrink-0">{folderSnippets.length}</span>
                                        </button>
                                        {folder.open && (
                                            <div className="flex flex-col gap-2 ml-1">
                                                {folderSnippets.map(snippet => (
                                                    <div key={snippet.id} className="border border-border bg-background p-2.5 flex flex-col gap-2">
                                                        <div className="flex items-start gap-2">
                                                            <div className="grid grid-cols-2 gap-px mt-0.5 shrink-0 opacity-30">
                                                                <div className="size-1 bg-muted-foreground rounded-full"/>
                                                                <div className="size-1 bg-muted-foreground rounded-full"/>
                                                                <div className="size-1 bg-muted-foreground rounded-full"/>
                                                                <div className="size-1 bg-muted-foreground rounded-full"/>
                                                            </div>
                                                            <div className="flex flex-col min-w-0">
                                                                <span className="text-xs font-semibold">{snippet.name}</span>
                                                                {snippet.description && <span className="text-xs text-muted-foreground">{snippet.description}</span>}
                                                                <span className="text-xs text-muted-foreground">ID: {snippet.id}</span>
                                                            </div>
                                                        </div>
                                                        <span className="text-xs text-muted-foreground font-mono px-1">{snippet.command}</span>
                                                        <div className="flex items-center gap-1">
                                                            <Button variant="outline" size="sm" className="flex-1 text-xs h-7 gap-1.5">
                                                                <Play className="size-3"/>Run
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                                                <Copy className="size-3.5"/>
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                                                <Pencil className="size-3.5"/>
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-destructive shrink-0" onClick={() => deleteSnippet(snippet.id)}>
                                                                <Trash2 className="size-3.5"/>
                                                            </Button>
                                                            <Button variant="ghost" size="icon" className="size-7 text-muted-foreground hover:text-foreground shrink-0">
                                                                <Share2 className="size-3.5"/>
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                                {folderSnippets.length === 0 && (
                                                    <span className="text-xs text-muted-foreground/60 pl-1">No snippets in this folder</span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </>
                )}

                {activeTab === "history" && (
                    <HistoryTab/>
                )}

                {activeTab === "split-screen" && (
                    <>
                        <div className="grid grid-cols-3 gap-2">
                            {SPLIT_MODES.map(mode => (
                                <button
                                    key={mode.id}
                                    onClick={() => setSplitMode(mode.id)}
                                    className={`px-2 py-2 text-xs font-semibold border transition-colors ${
                                        splitMode === mode.id
                                            ? "border-orange-500/40 bg-orange-500/10 text-orange-400"
                                            : "border-border text-muted-foreground hover:text-foreground"
                                    }`}
                                >
                                    {mode.label}
                                </button>
                            ))}
                        </div>
                        {splitMode === "none" && (
                            <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
                                <div className="grid grid-cols-2 gap-1 opacity-30">
                                    <div className="size-6 border-2 border-muted-foreground"/>
                                    <div className="size-6 border-2 border-muted-foreground"/>
                                    <div className="size-6 border-2 border-muted-foreground"/>
                                    <div className="size-6 border-2 border-muted-foreground"/>
                                </div>
                                <span className="text-sm text-muted-foreground mt-1">Select a split screen mode</span>
                                <span className="text-xs text-muted-foreground/60">Choose how many tabs you want to view at once</span>
                            </div>
                        )}
                    </>
                )}
            </div>

        </div>

        <CreateSnippetDialog
            open={createSnippetOpen}
            onOpenChange={setCreateSnippetOpen}
            folders={folders}
            onCreate={handleCreateSnippet}
        />
        <CreateFolderDialog
            open={createFolderOpen}
            onOpenChange={setCreateFolderOpen}
            onCreate={handleCreateFolder}
        />
        </>
    );
}

function QuickConnectDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
    const [host, setHost] = useState("");
    const [port, setPort] = useState("22");
    const [username, setUsername] = useState("");
    const [authType, setAuthType] = useState<"password" | "key" | "credential">("password");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="text-lg font-bold">Quick Connect</DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Connect directly to a terminal or file manager session without saving a host configuration.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 mt-1">
                    <div className="flex gap-3">
                        <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">IP Address or Hostname</label>
                            <Input placeholder="192.168.1.1 or example.com" value={host} onChange={e => setHost(e.target.value)}/>
                        </div>
                        <div className="flex flex-col gap-1.5 w-24">
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Port</label>
                            <Input placeholder="22" value={port} onChange={e => setPort(e.target.value)}/>
                        </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Username</label>
                        <Input placeholder="username" value={username} onChange={e => setUsername(e.target.value)}/>
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Authentication</label>
                        <div className="flex gap-1">
                            {(["password", "key", "credential"] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setAuthType(type)}
                                    className={`px-3 py-1 text-xs font-semibold border transition-colors capitalize ${authType === type ? "border-orange-400/40 bg-orange-400/10 text-orange-400" : "border-border text-muted-foreground hover:text-foreground"}`}
                                >
                                    {type}
                                </button>
                            ))}
                        </div>
                    </div>
                    {authType === "password" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Password</label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? "text" : "password"}
                                    placeholder="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    className="pr-9"
                                />
                                <button
                                    onClick={() => setShowPassword(o => !o)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                                >
                                    {showPassword ? <EyeOff className="size-4"/> : <Eye className="size-4"/>}
                                </button>
                            </div>
                        </div>
                    )}
                    {authType === "key" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Private Key</label>
                            <textarea
                                placeholder="Paste private key contents here..."
                                className="w-full h-28 px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                            />
                        </div>
                    )}
                    {authType === "credential" && (
                        <div className="flex flex-col gap-1.5">
                            <label className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Credential</label>
                            <Input placeholder="Select a saved credential"/>
                        </div>
                    )}
                </div>
                <div className="flex items-center justify-end gap-2 mt-2">
                    <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button variant="outline" className="border-orange-400/40 text-orange-400 hover:bg-orange-400/10 hover:text-orange-400">
                        <Terminal className="size-3.5"/>
                        Connect to Terminal
                    </Button>
                    <Button variant="outline" className="border-orange-400/40 text-orange-400 hover:bg-orange-400/10 hover:text-orange-400">
                        <FolderSearch className="size-3.5"/>
                        Connect to File Manager
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

export default App
