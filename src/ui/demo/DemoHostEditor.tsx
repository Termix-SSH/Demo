import React from "react";
import { useTranslation } from "react-i18next";
import {
  Box,
  FolderSearch,
  Globe,
  Monitor,
  MousePointerClick,
  Server,
  Shield,
  Tag,
  Terminal,
  X,
} from "lucide-react";
import { Input } from "@/components/input";
import { PasswordInput } from "@/components/password-input";
import { FakeSwitch, SectionCard, SettingRow } from "@/components/section-card";
import { FolderPathPicker } from "@/sidebar/FolderPathPicker";
import type { Credential, Host } from "@/types/ui-types";

export interface HostEditorForm {
  name: string;
  ip: string;
  folder: string;
  tags: string[];
  tagInput: string;
  notes: string;
  pin: boolean;
  sshPort: number;
  username: string;
  authType: Host["authType"];
  credentialId: string;
  password: string;
  key: string;
  enableSsh: boolean;
  enableRdp: boolean;
  enableVnc: boolean;
  enableTelnet: boolean;
  rdpPort: number;
  vncPort: number;
  telnetPort: number;
  enableTerminal: boolean;
  enableTerminalToolbar: boolean;
  enableCommandHistory: boolean;
  enableTunnel: boolean;
  enableDocker: boolean;
  enableFileManager: boolean;
  scpLegacy: boolean;
  defaultPath: string;
  enableProxmox: boolean;
}

export type HostProtocols = Pick<
  HostEditorForm,
  "enableSsh" | "enableRdp" | "enableVnc" | "enableTelnet"
>;

export function createHostEditorForm(host: Host | null): HostEditorForm {
  return {
    name: host?.name ?? "",
    ip: host?.ip ?? "",
    folder: host?.folder ?? "",
    tags: host?.tags ?? [],
    tagInput: "",
    notes: host?.notes ?? "",
    pin: host?.pin ?? false,
    sshPort: host?.sshPort ?? 22,
    username: host?.username ?? "",
    authType: host?.authType ?? "credential",
    credentialId: host?.credentialId != null ? String(host.credentialId) : "",
    password: "",
    key: "",
    enableSsh: host?.enableSsh ?? true,
    enableRdp: host?.enableRdp ?? false,
    enableVnc: host?.enableVnc ?? false,
    enableTelnet: host?.enableTelnet ?? false,
    rdpPort: host?.rdpPort ?? 3389,
    vncPort: host?.vncPort ?? 5900,
    telnetPort: host?.telnetPort ?? 23,
    enableTerminal: host?.enableTerminal ?? true,
    enableTerminalToolbar: host?.enableTerminalToolbar ?? true,
    enableCommandHistory: host?.enableCommandHistory ?? true,
    enableTunnel: host?.enableTunnel ?? false,
    enableDocker: host?.enableDocker ?? false,
    enableFileManager: host?.enableFileManager ?? true,
    scpLegacy: host?.scpLegacy ?? false,
    defaultPath: host?.defaultPath ?? "",
    enableProxmox: host?.enableProxmox ?? false,
  };
}

type SetField = <K extends keyof HostEditorForm>(
  key: K,
  value: HostEditorForm[K],
) => void;

export function DemoHostEditor({
  form,
  setField,
  activeTab,
  hosts,
  credentials,
}: {
  form: HostEditorForm;
  setField: SetField;
  activeTab: string;
  hosts: Host[];
  credentials: Credential[];
}) {
  const { t } = useTranslation();

  const folderPaths = React.useMemo(() => {
    const set = new Set<string>();
    for (const h of hosts) {
      if (!h.folder) continue;
      const parts = h.folder.split(" / ");
      let acc = "";
      for (const part of parts) {
        acc = acc ? `${acc} / ${part}` : part;
        set.add(acc);
      }
    }
    return [...set];
  }, [hosts]);

  const protocolCards = [
    {
      key: "enableSsh" as const,
      label: t("hosts.tabSsh"),
      desc: t("hosts.secureShell"),
      icon: <Terminal className="size-4" />,
    },
    {
      key: "enableRdp" as const,
      label: t("hosts.tabRdp"),
      desc: t("hosts.remoteDesktop"),
      icon: <Monitor className="size-4" />,
    },
    {
      key: "enableVnc" as const,
      label: t("hosts.tabVnc"),
      desc: t("hosts.virtualNetwork"),
      icon: <MousePointerClick className="size-4" />,
    },
    {
      key: "enableTelnet" as const,
      label: t("hosts.tabTelnet"),
      desc: t("hosts.unencryptedShell"),
      icon: <Terminal className="size-4" />,
    },
  ];

  const noProtocol =
    !form.enableSsh &&
    !form.enableRdp &&
    !form.enableVnc &&
    !form.enableTelnet;

  return (
    <div className="flex flex-col gap-3">
      {activeTab === "general" && (
        <>
          <SectionCard
            title={t("hosts.protocols")}
            icon={<Globe className="size-3.5" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 py-3">
              {protocolCards.map(({ key, label, desc, icon }) => {
                const enabled = form[key];
                return (
                  <div
                    key={key}
                    className={`flex items-center gap-3 p-3 border transition-colors ${
                      enabled
                        ? "border-accent-brand/20 bg-accent-brand/5"
                        : "border-border bg-muted/10"
                    }`}
                  >
                    <div
                      className={`size-8 flex items-center justify-center shrink-0 ${
                        enabled
                          ? "text-accent-brand"
                          : "text-muted-foreground/30"
                      }`}
                    >
                      {icon}
                    </div>
                    <div className="flex flex-col gap-1 flex-1 min-w-0">
                      <span
                        className={`text-xs font-bold ${
                          enabled
                            ? "text-foreground"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {label}
                      </span>
                      <span className="text-[10px] text-muted-foreground/50">
                        {desc}
                      </span>
                    </div>
                    <FakeSwitch
                      checked={enabled}
                      onChange={(value) => setField(key, value)}
                    />
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title={t("hosts.connectionDetails")}
            icon={<Globe className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.addressIp")}
                </label>
                <Input
                  placeholder="10.0.0.1 or example.com"
                  value={form.ip}
                  onChange={(e) => setField("ip", e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.friendlyName")}
                  </label>
                  <Input
                    placeholder="e.g. Web Server Production"
                    value={form.name}
                    onChange={(e) => setField("name", e.target.value)}
                  />
                </div>
              </div>
            </div>
          </SectionCard>

          {noProtocol && (
            <div className="flex items-center gap-3 p-3 border border-border bg-muted/20 text-xs text-muted-foreground">
              <Globe className="size-4 shrink-0 text-muted-foreground/40" />
              <span>{t("hosts.enableAtLeastOneProtocol")}</span>
            </div>
          )}

          <SectionCard
            title={t("hosts.folderAndAdvanced")}
            icon={<Tag className="size-3.5" />}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-3">
              <div className="flex flex-col gap-1.5 col-span-2 md:col-span-1">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.folder")}
                </label>
                <FolderPathPicker
                  value={form.folder}
                  onChange={(path) => setField("folder", path)}
                  folderPaths={folderPaths}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.tags")}
                </label>
                <TagInput
                  tags={form.tags}
                  input={form.tagInput}
                  placeholder={t("hosts.addTag")}
                  onTagsChange={(tags) => setField("tags", tags)}
                  onInputChange={(value) => setField("tagInput", value)}
                />
              </div>
              <div className="flex flex-col gap-1.5 col-span-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.privateNotes")}
                </label>
                <textarea
                  rows={3}
                  placeholder={t("hosts.privateNotesPlaceholder")}
                  className="w-full px-3 py-2 text-xs bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring"
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
              <SettingRow
                label={t("hosts.pinToTop")}
                description={t("hosts.pinToTopDesc")}
              >
                <FakeSwitch
                  checked={form.pin}
                  onChange={(v) => setField("pin", v)}
                />
              </SettingRow>
            </div>
          </SectionCard>
        </>
      )}

      {activeTab === "ssh" && (
        <>
          <SectionCard
            title={t("hosts.connectionLabel")}
            icon={<Globe className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.sshPort")}
                </label>
                <Input
                  type="number"
                  placeholder="22"
                  value={form.sshPort}
                  onChange={(e) => setField("sshPort", Number(e.target.value))}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title={t("hosts.authenticationLabel")}
            icon={<Shield className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.username")}
                </label>
                <Input
                  placeholder="e.g. root or deploy"
                  value={form.username}
                  onChange={(e) => setField("username", e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {t("hosts.authMethod")}
                </label>
                <select
                  className="flex h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                  value={form.authType}
                  onChange={(e) =>
                    setField("authType", e.target.value as Host["authType"])
                  }
                >
                  <option value="credential">
                    {t("hosts.authTypeCredential")}
                  </option>
                  <option value="password">
                    {t("hosts.authTypePassword")}
                  </option>
                  <option value="key">{t("hosts.authTypeKey")}</option>
                </select>
              </div>

              {form.authType === "credential" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.credential")}
                  </label>
                  <select
                    className="flex h-8 w-full border border-border bg-background px-2 text-xs outline-none focus:ring-1 focus:ring-ring"
                    value={form.credentialId}
                    onChange={(e) => setField("credentialId", e.target.value)}
                  >
                    <option value="">{t("hosts.none")}</option>
                    {credentials.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.username ? `${c.name} (${c.username})` : c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {form.authType === "password" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.password")}
                  </label>
                  <PasswordInput
                    className="h-8 text-xs pr-8"
                    placeholder="••••••••"
                    value={form.password}
                    onChange={(e) => setField("password", e.target.value)}
                  />
                </div>
              )}

              {form.authType === "key" && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    {t("hosts.sshPrivateKey")}
                  </label>
                  <textarea
                    rows={6}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={form.key}
                    onChange={(e) => setField("key", e.target.value)}
                    className="w-full px-3 py-2 text-[10px] bg-background border border-border text-foreground placeholder:text-muted-foreground resize-none outline-none focus:ring-1 focus:ring-ring font-mono"
                  />
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {activeTab === "terminal" && (
        <SectionCard
          title={t("hosts.tabTerminal")}
          icon={<Terminal className="size-3.5" />}
        >
          <div className="flex flex-col gap-0 py-1">
            <SettingRow label={t("hosts.enableTerminal")}>
              <FakeSwitch
                checked={form.enableTerminal}
                onChange={(v) => setField("enableTerminal", v)}
              />
            </SettingRow>
            <SettingRow label={t("hosts.showConnectionToolbar")}>
              <FakeSwitch
                checked={form.enableTerminalToolbar}
                onChange={(v) => setField("enableTerminalToolbar", v)}
              />
            </SettingRow>
            <SettingRow label={t("hosts.enableCommandHistory")}>
              <FakeSwitch
                checked={form.enableCommandHistory}
                onChange={(v) => setField("enableCommandHistory", v)}
              />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {activeTab === "tunnels" && (
        <SectionCard
          title={t("hosts.tabTunnels")}
          icon={<Globe className="size-3.5" />}
        >
          <div className="flex flex-col gap-0 py-1">
            <SettingRow label={t("hosts.enableTunnel")}>
              <FakeSwitch
                checked={form.enableTunnel}
                onChange={(v) => setField("enableTunnel", v)}
              />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {activeTab === "docker" && (
        <SectionCard
          title={t("hosts.dockerIntegration")}
          icon={<Box className="size-3.5" />}
        >
          <div className="flex flex-col gap-0 py-1">
            <SettingRow label={t("hosts.enableDockerMonitor")}>
              <FakeSwitch
                checked={form.enableDocker}
                onChange={(v) => setField("enableDocker", v)}
              />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {activeTab === "proxmox" && (
        <SectionCard
          title={t("hosts.proxmoxIntegration")}
          icon={<Server className="size-3.5" />}
        >
          <div className="flex flex-col gap-0 py-1">
            <SettingRow label={t("hosts.enableProxmox")}>
              <FakeSwitch
                checked={form.enableProxmox}
                onChange={(v) => setField("enableProxmox", v)}
              />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {activeTab === "files" && (
        <SectionCard
          title={t("hosts.fileManager")}
          icon={<FolderSearch className="size-3.5" />}
        >
          <div className="flex flex-col gap-4 py-3">
            <SettingRow label={t("hosts.enableFileManagerMonitor")}>
              <FakeSwitch
                checked={form.enableFileManager}
                onChange={(v) => setField("enableFileManager", v)}
              />
            </SettingRow>
            <SettingRow label={t("hosts.scpLegacyLabel")}>
              <FakeSwitch
                checked={form.scpLegacy}
                onChange={(v) => setField("scpLegacy", v)}
              />
            </SettingRow>
            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                {t("hosts.defaultPathLabel")}
              </label>
              <Input
                placeholder="/"
                value={form.defaultPath}
                onChange={(e) => setField("defaultPath", e.target.value)}
              />
              <span className="text-[10px] text-muted-foreground">
                {t("hosts.fileManagerPathHint")}
              </span>
            </div>
          </div>
        </SectionCard>
      )}

      {activeTab === "host-metrics" && (
        <SectionCard
          title={t("hosts.tabHostMetrics")}
          icon={<Server className="size-3.5" />}
        >
          <div className="flex flex-col gap-0 py-1">
            <SettingRow label={t("hosts.tabHostMetrics")}>
              <FakeSwitch checked={false} onChange={() => {}} />
            </SettingRow>
          </div>
        </SectionCard>
      )}

      {activeTab === "rdp" && (
        <PortCard
          title={t("hosts.tabRdp")}
          label={t("hosts.port")}
          value={form.rdpPort}
          onChange={(v) => setField("rdpPort", v)}
        />
      )}
      {activeTab === "vnc" && (
        <PortCard
          title={t("hosts.tabVnc")}
          label={t("hosts.port")}
          value={form.vncPort}
          onChange={(v) => setField("vncPort", v)}
        />
      )}
      {activeTab === "telnet" && (
        <PortCard
          title={t("hosts.tabTelnet")}
          label={t("hosts.port")}
          value={form.telnetPort}
          onChange={(v) => setField("telnetPort", v)}
        />
      )}
    </div>
  );
}

function PortCard({
  title,
  label,
  value,
  onChange,
}: {
  title: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <SectionCard title={title} icon={<Monitor className="size-3.5" />}>
      <div className="flex flex-col gap-4 py-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            {label}
          </label>
          <Input
            type="number"
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
        </div>
      </div>
    </SectionCard>
  );
}

export function TagInput({
  tags,
  input,
  placeholder,
  onTagsChange,
  onInputChange,
}: {
  tags: string[];
  input: string;
  placeholder: string;
  onTagsChange: (tags: string[]) => void;
  onInputChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 min-h-9 px-2 py-1 border border-border bg-background focus-within:ring-1 focus-within:ring-ring">
      {tags.map((tag) => (
        <span
          key={tag}
          className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-muted border border-border/60 text-foreground"
        >
          {tag}
          <button
            type="button"
            onClick={() => onTagsChange(tags.filter((tg) => tg !== tag))}
            className="text-muted-foreground hover:text-destructive ml-0.5"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <input
        className="flex-1 min-w-16 text-xs bg-transparent outline-none placeholder:text-muted-foreground/50"
        placeholder={tags.length === 0 ? placeholder : ""}
        value={input}
        onChange={(e) => onInputChange(e.target.value)}
        onKeyDown={(e) => {
          if ((e.key === " " || e.key === "Enter") && input.trim()) {
            e.preventDefault();
            const tag = input.trim();
            if (!tags.includes(tag)) onTagsChange([...tags, tag]);
            onInputChange("");
          } else if (e.key === "Backspace" && !input && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
