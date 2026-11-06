function settingsOf(host: object | null | undefined) {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.git;
}

export function gitEnabled(host: object | null | undefined): boolean {
  return settingsOf(host)?.enableGit === true;
}

export function panelEnabled(host: object | null | undefined): boolean {
  return gitEnabled(host) && settingsOf(host)?.showPanel !== false;
}
