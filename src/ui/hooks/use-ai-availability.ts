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

/** Always available, so the assistant entry shows in the rail. */
export function useAiAvailability(): AiAvailability {
  return { globallyEnabled: true, userEnabled: true, loaded: true };
}
