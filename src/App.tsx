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
import { Card } from "@/components/ui/card";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";

type Host = {
    name: string;
    user: string;
    address: string;
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

const hostTree: HostFolder = {
    name: "root",
    children: [
        {
            name: "Production",
            children: [
                {
                    name: "Web Servers",
                    children: [
                        {name: "web-01", user: "deploy", address: "10.0.1.10"},
                        {name: "web-02", user: "deploy", address: "10.0.1.11"},
                    ],
                },
                {name: "db-primary", user: "postgres", address: "10.0.2.10"},
                {name: "db-replica", user: "postgres", address: "10.0.2.11"},
            ],
        },
        {
            name: "Staging",
            children: [
                {name: "stage-web", user: "deploy", address: "10.1.1.10"},
                {name: "stage-db", user: "postgres", address: "10.1.2.10"},
            ],
        },
    ],
};

const recentActivity = [
    {host: "web-01", action: "Terminal", time: "2m ago", online: true},
    {host: "db-primary", action: "Terminal", time: "5m ago", online: true},
    {host: "web-02", action: "Terminal", time: "12m ago", online: true},
    {host: "db-primary", action: "Terminal", time: "18m ago", online: true},
    {host: "stage-web", action: "Terminal", time: "25m ago", online: true},
    {host: "db-replica", action: "Terminal", time: "31m ago", online: false},
    {host: "stage-db", action: "Terminal", time: "45m ago", online: false},
    {host: "web-01", action: "Terminal", time: "1h ago", online: true},
];

const hostStatuses = [
    {name: "web-01", address: "10.0.1.10", online: true, cpu: 12, ram: 34},
    {name: "web-02", address: "10.0.1.11", online: true, cpu: 8, ram: 27},
    {name: "db-primary", address: "10.0.2.10", online: true, cpu: 45, ram: 71},
    {name: "db-replica", address: "10.0.2.11", online: false, cpu: 0, ram: 0},
    {name: "stage-web", address: "10.1.1.10", online: true, cpu: 3, ram: 18},
    {name: "stage-db", address: "10.1.2.10", online: false, cpu: 0, ram: 0},
];

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
    const isOnline = hostStatuses.find(h => h.name === host.name)?.online;

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
        </>
    )
}

type ToolsTab = "ssh-tools" | "snippets" | "history" | "split-screen";

type SplitMode = "none" | "2-way" | "3-way" | "4-way" | "5-way" | "6-way";

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

function ToolsSidebar({onClose}: {onClose: () => void}) {
    const [activeTab, setActiveTab] = useState<ToolsTab>("ssh-tools");
    const [splitMode, setSplitMode] = useState<SplitMode>("none");
    const [snippetSearch, setSnippetSearch] = useState("");
    const [keyRecording, setKeyRecording] = useState(false);
    const [rightClickPaste, setRightClickPaste] = useState(false);

    return (
        <div className="flex flex-col w-76 shrink-0 h-full">
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

            {/* Tab bar */}
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

            <div className="flex flex-col flex-1 min-h-0 overflow-y-auto p-3 gap-4">
                {activeTab === "ssh-tools" && (
                    <>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-foreground">Key Recording</span>
                            <Button
                                variant="outline"
                                className={`w-full ${keyRecording ? "border-orange-400/40 text-orange-400 bg-orange-400/10 hover:bg-orange-400/20 hover:text-orange-400" : ""}`}
                                onClick={() => setKeyRecording(o => !o)}
                            >
                                {keyRecording ? "Stop Key Recording" : "Start Key Recording"}
                            </Button>
                        </div>
                        <Separator/>
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold uppercase tracking-widest text-foreground">Settings</span>
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
                        <div className="flex flex-col gap-1.5">
                            <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Select Terminals (optional)</span>
                            <span className="text-xs text-muted-foreground">Execute on current terminal (click to select multiple)</span>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <button className="text-xs text-orange-400 hover:text-orange-300">Select All</button>
                                <button className="text-xs text-orange-400 hover:text-orange-300">Deselect All</button>
                            </div>
                        </div>
                        <Separator/>
                        <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"/>
                            <Input
                                placeholder="Search snippets..."
                                value={snippetSearch}
                                onChange={e => setSnippetSearch(e.target.value)}
                                className="pl-8"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" className="flex-1 text-xs gap-1.5">
                                <Plus className="size-3.5"/>
                                New Snippet
                            </Button>
                            <Button variant="outline" className="flex-1 text-xs gap-1.5">
                                <Folder className="size-3.5"/>
                                New Folder
                            </Button>
                        </div>
                        <div className="flex flex-col items-center justify-center gap-1 py-8 text-center">
                            <span className="text-sm text-muted-foreground">No snippets yet</span>
                            <span className="text-xs text-muted-foreground/60">Create a snippet to save commonly used commands</span>
                        </div>
                    </>
                )}

                {activeTab === "history" && (
                    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center flex-1">
                        <Card className="px-4 py-5 flex flex-col gap-1 w-full">
                            <span className="text-sm font-semibold">Command History is Disabled</span>
                            <span className="text-xs text-orange-400/80">Enable Command History Tracking in your profile under Appearance settings.</span>
                        </Card>
                    </div>
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
                                            ? "border-orange-400/40 bg-orange-400/10 text-orange-400"
                                            : "border-border text-muted-foreground hover:text-foreground hover:border-muted-foreground"
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
