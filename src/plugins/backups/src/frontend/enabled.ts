/** The host allows the backups panel beside its terminals (off until turned on). */
export function backupsPanelEnabled(host: object | null | undefined): boolean {
  const all = (host as { pluginSettings?: unknown } | null | undefined)
    ?.pluginSettings as
    Record<string, Record<string, unknown> | undefined> | undefined;
  return all?.backups?.showPanel === true;
}
