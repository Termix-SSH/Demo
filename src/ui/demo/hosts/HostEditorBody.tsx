import { useMemo } from "react";
import {
  Activity,
  Globe,
  KeyRound,
  Monitor,
  MousePointerClick,
  Network,
  Server,
  SquareTerminal,
  Tag,
  Terminal,
} from "lucide-react";
import { SectionCard } from "@/components/section-card";
import { Facts } from "@/components/panel-layout";
import { FolderPathPicker } from "@/sidebar/FolderPathPicker";
import {
  Field,
  FieldPair,
  NumberField,
  Repeater,
  SecretField,
  SelectField,
  SwitchRow,
  TagInput,
  TextAreaField,
  TextField,
  useFileText,
} from "@/demo/hosts/host-fields";
import { Section } from "@/demo/hosts/host-sections";
import {
  PluginHostSection,
  type PluginHostSection as PluginSection,
} from "@/demo/hosts/host-plugin-sections";
import type {
  FieldErrors,
  HostEditorForm,
  ProtocolAuthType,
} from "@/demo/hosts/host-form";
import type { Credential, Host } from "@/types/ui-types";

type SetField = <K extends keyof HostEditorForm>(
  key: K,
  value: HostEditorForm[K],
) => void;

const AUTH_TYPES: { value: Host["authType"]; label: string }[] = [
  { value: "credential", label: "Saved credential" },
  { value: "password", label: "Password" },
  { value: "key", label: "SSH key" },
  { value: "agent", label: "SSH agent" },
  { value: "vault", label: "HashiCorp Vault" },
  { value: "opkssh", label: "OpenPubkey" },
  { value: "tailscale", label: "Tailscale" },
  { value: "none", label: "No authentication" },
];

const KEY_TYPES = [
  "auto",
  "ssh-ed25519",
  "ssh-rsa",
  "ecdsa-sha2-nistp256",
  "ecdsa-sha2-nistp384",
  "ecdsa-sha2-nistp521",
].map((value) => ({ value, label: value === "auto" ? "Detect" : value }));

export function HostEditorBody({
  form,
  setField,
  errors,
  sectionIds,
  hosts,
  credentials,
  editingId,
  pluginSections,
}: {
  form: HostEditorForm;
  setField: SetField;
  errors: FieldErrors;
  sectionIds: Set<string>;
  hosts: Host[];
  credentials: Credential[];
  editingId: string | null;
  pluginSections: PluginSection[];
}) {
  const folderPaths = useMemo(() => {
    const set = new Set<string>();
    for (const h of hosts) {
      if (!h.folder) continue;
      let acc = "";
      for (const part of h.folder.split(" / ")) {
        acc = acc ? `${acc} / ${part}` : part;
        set.add(acc);
      }
    }
    return [...set];
  }, [hosts]);

  const credentialOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...credentials.map((c) => ({
        value: c.id,
        label: c.username ? `${c.name} (${c.username})` : c.name,
      })),
    ],
    [credentials],
  );

  const setPluginValue = (key: string, value: string | number | boolean) =>
    setField("pluginValues", { ...form.pluginValues, [key]: value });

  const keyFile = useFileText((text) => setField("key", text));

  const selectedCredential = credentials.find(
    (c) => c.id === form.credentialId,
  );

  return (
    <>
      {sectionIds.has("identity") && (
        <Section id="identity">
          <SectionCard title="Identity" icon={<Globe className="size-3.5" />}>
            <div className="flex flex-col gap-4 py-3">
              <FieldPair>
                <TextField
                  label="Address"
                  placeholder="10.0.0.1 or example.com"
                  value={form.ip}
                  error={errors.ip}
                  onChange={(v) => setField("ip", v)}
                />
                <TextField
                  label="Display name"
                  placeholder="Web server"
                  hint="Optional. The address is used when this is empty."
                  value={form.name}
                  onChange={(v) => setField("name", v)}
                />
              </FieldPair>

              <div className="flex flex-col gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Protocols
                </span>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <ProtocolCard
                    label="SSH"
                    desc="Terminal, files and tunnels"
                    icon={<Terminal className="size-4" />}
                    on={form.enableSsh}
                    onChange={(v) => setField("enableSsh", v)}
                  />
                  <ProtocolCard
                    label="RDP"
                    desc="Windows remote desktop"
                    icon={<Monitor className="size-4" />}
                    on={form.enableRdp}
                    onChange={(v) => setField("enableRdp", v)}
                  />
                  <ProtocolCard
                    label="VNC"
                    desc="Remote framebuffer"
                    icon={<MousePointerClick className="size-4" />}
                    on={form.enableVnc}
                    onChange={(v) => setField("enableVnc", v)}
                  />
                  <ProtocolCard
                    label="Telnet"
                    desc="Unencrypted shell"
                    icon={<Terminal className="size-4" />}
                    on={form.enableTelnet}
                    onChange={(v) => setField("enableTelnet", v)}
                  />
                </div>
                {errors.protocols && (
                  <span className="text-[10px] text-destructive">
                    {errors.protocols}
                  </span>
                )}
              </div>
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("access") && (
        <Section id="access">
          <SectionCard
            title="Access"
            icon={<KeyRound className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <FieldPair>
                <TextField
                  label="Username"
                  placeholder="root"
                  value={form.username}
                  error={errors.username}
                  disabled={
                    form.authType === "credential" &&
                    !!selectedCredential?.username &&
                    !form.overrideCredentialUsername
                  }
                  hint={
                    form.authType === "credential" &&
                    selectedCredential?.username &&
                    !form.overrideCredentialUsername
                      ? "Taken from the credential."
                      : undefined
                  }
                  onChange={(v) => setField("username", v)}
                />
                <SelectField
                  label="Authentication"
                  value={form.authType}
                  onChange={(v) => setField("authType", v)}
                  options={AUTH_TYPES}
                />
              </FieldPair>

              {form.authType === "credential" && (
                <>
                  <SelectField
                    label="Credential"
                    value={form.credentialId}
                    onChange={(v) => setField("credentialId", v)}
                    options={credentialOptions}
                    hint="Credentials are managed on the Credentials tab."
                  />
                  {selectedCredential?.username && (
                    <SwitchRow
                      label="Use a different username"
                      description={`The credential signs in as ${selectedCredential.username}.`}
                      checked={form.overrideCredentialUsername}
                      onChange={(v) =>
                        setField("overrideCredentialUsername", v)
                      }
                    />
                  )}
                </>
              )}

              {form.authType === "password" && (
                <SecretField
                  label="Password"
                  value={form.password}
                  onChange={(v) => setField("password", v)}
                />
              )}

              {form.authType === "key" && (
                <>
                  <TextAreaField
                    label="Private key"
                    rows={6}
                    mono
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
                    value={form.key === "existing_key" ? "" : form.key}
                    hint={
                      form.key === "existing_key"
                        ? "A key is saved. Paste or upload one to replace it."
                        : undefined
                    }
                    onChange={(v) => setField("key", v)}
                    aside={
                      <label className="cursor-pointer text-[10px] text-accent-brand hover:underline">
                        Upload
                        <input
                          type="file"
                          accept=".pem,.key,.ppk,.txt"
                          className="hidden"
                          onChange={(e) => {
                            void keyFile.onFile(e.target.files?.[0]);
                            e.target.value = "";
                          }}
                        />
                      </label>
                    }
                  />
                  <FieldPair>
                    <SecretField
                      label="Key passphrase"
                      value={form.keyPassword}
                      onChange={(v) => setField("keyPassword", v)}
                    />
                    <SelectField
                      label="Key type"
                      value={form.keyType}
                      onChange={(v) => setField("keyType", v)}
                      options={KEY_TYPES}
                    />
                  </FieldPair>
                </>
              )}

              {form.authType === "agent" && (
                <FieldPair>
                  <TextField
                    label="Agent socket"
                    placeholder="$SSH_AUTH_SOCK"
                    value={form.agentSocketPath}
                    onChange={(v) => setField("agentSocketPath", v)}
                  />
                  <TextField
                    label="Identity"
                    placeholder="Optional key comment"
                    value={form.agentIdentity}
                    onChange={(v) => setField("agentIdentity", v)}
                  />
                </FieldPair>
              )}

              {form.authType === "vault" && (
                <TextField
                  label="Vault profile"
                  placeholder="Profile name"
                  hint="Signing happens at connect time. No secret is stored here."
                  value={form.vaultProfileId}
                  onChange={(v) => setField("vaultProfileId", v)}
                />
              )}

              {form.authType === "none" && (
                <p className="text-[10px] text-muted-foreground">
                  Termix will not send any credentials. The server has to let you
                  in another way.
                </p>
              )}

              <SwitchRow
                label="Ask for a sudo password"
                description="Filled in automatically when a command needs it."
                checked={form.sudoPasswordAutoFill}
                onChange={(v) => setField("sudoPasswordAutoFill", v)}
              />
              {form.sudoPasswordAutoFill && (
                <SecretField
                  label="Sudo password"
                  value={form.sudoPassword}
                  onChange={(v) => setField("sudoPassword", v)}
                />
              )}

              <SwitchRow
                label="Share this login with people you share the host with"
                checked={form.shareSshAuth}
                onChange={(v) => setField("shareSshAuth", v)}
              />
              <SwitchRow
                label="Force keyboard-interactive"
                description="For servers that ask for the password as a prompt."
                checked={form.forceKeyboardInteractive}
                onChange={(v) => setField("forceKeyboardInteractive", v)}
              />
              <SwitchRow
                label="Allow older algorithms"
                badge={form.allowLegacyAlgorithms ? "Insecure" : undefined}
                description="Needed for servers that have not been updated in a while."
                checked={form.allowLegacyAlgorithms}
                onChange={(v) => setField("allowLegacyAlgorithms", v)}
              />
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("organization") && (
        <Section id="organization">
          <SectionCard
            title="Organization"
            icon={<Tag className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <Field
                label={form.organizeBy === "parent" ? "Parent host" : "Folder"}
                hint="A host sits in a folder or under another host, not both."
                aside={
                  <button
                    type="button"
                    className="text-[10px] text-accent-brand hover:underline focus-visible:ring-1 focus-visible:ring-ring"
                    onClick={() =>
                      setField(
                        "organizeBy",
                        form.organizeBy === "parent" ? "folder" : "parent",
                      )
                    }
                  >
                    {form.organizeBy === "parent"
                      ? "Use a folder"
                      : "Nest under a host"}
                  </button>
                }
              >
                {form.organizeBy === "parent" ? (
                  <HostPicker
                    value={form.parentHostId}
                    onChange={(v) => setField("parentHostId", v)}
                    hosts={hosts}
                    excludeId={editingId}
                    emptyLabel="No parent"
                  />
                ) : (
                  <FolderPathPicker
                    value={form.folder}
                    onChange={(path) => setField("folder", path)}
                    folderPaths={folderPaths}
                  />
                )}
              </Field>

              <Field label="Tags">
                <TagInput
                  tags={form.tags}
                  input={form.tagInput}
                  placeholder="Add a tag"
                  onTagsChange={(tags) => setField("tags", tags)}
                  onInputChange={(v) => setField("tagInput", v)}
                />
              </Field>

              <TextAreaField
                label="Notes"
                placeholder="Anything worth remembering about this server."
                value={form.notes}
                onChange={(v) => setField("notes", v)}
              />

              <SwitchRow
                label="Pin to the top of the list"
                checked={form.pin}
                onChange={(v) => setField("pin", v)}
              />
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("terminal-behavior") && (
        <Section id="terminal-behavior">
          <SectionCard
            title="Terminal"
            icon={<SquareTerminal className="size-3.5" />}
          >
            <SwitchRow
              label="Open a terminal for this host"
              checked={form.enableTerminal}
              onChange={(v) => setField("enableTerminal", v)}
            />
            <SwitchRow
              label="Show the connection toolbar"
              checked={form.enableTerminalToolbar}
              onChange={(v) => setField("enableTerminalToolbar", v)}
            />
            <SwitchRow
              label="Keep command history"
              checked={form.enableCommandHistory}
              onChange={(v) => setField("enableCommandHistory", v)}
            />
            <SwitchRow
              label="Forward the SSH agent"
              description="Lets the server use your local keys to reach other servers."
              checked={form.agentForwarding}
              onChange={(v) => setField("agentForwarding", v)}
            />
            <SwitchRow
              label="Start tmux on connect"
              checked={form.autoTmux}
              onChange={(v) => setField("autoTmux", v)}
            />
            <SwitchRow
              label="Connect over mosh"
              description="Survives a dropped network. Needs mosh on the server."
              checked={form.autoMosh}
              onChange={(v) => setField("autoMosh", v)}
            />
            <SwitchRow
              label="Let the server set the tab title"
              checked={form.useSSHTitle}
              onChange={(v) => setField("useSSHTitle", v)}
            />

            <div className="flex flex-col gap-4 py-3">
              <FieldPair>
                <NumberField
                  label="Scrollback lines"
                  value={form.scrollback}
                  onChange={(v) => setField("scrollback", v)}
                />
                <SelectField
                  label="Clicking a link"
                  value={form.linkClickBehavior}
                  onChange={(v) => setField("linkClickBehavior", v)}
                  options={[
                    { value: "default", label: "Use the app default" },
                    { value: "confirm", label: "Ask first" },
                    { value: "direct", label: "Open it" },
                  ]}
                />
              </FieldPair>
              <FieldPair>
                <NumberField
                  label="Keepalive every (seconds)"
                  hint="0 turns keepalives off."
                  value={form.keepaliveInterval}
                  onChange={(v) => setField("keepaliveInterval", v)}
                />
                <NumberField
                  label="Give up after"
                  hint="Missed keepalives before the session is dropped."
                  value={form.keepaliveCountMax}
                  onChange={(v) => setField("keepaliveCountMax", v)}
                />
              </FieldPair>

              <Repeater
                label="Environment variables"
                items={form.environmentVariables}
                onChange={(items) => setField("environmentVariables", items)}
                makeItem={() => ({ key: "", value: "" })}
                empty="None set."
                addLabel="Add"
                hint="Sent when the session starts, if the server accepts them."
                renderItem={(item, update) => (
                  <FieldPair>
                    <TextField
                      label="Name"
                      placeholder="EDITOR"
                      value={item.key}
                      onChange={(v) => update({ ...item, key: v })}
                    />
                    <TextField
                      label="Value"
                      placeholder="vim"
                      value={item.value}
                      onChange={(v) => update({ ...item, value: v })}
                    />
                  </FieldPair>
                )}
              />
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("terminal-appearance") && (
        <Section id="terminal-appearance">
          <SectionCard
            title="Appearance"
            icon={<Terminal className="size-3.5" />}
          >
            <SwitchRow
              label="Use my terminal defaults"
              description="Turn this off to give this host its own look."
              checked={form.inheritTerminalAppearance}
              onChange={(v) => setField("inheritTerminalAppearance", v)}
            />
            {!form.inheritTerminalAppearance && (
              <div className="flex flex-col gap-4 py-3">
                <FieldPair>
                  <SelectField
                    label="Theme"
                    value={form.theme}
                    onChange={(v) => setField("theme", v)}
                    options={[
                      { value: "termix", label: "Termix" },
                      { value: "dracula", label: "Dracula" },
                      { value: "nord", label: "Nord" },
                      { value: "gruvbox", label: "Gruvbox" },
                      { value: "solarized", label: "Solarized" },
                    ]}
                  />
                  <TextField
                    label="Font"
                    value={form.fontFamily}
                    onChange={(v) => setField("fontFamily", v)}
                  />
                </FieldPair>
                <FieldPair>
                  <NumberField
                    label="Font size"
                    value={form.fontSize}
                    onChange={(v) => setField("fontSize", v)}
                  />
                  <SelectField
                    label="Cursor"
                    value={form.cursorStyle}
                    onChange={(v) => setField("cursorStyle", v)}
                    options={[
                      { value: "bar", label: "Bar" },
                      { value: "block", label: "Block" },
                      { value: "underline", label: "Underline" },
                    ]}
                  />
                </FieldPair>
                <FieldPair>
                  <NumberField
                    label="Line height"
                    value={form.lineHeight}
                    onChange={(v) => setField("lineHeight", v)}
                  />
                  <SelectField
                    label="Bell"
                    value={form.bellStyle}
                    onChange={(v) => setField("bellStyle", v)}
                    options={[
                      { value: "none", label: "Nothing" },
                      { value: "sound", label: "Sound" },
                      { value: "visual", label: "Flash" },
                      { value: "both", label: "Sound and flash" },
                    ]}
                  />
                </FieldPair>
                <SwitchRow
                  label="Blink the cursor"
                  checked={form.cursorBlink}
                  onChange={(v) => setField("cursorBlink", v)}
                />
              </div>
            )}
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("session-recording") && (
        <Section id="session-recording">
          <SectionCard
            title="Logging and sharing"
            icon={<Activity className="size-3.5" />}
          >
            <SwitchRow
              label="Record sessions"
              description="Keeps a transcript of what happened on this host."
              checked={form.enableSessionLogging}
              onChange={(v) => setField("enableSessionLogging", v)}
            />
            <SwitchRow
              label="Allow sharing a live session"
              description="Other people can watch or join a session on this host."
              checked={form.allowSessionSharing}
              onChange={(v) => setField("allowSessionSharing", v)}
            />
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("ports") && (
        <Section id="ports">
          <SectionCard title="Ports" icon={<Network className="size-3.5" />}>
            <div className="flex flex-col gap-4 py-3">
              <FieldPair>
                {form.enableSsh && (
                  <NumberField
                    label="SSH port"
                    placeholder="22"
                    value={form.sshPort}
                    error={errors.sshPort}
                    onChange={(v) => setField("sshPort", v)}
                  />
                )}
                {form.enableRdp && (
                  <NumberField
                    label="RDP port"
                    placeholder="3389"
                    value={form.rdpPort}
                    error={errors.rdpPort}
                    onChange={(v) => setField("rdpPort", v)}
                  />
                )}
                {form.enableVnc && (
                  <NumberField
                    label="VNC port"
                    placeholder="5900"
                    value={form.vncPort}
                    error={errors.vncPort}
                    onChange={(v) => setField("vncPort", v)}
                  />
                )}
                {form.enableTelnet && (
                  <NumberField
                    label="Telnet port"
                    placeholder="23"
                    value={form.telnetPort}
                    error={errors.telnetPort}
                    onChange={(v) => setField("telnetPort", v)}
                  />
                )}
              </FieldPair>
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("proxy") && (
        <Section id="proxy">
          <SectionCard
            title="Proxy and jump hosts"
            icon={<Server className="size-3.5" />}
          >
            <SwitchRow
              label="Connect through a SOCKS proxy"
              checked={form.useSocks5}
              onChange={(v) => setField("useSocks5", v)}
            />

            {form.useSocks5 && (
              <div className="flex flex-col gap-4 py-3">
                <SelectField
                  label="Proxy setup"
                  value={form.socks5ProxyMode}
                  onChange={(v) => setField("socks5ProxyMode", v)}
                  options={[
                    { value: "single", label: "One proxy" },
                    { value: "chain", label: "A chain of proxies" },
                  ]}
                />

                {form.socks5ProxyMode === "single" ? (
                  <>
                    <FieldPair>
                      <TextField
                        label="Proxy host"
                        placeholder="127.0.0.1"
                        value={form.socks5Host}
                        onChange={(v) => setField("socks5Host", v)}
                      />
                      <NumberField
                        label="Proxy port"
                        placeholder="1080"
                        value={form.socks5Port}
                        onChange={(v) => setField("socks5Port", v)}
                      />
                    </FieldPair>
                    <FieldPair>
                      <TextField
                        label="Proxy username"
                        placeholder="Optional"
                        value={form.socks5Username}
                        onChange={(v) => setField("socks5Username", v)}
                      />
                      <SecretField
                        label="Proxy password"
                        placeholder="Optional"
                        value={form.socks5Password}
                        onChange={(v) => setField("socks5Password", v)}
                      />
                    </FieldPair>
                  </>
                ) : (
                  <Repeater
                    label="Proxy chain"
                    items={form.socks5ProxyChain}
                    onChange={(items) => setField("socks5ProxyChain", items)}
                    makeItem={() => ({
                      host: "",
                      port: 1080,
                      type: "socks5" as const,
                    })}
                    empty="No proxies in the chain yet."
                    addLabel="Add proxy"
                    hint="Traffic goes through these in order, then to the host."
                    renderItem={(item, update) => (
                      <div className="flex flex-col gap-3">
                        <FieldPair>
                          <TextField
                            label="Host"
                            value={item.host}
                            onChange={(v) => update({ ...item, host: v })}
                          />
                          <NumberField
                            label="Port"
                            value={item.port}
                            onChange={(v) => update({ ...item, port: v })}
                          />
                        </FieldPair>
                        <SelectField
                          label="Type"
                          value={String(item.type)}
                          onChange={(v) =>
                            update({
                              ...item,
                              type: v as typeof item.type,
                            })
                          }
                          options={[
                            { value: "socks5", label: "SOCKS5" },
                            { value: "socks4", label: "SOCKS4" },
                            { value: "http", label: "HTTP" },
                          ]}
                        />
                      </div>
                    )}
                  />
                )}
              </div>
            )}

            <div className="flex flex-col gap-4 py-3">
              <Repeater
                label="Jump hosts"
                items={form.jumpHosts}
                onChange={(items) => setField("jumpHosts", items)}
                makeItem={() => ({ hostId: "" })}
                empty="Connects directly."
                addLabel="Add hop"
                hint="Termix connects through these in order before reaching the host."
                renderItem={(item, update) => (
                  <Field label="Server">
                    <HostPicker
                      value={item.hostId}
                      onChange={(v) => update({ hostId: v })}
                      hosts={hosts}
                      excludeId={editingId}
                      emptyLabel="Pick a server"
                    />
                  </Field>
                )}
              />

              <SelectField
                label="Connect from"
                hint="Which side of a desktop and server pair opens the connection."
                value={form.connectionOrigin}
                onChange={(v) => setField("connectionOrigin", v)}
                options={[
                  { value: "", label: "Use the app default" },
                  { value: "local", label: "This computer" },
                  { value: "remote", label: "The Termix server" },
                ]}
              />
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("reachability") && (
        <Section id="reachability">
          <SectionCard
            title="Reachability"
            icon={<Activity className="size-3.5" />}
          >
            <div className="flex flex-col gap-4 py-3">
              <FieldPair>
                <TextField
                  label="MAC address"
                  placeholder="AA:BB:CC:DD:EE:FF"
                  hint="Needed to wake this machine over the network."
                  value={form.macAddress}
                  onChange={(v) => setField("macAddress", v)}
                />
                {form.macAddress && (
                  <TextField
                    label="Broadcast address"
                    placeholder="192.168.1.255"
                    value={form.wolBroadcastAddress}
                    onChange={(v) => setField("wolBroadcastAddress", v)}
                  />
                )}
              </FieldPair>

              <Repeater
                label="Port knocking"
                items={form.portKnockSequence}
                onChange={(items) => setField("portKnockSequence", items)}
                makeItem={() => ({
                  port: 0,
                  protocol: "tcp" as const,
                  delay: 0,
                })}
                empty="No knock sequence."
                addLabel="Add knock"
                hint="Termix touches these ports in order before connecting."
                renderItem={(item, update) => (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <NumberField
                      label="Port"
                      value={item.port}
                      onChange={(v) => update({ ...item, port: v })}
                    />
                    <SelectField
                      label="Protocol"
                      value={item.protocol}
                      onChange={(v) =>
                        update({ ...item, protocol: v as "tcp" | "udp" })
                      }
                      options={[
                        { value: "tcp", label: "TCP" },
                        { value: "udp", label: "UDP" },
                      ]}
                    />
                    <NumberField
                      label="Wait (ms)"
                      value={item.delay}
                      onChange={(v) => update({ ...item, delay: v })}
                    />
                  </div>
                )}
              />
            </div>
          </SectionCard>
        </Section>
      )}

      {sectionIds.has("rdp") && (
        <Section id="rdp">
          <ProtocolSection
            title="RDP"
            icon={<Monitor className="size-3.5" />}
            authType={form.rdpAuthType}
            onAuthType={(v) => setField("rdpAuthType", v)}
            allowNone
            credentialId={form.rdpCredentialId}
            onCredentialId={(v) => setField("rdpCredentialId", v)}
            user={form.rdpUser}
            onUser={(v) => setField("rdpUser", v)}
            password={form.rdpPassword}
            onPassword={(v) => setField("rdpPassword", v)}
            userPlaceholder="Administrator"
            credentialOptions={credentialOptions}
          >
            <FieldPair>
              <TextField
                label="Domain"
                placeholder="WORKGROUP"
                value={form.domain}
                onChange={(v) => setField("domain", v)}
              />
              <SelectField
                label="Security"
                value={form.security}
                onChange={(v) => setField("security", v)}
                options={[
                  { value: "any", label: "Negotiate" },
                  { value: "nla", label: "Network level auth" },
                  { value: "tls", label: "TLS" },
                  { value: "rdp", label: "Legacy RDP" },
                ]}
              />
            </FieldPair>
            <SwitchRow
              label="Ignore certificate problems"
              checked={form.ignoreCert}
              onChange={(v) => setField("ignoreCert", v)}
            />
            <SwitchRow
              label="Use my remote desktop defaults"
              description="Turn this off to set display and redirection per host."
              checked={form.inheritRemoteDesktopDefaults}
              onChange={(v) => setField("inheritRemoteDesktopDefaults", v)}
            />
          </ProtocolSection>
        </Section>
      )}

      {sectionIds.has("vnc") && (
        <Section id="vnc">
          <ProtocolSection
            title="VNC"
            icon={<MousePointerClick className="size-3.5" />}
            authType={form.vncAuthType}
            onAuthType={(v) =>
              setField("vncAuthType", v as "direct" | "credential")
            }
            credentialId={form.vncCredentialId}
            onCredentialId={(v) => setField("vncCredentialId", v)}
            user={form.vncUser}
            onUser={(v) => setField("vncUser", v)}
            password={form.vncPassword}
            onPassword={(v) => setField("vncPassword", v)}
            credentialOptions={credentialOptions}
          />
        </Section>
      )}

      {sectionIds.has("telnet") && (
        <Section id="telnet">
          <ProtocolSection
            title="Telnet"
            icon={<Terminal className="size-3.5" />}
            authType={form.telnetAuthType}
            onAuthType={(v) =>
              setField("telnetAuthType", v as "direct" | "credential")
            }
            credentialId={form.telnetCredentialId}
            onCredentialId={(v) => setField("telnetCredentialId", v)}
            user={form.telnetUser}
            onUser={(v) => setField("telnetUser", v)}
            password={form.telnetPassword}
            onPassword={(v) => setField("telnetPassword", v)}
            credentialOptions={credentialOptions}
          />
        </Section>
      )}

      {pluginSections.map((section) => (
        <Section key={section.pluginId} id={`plugin:${section.pluginId}`}>
          <PluginHostSection
            section={section}
            values={form.pluginValues}
            setValue={setPluginValue}
          />
        </Section>
      ))}
    </>
  );
}

/** Picks another host: a parent to nest under, or a hop to route through. */
function HostPicker({
  value,
  onChange,
  hosts,
  excludeId,
  emptyLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  hosts: Host[];
  excludeId: string | null;
  emptyLabel: string;
}) {
  return (
    <SelectField
      label=""
      value={value}
      onChange={onChange}
      options={[
        { value: "", label: emptyLabel },
        ...hosts
          .filter((h) => h.id !== excludeId)
          .map((h) => ({ value: h.id, label: h.name || h.ip })),
      ]}
    />
  );
}

function ProtocolCard({
  label,
  desc,
  icon,
  on,
  onChange,
}: {
  label: string;
  desc: string;
  icon: React.ReactNode;
  on: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`flex items-center gap-3 border p-3 text-left transition-colors focus-visible:ring-1 focus-visible:ring-ring ${
        on
          ? "border-accent-brand/40 bg-accent-brand/5"
          : "border-border bg-muted/10 hover:border-border"
      }`}
    >
      <span
        className={
          on ? "text-accent-brand" : "text-muted-foreground/40"
        }
      >
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={`text-xs font-bold ${on ? "text-foreground" : "text-muted-foreground/60"}`}
        >
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{desc}</span>
      </span>
      <span
        aria-hidden
        className={`relative inline-flex h-5 w-9 shrink-0 items-center border-2 transition-colors ${
          on ? "border-accent-brand bg-accent-brand" : "border-border bg-muted"
        }`}
      >
        <span
          className={`inline-block h-3 w-3 bg-background shadow-sm transition-transform ${
            on ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
    </button>
  );
}

/**
 * RDP, VNC and Telnet all authenticate the same three ways, so the shape is
 * shared. The demo previously showed a port field for these and nothing else.
 */
function ProtocolSection({
  title,
  icon,
  authType,
  onAuthType,
  allowNone,
  credentialId,
  onCredentialId,
  user,
  onUser,
  password,
  onPassword,
  userPlaceholder,
  credentialOptions,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  authType: ProtocolAuthType;
  onAuthType: (value: ProtocolAuthType) => void;
  allowNone?: boolean;
  credentialId: string;
  onCredentialId: (value: string) => void;
  user: string;
  onUser: (value: string) => void;
  password: string;
  onPassword: (value: string) => void;
  userPlaceholder?: string;
  credentialOptions: { value: string; label: string }[];
  children?: React.ReactNode;
}) {
  return (
    <SectionCard title={title} icon={icon}>
      <div className="flex flex-col gap-4 py-3">
        <SelectField
          label="Authentication"
          value={authType}
          onChange={onAuthType}
          options={[
            { value: "direct", label: "Username and password" },
            { value: "credential", label: "Saved credential" },
            ...(allowNone
              ? [{ value: "none" as ProtocolAuthType, label: "Ask me each time" }]
              : []),
          ]}
        />

        {authType === "credential" && (
          <SelectField
            label="Credential"
            value={credentialId}
            onChange={onCredentialId}
            options={credentialOptions}
          />
        )}

        {authType === "direct" && (
          <FieldPair>
            <TextField
              label="Username"
              placeholder={userPlaceholder}
              value={user}
              onChange={onUser}
            />
            <SecretField
              label="Password"
              value={password}
              onChange={onPassword}
            />
          </FieldPair>
        )}

        {authType === "none" && (
          <Facts className="text-[10px] text-muted-foreground">
            <span>Termix asks for the login when you connect.</span>
          </Facts>
        )}

        {children}
      </div>
    </SectionCard>
  );
}
