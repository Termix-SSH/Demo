export interface AiAvailability {
  globallyEnabled: boolean;
  userEnabled: boolean;
  loaded: boolean;
}

/** Fired when the AI status may have changed, so every surface re-reads it. */
export const AI_STATUS_CHANGED_EVENT = "aiStatusChanged";

export function notifyAiStatusChanged(): void {
  window.dispatchEvent(new Event(AI_STATUS_CHANGED_EVENT));
}

/** The demo shows the assistant entry so the rail matches the real app. */
export function useAiAvailability(): AiAvailability {
  return { globallyEnabled: true, userEnabled: true, loaded: true };
}
