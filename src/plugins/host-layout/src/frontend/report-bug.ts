import { APP_VERSION, reportCoreIssueUrl } from "@termix-ssh/plugin-sdk/ui";
import type { TermixApp } from "@termix-ssh/plugin-sdk/frontend";

type OpenDiagnostics = (options?: { pluginId?: string | null }) => void;

let openDiagnostics: OpenDiagnostics | null = null;

/** Termix 26.11.3 opens a diagnostics report; older ones only have the link. */
export function setReportOpener(app: TermixApp): void {
  const open = (app as TermixApp & { openDiagnostics?: OpenDiagnostics })
    .openDiagnostics;
  openDiagnostics = typeof open === "function" ? open : null;
}

export function canMakeReport(): boolean {
  return openDiagnostics !== null;
}

/** Opens the report page about Termix as a whole, else the GitHub form. */
export function openBugReport(): void {
  if (openDiagnostics) {
    openDiagnostics({ pluginId: null });
    return;
  }
  window.open(reportCoreIssueUrl(APP_VERSION), "_blank", "noopener,noreferrer");
}

/** Opens the diagnostics page. Does nothing on cores without it. */
export function openDiagnosticsPage(): void {
  openDiagnostics?.({ pluginId: null });
}

/** Test seam. */
export function resetReportOpener(): void {
  openDiagnostics = null;
}
