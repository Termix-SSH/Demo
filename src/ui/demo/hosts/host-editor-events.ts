import type { Credential, Host } from "@/types/ui-types";

/**
 * The handoff between "something asked to edit" and the editor itself.
 *
 * The request and the editor arrive in the wrong order: clicking Add Host opens
 * the host-manager tab, and the workbench inside it only mounts afterwards, so
 * listening for the event alone would miss the one that opened the tab. The
 * request is parked here and the workbench claims it on mount.
 */

export type EditorRequest =
  | { kind: "host"; host: Host | null }
  | { kind: "credential"; credential: Credential | null }
  /** Open the workbench on a list, without starting a new record. */
  | { kind: "browse"; mode: "hosts" | "credentials" };

let pending: EditorRequest | null = null;

export function requestHostEditor(host: Host | null): void {
  pending = { kind: "host", host };
  window.dispatchEvent(
    new CustomEvent("host-manager:open-editor", { detail: pending }),
  );
}

export function requestCredentialEditor(credential: Credential | null): void {
  pending = { kind: "credential", credential };
  window.dispatchEvent(
    new CustomEvent("host-manager:open-editor", { detail: pending }),
  );
}

/**
 * Opens the workbench on a list rather than an editor.
 *
 * This is the "I just want to look" route: the rail's promote gesture, which
 * otherwise would always land on hosts even when promoting Credentials.
 */
export function requestBrowse(mode: "hosts" | "credentials"): void {
  pending = { kind: "browse", mode };
  window.dispatchEvent(
    new CustomEvent("host-manager:open-editor", { detail: pending }),
  );
}

/** Reads the parked request and clears it, so it is only ever handled once. */
export function takePendingEditorRequest(): EditorRequest | null {
  const request = pending;
  pending = null;
  return request;
}
