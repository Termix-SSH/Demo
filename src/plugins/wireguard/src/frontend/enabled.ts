export function wireguardEnabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.wireguard?.enableWireguard === true;
}
