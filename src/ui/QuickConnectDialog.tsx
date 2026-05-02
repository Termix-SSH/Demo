import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Eye, EyeOff, FolderSearch, Terminal } from "lucide-react";

export function QuickConnectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
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
                  className={`px-3 py-1 text-xs font-semibold border transition-colors capitalize ${authType === type ? "border-accent-brand/40 bg-accent-brand/10 text-accent-brand" : "border-border text-muted-foreground hover:text-foreground"}`}
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
          <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
            <Terminal className="size-3.5"/>
            Connect to Terminal
          </Button>
          <Button variant="outline" className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand">
            <FolderSearch className="size-3.5"/>
            Connect to File Manager
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
