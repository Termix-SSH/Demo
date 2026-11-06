function settingsOf(host: object | null | undefined) {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.["web-servers"];
}

export function webServersEnabled(host: object | null | undefined): boolean {
  return settingsOf(host)?.enableWebServers === true;
}

export function panelEnabled(host: object | null | undefined): boolean {
  return webServersEnabled(host) && settingsOf(host)?.showPanel !== false;
}

/** Same rule core uses: admin, owner, or an edit or manage share. */
export function canEditHost(
  host: object | null | undefined,
  isAdmin: boolean,
): boolean {
  const shared = (host ?? {}) as {
    isShared?: boolean;
    permissionLevel?: string;
  };
  return (
    isAdmin ||
    !shared.isShared ||
    shared.permissionLevel === "edit" ||
    shared.permissionLevel === "manage"
  );
}
