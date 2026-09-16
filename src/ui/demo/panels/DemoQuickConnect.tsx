import { useState } from "react";
import { FolderTree, Terminal, Zap } from "lucide-react";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Label } from "@/components/label";
import { PasswordInput } from "@/components/password-input";
import { GroupHeading, PANEL, PanelShell } from "@/components/panel-layout";
import { FakeSwitch } from "@/components/section-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";

/**
 * Mirrors the real QuickConnectPanel: an address, how to authenticate, and two
 * buttons. Nothing is written to the host list unless you ask for it.
 */
export function DemoQuickConnect({
  chrome = true,
  onConnect,
}: {
  chrome?: boolean;
  onConnect?: (kind: "terminal" | "files") => void;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [auth, setAuth] = useState("password");
  const [secret, setSecret] = useState("");
  const [save, setSave] = useState(false);

  const ready = host.trim().length > 0 && username.trim().length > 0;

  return (
    <PanelShell
      chrome={chrome}
      icon={<Zap className="size-4" />}
      title="Quick Connect"
      status="Not saved"
      className={`${PANEL.body} ${PANEL.gap}`}
    >
      <GroupHeading title="Where" />
      <div className="flex gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Address
          </Label>
          <Input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="10.0.0.12"
            className="h-8 font-mono text-xs"
          />
        </div>
        <div className="flex w-20 shrink-0 flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Port
          </Label>
          <Input
            value={port}
            onChange={(e) => setPort(e.target.value)}
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>

      <GroupHeading title="Who" />
      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Username
        </Label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="root"
          className="h-8 font-mono text-xs"
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
          Authenticate with
        </Label>
        <Select value={auth} onValueChange={setAuth}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="password">Password</SelectItem>
            <SelectItem value="key">SSH key</SelectItem>
            <SelectItem value="credential">Saved credential</SelectItem>
            <SelectItem value="agent">SSH agent</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {auth === "password" && (
        <div className="flex flex-col gap-1">
          <Label className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Password
          </Label>
          <PasswordInput
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            className="h-8 text-xs"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border border-border px-3 py-2.5">
        <div className="flex min-w-0 flex-col">
          <span className="text-xs font-medium">Keep this host</span>
          <span className="text-[11px] text-muted-foreground">
            Off means it is forgotten when the session ends.
          </span>
        </div>
        <FakeSwitch checked={save} onChange={setSave} />
      </div>

      <div className="mt-1 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={!ready}
          onClick={() => onConnect?.("terminal")}
          className="h-8 flex-1 gap-1.5 text-accent-brand border-accent-brand/40 hover:bg-accent-brand/10 hover:text-accent-brand disabled:text-muted-foreground disabled:border-border"
        >
          <Terminal className="size-3" />
          Terminal
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={!ready}
          onClick={() => onConnect?.("files")}
          className="h-8 flex-1 gap-1.5"
        >
          <FolderTree className="size-3" />
          Files
        </Button>
      </div>
    </PanelShell>
  );
}
