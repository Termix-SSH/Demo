import type { Credential, Host } from "@/types/ui-types";

/**
 * The host editor's form state.
 *
 * Covers the full editor minus the ~90 Guacamole display knobs. An earlier
 * version carried only 31 fields, which is why whole areas had nowhere to
 * appear: no sudo password, no proxy, no jump hosts, no per-protocol auth.
 *
 * Two defaults deliberately disagree with the stored schema. enableTunnel and
 * enableFileManager are `true` there but `false` in the form, and the form is
 * what a user actually sees, so that is what gets copied.
 */

export type HostAuthType = Host["authType"];
export type ProtocolAuthType = "direct" | "credential" | "none";
export type Socks5ProxyMode = "single" | "chain";

export type Socks5Node = NonNullable<Host["socks5ProxyChain"]>[number];
export type PortKnock = NonNullable<Host["portKnockSequence"]>[number];
export type ServerTunnel = Host["serverTunnels"][number];
export type EnvVar = { key: string; value: string };
export type JumpHop = { hostId: string };

export interface HostEditorForm {
  // Identity
  name: string;
  ip: string;
  macAddress: string;
  wolBroadcastAddress: string;

  // Organization
  folder: string;
  parentHostId: string;
  /** Folder and parent host are mutually exclusive. */
  organizeBy: "folder" | "parent";
  tags: string[];
  tagInput: string;
  notes: string;
  pin: boolean;

  // Protocols
  enableSsh: boolean;
  enableRdp: boolean;
  enableVnc: boolean;
  enableTelnet: boolean;
  sshPort: number;
  rdpPort: number;
  vncPort: number;
  telnetPort: number;

  // SSH access
  username: string;
  authType: HostAuthType;
  credentialId: string;
  overrideCredentialUsername: boolean;
  vaultProfileId: string;
  password: string;
  key: string;
  keyPassword: string;
  keyType: string;
  shareSshAuth: boolean;
  forceKeyboardInteractive: boolean;
  allowLegacyAlgorithms: boolean;
  sudoPasswordAutoFill: boolean;
  sudoPassword: string;
  agentSocketPath: string;
  agentIdentity: string;

  // Terminal appearance
  inheritTerminalAppearance: boolean;
  theme: string;
  fontFamily: string;
  fontSize: number;
  cursorStyle: "block" | "underline" | "bar";
  cursorBlink: boolean;
  lineHeight: number;
  letterSpacing: number;
  bellStyle: "none" | "sound" | "visual" | "both";

  // Terminal behavior
  enableTerminal: boolean;
  enableTerminalToolbar: boolean;
  enableCommandHistory: boolean;
  enableSessionLogging: boolean;
  allowSessionSharing: boolean;
  agentForwarding: boolean;
  useSSHTitle: boolean;
  autoMosh: boolean;
  autoTmux: boolean;
  scrollback: number;
  keepaliveInterval: number;
  keepaliveCountMax: number;
  linkClickBehavior: "default" | "confirm" | "direct";
  localEcho: "default" | "off" | "auto" | "on";
  environmentVariables: EnvVar[];

  // Network
  useSocks5: boolean;
  socks5ProxyMode: Socks5ProxyMode;
  socks5Host: string;
  socks5Port: number;
  socks5Username: string;
  socks5Password: string;
  socks5ProxyChain: Socks5Node[];
  jumpHosts: JumpHop[];
  portKnockSequence: PortKnock[];
  connectionOrigin: "" | "local" | "remote";

  // RDP
  rdpAuthType: ProtocolAuthType;
  rdpCredentialId: string;
  rdpUser: string;
  rdpPassword: string;
  domain: string;
  security: string;
  ignoreCert: boolean;
  inheritRemoteDesktopDefaults: boolean;

  // VNC
  vncAuthType: Exclude<ProtocolAuthType, "none">;
  vncCredentialId: string;
  vncUser: string;
  vncPassword: string;

  // Telnet
  telnetAuthType: Exclude<ProtocolAuthType, "none">;
  telnetCredentialId: string;
  telnetUser: string;
  telnetPassword: string;

  // Plugin-owned host flags and settings. Keyed by field key so a plugin can
  // add one without a matching property on this type.
  pluginValues: Record<string, string | number | boolean>;

  // Tunnels
  enableTunnel: boolean;
  serverTunnels: ServerTunnel[];
}

/** Secrets never leave the server, so an existing one loads as a sentinel. */
function secret(has: boolean | undefined, sentinel: string, plain?: string) {
  if (has) return sentinel;
  return plain ?? "";
}

export function createHostEditorForm(host: Host | null): HostEditorForm {
  const terminal = host?.terminalConfig ?? {};

  return {
    name: host?.name ?? "",
    ip: host?.ip ?? "",
    macAddress: host?.macAddress ?? "",
    wolBroadcastAddress: host?.wolBroadcastAddress ?? "",

    folder: host?.folder ?? "",
    parentHostId: host?.parentHostId ? String(host.parentHostId) : "",
    organizeBy: host?.parentHostId ? "parent" : "folder",
    tags: host?.tags ?? [],
    tagInput: "",
    notes: host?.notes ?? "",
    pin: host?.pin ?? false,

    enableSsh: host?.enableSsh ?? true,
    enableRdp: host?.enableRdp ?? false,
    enableVnc: host?.enableVnc ?? false,
    enableTelnet: host?.enableTelnet ?? false,
    sshPort: host?.sshPort ?? host?.port ?? 22,
    rdpPort: host?.rdpPort ?? 3389,
    vncPort: host?.vncPort ?? 5900,
    telnetPort: host?.telnetPort ?? 23,

    username: host?.username ?? (host ? "" : "root"),
    authType: host?.authType ?? "credential",
    credentialId: host?.credentialId != null ? String(host.credentialId) : "",
    overrideCredentialUsername: host?.overrideCredentialUsername ?? false,
    vaultProfileId: host?.vaultProfileId ?? "",
    password: secret(host?.hasPassword, "existing_password", host?.password),
    key: secret(host?.hasKey, "existing_key", host?.key),
    keyPassword: secret(
      host?.hasKeyPassword,
      "existing_key_password",
      host?.keyPassword,
    ),
    keyType: host?.keyType ?? "auto",
    shareSshAuth: host?.shareSshAuth ?? false,
    forceKeyboardInteractive: host?.forceKeyboardInteractive ?? false,
    allowLegacyAlgorithms: terminal.allowLegacyAlgorithms ?? true,
    sudoPasswordAutoFill: terminal.sudoPasswordAutoFill ?? false,
    sudoPassword: secret(
      host?.hasSudoPassword,
      "existing_sudo_password",
      terminal.sudoPassword,
    ),
    agentSocketPath: terminal.agentSocketPath ?? "",
    agentIdentity: terminal.agentIdentity ?? "",

    inheritTerminalAppearance: !host || !host.terminalConfig?.theme,
    theme: terminal.theme ?? "termix",
    fontFamily: terminal.fontFamily ?? "Caskaydia Cove Nerd Font Mono",
    fontSize: terminal.fontSize ?? 14,
    cursorStyle: terminal.cursorStyle ?? "bar",
    cursorBlink: terminal.cursorBlink ?? true,
    lineHeight: terminal.lineHeight ?? 1,
    letterSpacing: terminal.letterSpacing ?? 0,
    bellStyle: terminal.bellStyle ?? "none",

    enableTerminal: host?.enableTerminal ?? true,
    enableTerminalToolbar: host?.enableTerminalToolbar ?? true,
    enableCommandHistory: host?.enableCommandHistory ?? true,
    enableSessionLogging: host?.enableSessionLogging ?? true,
    allowSessionSharing: host?.allowSessionSharing ?? true,
    agentForwarding: terminal.agentForwarding ?? false,
    useSSHTitle: terminal.useSSHTitle ?? false,
    autoMosh: terminal.autoMosh ?? false,
    autoTmux: terminal.autoTmux ?? false,
    scrollback: terminal.scrollback ?? 10000,
    keepaliveInterval: terminal.keepaliveInterval ?? 60,
    keepaliveCountMax: terminal.keepaliveCountMax ?? 5,
    linkClickBehavior: terminal.linkClickBehavior ?? "default",
    localEcho: terminal.localEcho ?? "default",
    environmentVariables: terminal.environmentVariables ?? [],

    useSocks5: host?.useSocks5 ?? false,
    socks5ProxyMode:
      (host?.socks5ProxyChain ?? []).length > 0 ? "chain" : "single",
    socks5Host: host?.socks5Host ?? "",
    socks5Port: host?.socks5Port ?? 1080,
    socks5Username: host?.socks5Username ?? "",
    socks5Password: host?.socks5Password ?? "",
    socks5ProxyChain: host?.socks5ProxyChain ?? [],
    jumpHosts: (host?.jumpHosts ?? []).map((j) => ({ hostId: j.hostId })),
    portKnockSequence: host?.portKnockSequence ?? [],
    connectionOrigin: host?.connectionOrigin ?? "",

    rdpAuthType:
      host?.rdpAuthType ?? (host?.rdpCredentialId ? "credential" : "direct"),
    rdpCredentialId: host?.rdpCredentialId ?? "",
    rdpUser: host?.rdpUser ?? "",
    rdpPassword: secret(
      host?.hasRdpPassword,
      "existing_rdp_password",
      host?.rdpPassword,
    ),
    domain: host?.domain ?? "",
    security: host?.security ?? "any",
    ignoreCert: host?.ignoreCert ?? false,
    inheritRemoteDesktopDefaults: !host || !host.guacamoleConfig,

    vncAuthType:
      host?.vncAuthType ?? (host?.vncCredentialId ? "credential" : "direct"),
    vncCredentialId: host?.vncCredentialId ?? "",
    vncUser: host?.vncUser ?? "",
    vncPassword: secret(
      host?.hasVncPassword,
      "existing_vnc_password",
      host?.vncPassword,
    ),

    telnetAuthType:
      host?.telnetAuthType ??
      (host?.telnetCredentialId ? "credential" : "direct"),
    telnetCredentialId: host?.telnetCredentialId ?? "",
    telnetUser: host?.telnetUser ?? "",
    telnetPassword: secret(
      host?.hasTelnetPassword,
      "existing_telnet_password",
      host?.telnetPassword,
    ),

    pluginValues: readPluginValues(host),

    enableTunnel: host?.enableTunnel ?? false,
    serverTunnels: host?.serverTunnels ?? [],
  };
}

/**
 * Plugin-owned values live on the host under their own keys. A plugin declares
 * which ones it owns, so this reads them generically rather than naming each.
 */
function readPluginValues(
  host: Host | null,
): Record<string, string | number | boolean> {
  if (!host) return {};
  const source = host as unknown as Record<string, unknown>;
  const values: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(source)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      values[key] = value;
    }
  }
  if (host.dockerConfig?.runtime)
    values.dockerRuntime = host.dockerConfig.runtime;
  return values;
}

/** A sentinel means "leave the stored secret alone", so it is not sent. */
function sentToServer(value: string, sentinel: string): string | undefined {
  return value === sentinel ? undefined : value || undefined;
}

/**
 * Turns the form back into a Host patch.
 *
 * The old saveHost collected password and key but never wrote them into the
 * update object, so typing a password did nothing.
 */
export function buildHostPatch(form: HostEditorForm): Partial<Host> {
  const usingParent = form.organizeBy === "parent";

  return {
    name: form.name.trim(),
    ip: form.ip.trim(),
    macAddress: form.macAddress.trim() || undefined,
    wolBroadcastAddress: form.wolBroadcastAddress.trim() || undefined,

    folder: usingParent ? "" : form.folder,
    parentHostId: usingParent ? form.parentHostId || null : null,
    tags: form.tags,
    notes: form.notes,
    pin: form.pin,

    enableSsh: form.enableSsh,
    enableRdp: form.enableRdp,
    enableVnc: form.enableVnc,
    enableTelnet: form.enableTelnet,
    sshPort: form.sshPort,
    port: form.sshPort,
    rdpPort: form.rdpPort,
    vncPort: form.vncPort,
    telnetPort: form.telnetPort,

    username: form.username.trim(),
    authType: form.authType,
    credentialId: form.credentialId || undefined,
    overrideCredentialUsername: form.overrideCredentialUsername,
    vaultProfileId: form.vaultProfileId || undefined,
    password: sentToServer(form.password, "existing_password"),
    key: sentToServer(form.key, "existing_key"),
    keyPassword: sentToServer(form.keyPassword, "existing_key_password"),
    keyType: form.keyType === "auto" ? undefined : form.keyType,
    shareSshAuth: form.shareSshAuth,
    forceKeyboardInteractive: form.forceKeyboardInteractive,

    enableTerminal: form.enableTerminal,
    enableTerminalToolbar: form.enableTerminalToolbar,
    enableCommandHistory: form.enableCommandHistory,
    enableSessionLogging: form.enableSessionLogging,
    allowSessionSharing: form.allowSessionSharing,

    terminalConfig: {
      ...(form.inheritTerminalAppearance
        ? {}
        : {
            theme: form.theme,
            fontFamily: form.fontFamily,
            fontSize: form.fontSize,
            cursorStyle: form.cursorStyle,
            cursorBlink: form.cursorBlink,
            lineHeight: form.lineHeight,
            letterSpacing: form.letterSpacing,
            bellStyle: form.bellStyle,
          }),
      allowLegacyAlgorithms: form.allowLegacyAlgorithms,
      sudoPasswordAutoFill: form.sudoPasswordAutoFill,
      sudoPassword: sentToServer(form.sudoPassword, "existing_sudo_password"),
      agentForwarding: form.agentForwarding,
      useSSHTitle: form.useSSHTitle,
      autoMosh: form.autoMosh,
      autoTmux: form.autoTmux,
      scrollback: form.scrollback,
      keepaliveInterval: form.keepaliveInterval,
      keepaliveCountMax: form.keepaliveCountMax,
      // "default" means the app decides, which the stored config expresses by
      // leaving the field off rather than by a third value.
      ...(form.linkClickBehavior === "default"
        ? {}
        : { linkClickBehavior: form.linkClickBehavior }),
      localEcho: form.localEcho,
      environmentVariables: form.environmentVariables,
      ...(form.authType === "agent"
        ? {
            agentSocketPath: form.agentSocketPath,
            agentIdentity: form.agentIdentity,
          }
        : {}),
    },

    useSocks5: form.useSocks5,
    socks5Host: form.socks5Host || undefined,
    socks5Port: form.socks5Port,
    socks5Username: form.socks5Username || undefined,
    socks5Password: form.socks5Password || undefined,
    socks5ProxyChain:
      form.socks5ProxyMode === "chain" ? form.socks5ProxyChain : [],
    jumpHosts: form.jumpHosts.filter((j) => j.hostId),
    portKnockSequence: form.portKnockSequence,
    connectionOrigin: form.connectionOrigin || null,

    rdpAuthType: form.rdpAuthType,
    rdpCredentialId: form.rdpCredentialId || undefined,
    rdpUser: form.rdpUser || undefined,
    rdpPassword: sentToServer(form.rdpPassword, "existing_rdp_password"),
    domain: form.domain || undefined,
    security: form.security || undefined,
    ignoreCert: form.ignoreCert,

    vncAuthType: form.vncAuthType,
    vncCredentialId: form.vncCredentialId || undefined,
    vncUser: form.vncUser || undefined,
    vncPassword: sentToServer(form.vncPassword, "existing_vnc_password"),

    telnetAuthType: form.telnetAuthType,
    telnetCredentialId: form.telnetCredentialId || undefined,
    telnetUser: form.telnetUser || undefined,
    telnetPassword: sentToServer(
      form.telnetPassword,
      "existing_telnet_password",
    ),

    enableTunnel: form.enableTunnel,
    serverTunnels: form.serverTunnels,

    ...pluginPatch(form.pluginValues),
  };
}

/** Plugin values map straight onto the host, plus the one nested case. */
function pluginPatch(
  values: Record<string, string | number | boolean>,
): Partial<Host> {
  const { dockerRuntime, ...rest } = values;
  const patch = { ...rest } as Partial<Host>;
  if (dockerRuntime) {
    patch.dockerConfig = { runtime: dockerRuntime as "docker" | "podman" };
  }
  return patch;
}

/** Everything a new host needs beyond the form, so no `as Host` cast is needed. */
export function newHostFromForm(form: HostEditorForm): Host {
  const patch = buildHostPatch(form);
  return {
    id: `h-${Date.now().toString(36)}`,
    name: patch.name || form.ip.trim(),
    username: patch.username ?? "",
    ip: patch.ip ?? "",
    port: form.sshPort,
    folder: patch.folder ?? "",
    online: true,
    status: "online",
    cpu: null,
    ram: null,
    lastAccess: new Date().toISOString(),
    parentHostId: patch.parentHostId ?? null,
    authType: form.authType,
    enableTerminal: form.enableTerminal,
    enableCommandHistory: form.enableCommandHistory,
    enableTunnel: form.enableTunnel,
    serverTunnels: form.serverTunnels,
    enableFileManager: Boolean(form.pluginValues.enableFileManager),
    enableDocker: Boolean(form.pluginValues.enableDocker),
    enableProxmox: Boolean(form.pluginValues.enableProxmox),
    enableProxmoxStats: Boolean(form.pluginValues.enableProxmoxStats),
    enableTmuxMonitor: Boolean(form.pluginValues.enableTmuxMonitor),
    enableTerminalToolbar: form.enableTerminalToolbar,
    enableSsh: form.enableSsh,
    enableRdp: form.enableRdp,
    enableVnc: form.enableVnc,
    enableTelnet: form.enableTelnet,
    sshPort: form.sshPort,
    rdpPort: form.rdpPort,
    vncPort: form.vncPort,
    telnetPort: form.telnetPort,
    quickActions: [],
    ...patch,
  };
}

/* ---------------------------------------------------------------- credentials */

export interface CredentialEditorForm {
  name: string;
  username: string;
  folder: string;
  description: string;
  tags: string[];
  tagInput: string;
  authType: "password" | "key";
  password: string;
  value: string;
  publicKey: string;
  passphrase: string;
  keyType: string;
  certPublicKey: string;
  pin: boolean;
}

export function createCredentialEditorForm(
  credential: Credential | null,
): CredentialEditorForm {
  return {
    name: credential?.name ?? "",
    username: credential?.username ?? "",
    folder: credential?.folder ?? "",
    description: credential?.description ?? "",
    tags: credential?.tags ?? [],
    tagInput: "",
    authType: credential?.type ?? "password",
    password:
      credential?.type === "password"
        ? (credential?.value ?? credential?.password ?? "")
        : (credential?.password ?? ""),
    value: credential?.type === "key" ? (credential?.value ?? "") : "",
    publicKey: credential?.publicKey ?? "",
    passphrase: credential?.passphrase ?? "",
    keyType: "auto",
    certPublicKey: credential?.certPublicKey ?? "",
    pin: credential?.pin ?? false,
  };
}

export function buildCredentialPatch(
  form: CredentialEditorForm,
): Partial<Credential> {
  const isKey = form.authType === "key";
  return {
    name: form.name.trim(),
    username: form.username.trim(),
    type: form.authType,
    value: isKey ? form.value : form.password,
    password: isKey ? form.password || undefined : undefined,
    publicKey: isKey ? form.publicKey || undefined : undefined,
    passphrase: isKey ? form.passphrase || undefined : undefined,
    certPublicKey: isKey ? form.certPublicKey || undefined : undefined,
    description: form.description.trim() || undefined,
    folder: form.folder || undefined,
    tags: form.tags,
    pin: form.pin,
  };
}

export function newCredentialFromForm(form: CredentialEditorForm): Credential {
  return {
    id: `c-${Date.now().toString(36)}`,
    name: form.name.trim(),
    username: form.username.trim(),
    type: form.authType,
    ...buildCredentialPatch(form),
  } as Credential;
}

/* ---------------------------------------------------------------- validation */

export interface FieldErrors {
  [key: string]: string | undefined;
}

/** Enough to stop a host that cannot connect, and no more. */
export function validateHostForm(form: HostEditorForm): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.ip.trim()) errors.ip = "An address is required.";
  if (form.enableSsh && !form.username.trim())
    errors.username = "A username is required.";
  if (
    !form.enableSsh &&
    !form.enableRdp &&
    !form.enableVnc &&
    !form.enableTelnet
  )
    errors.protocols = "Turn on at least one protocol.";

  const ports: [keyof HostEditorForm, boolean][] = [
    ["sshPort", form.enableSsh],
    ["rdpPort", form.enableRdp],
    ["vncPort", form.enableVnc],
    ["telnetPort", form.enableTelnet],
  ];
  for (const [key, active] of ports) {
    if (!active) continue;
    const port = form[key] as number;
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      errors[key] = "Use a port between 1 and 65535.";
  }
  return errors;
}

export function validateCredentialForm(
  form: CredentialEditorForm,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.name.trim()) errors.name = "A name is required.";
  if (form.authType === "key" && !form.value.trim())
    errors.value = "Paste or upload a private key.";
  if (form.authType === "password" && !form.password)
    errors.password = "A password is required.";
  return errors;
}
