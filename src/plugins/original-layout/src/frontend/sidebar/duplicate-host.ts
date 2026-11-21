import {
  createSSHHost,
  updatePluginHostSettings,
  type Host,
  type SSHHostData,
} from "@termix-ssh/plugin-sdk/ui";

/**
 * Saves a copy of a host as a new host, with its plugin settings. Saved
 * secrets never reach the browser, so the copy starts without them.
 */
export async function duplicateHost(
  host: Host,
  t: (key: string, options?: Record<string, unknown>) => string,
): Promise<void> {
  const duplicateHost: SSHHostData = {
    name: t("manage.hostCopyName", { name: host.name }),
    ip: host.ip,
    port: host.port,
    username: host.username,
    folder: host.folder,
    parentHostId: host.parentHostId ? Number(host.parentHostId) : null,
    tags: host.tags ?? [],
    pin: host.pin ?? false,
    notes: host.notes,
    // Key material is never sent to the frontend, so a cloned key-auth
    // host would have authType "key" with no key, which is unusable. Reset to
    // password so the clone is in a connectable (editable) state.
    authType: host.authType === "key" ? "password" : host.authType,
    password: host.authType === "key" ? null : (host.password ?? null),
    key: null,
    keyPassword: null,
    keyType: null,
    credentialId: host.credentialId ? Number(host.credentialId) : null,
    overrideCredentialUsername: host.overrideCredentialUsername ?? false,
    enableSsh: host.enableSsh,
    sshPort: host.sshPort,
    // Saved passwords never reach the browser, so a copy starts without them.
    protocolAuth: Object.fromEntries(
      Object.entries(host.protocolAuth ?? {}).map(([protocol, login]) => [
        protocol,
        {
          authType: login.authType,
          credentialId: login.credentialId ?? null,
          username: login.username ?? null,
          fields: login.fields ?? {},
        },
      ]),
    ),
    forceKeyboardInteractive: host.forceKeyboardInteractive ?? false,
    useSocks5: host.useSocks5,
    socks5Host: host.socks5Host ?? null,
    socks5Port: host.socks5Port ?? null,
    socks5Username: host.socks5Username ?? null,
    socks5Password: host.socks5Password ?? null,
    socks5ProxyChain: host.socks5ProxyChain ?? null,
    jumpHosts: (host.jumpHosts ?? []).map((j) => ({
      hostId: Number(j.hostId),
    })),
    portKnockSequence: host.portKnockSequence ?? [],
    statusCheckEnabled: host.statusCheckEnabled,
    statusCheckInterval: host.statusCheckInterval,
    sshOptions: host.sshOptions ?? null,
    ...(host.defaultOverrides
      ? { defaultOverrides: host.defaultOverrides }
      : {}),
  };
  const created = await createSSHHost(duplicateHost);
  // Plugin host settings live outside the host row. Secrets come back
  // redacted, and sending the marker back is a no-op, so they stay unset.
  for (const [pluginId, fields] of Object.entries(host.pluginSettings ?? {})) {
    if (!fields || Object.keys(fields).length === 0) continue;
    await updatePluginHostSettings(pluginId, Number(created.id), fields).catch(
      () => {},
    );
  }
}
