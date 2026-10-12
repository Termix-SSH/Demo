import { useRef, useCallback } from "react";
import { usePluginApi } from "@termix-ssh/plugin-sdk/frontend";
import { saveCommandToHistory } from "../../terminal-api";

const SENSITIVE_PATTERNS = [
  /\bpassw(or)?d\b/i,
  /\bsecret\b/i,
  /\btoken\b/i,
  /\bapi.?key\b/i,
  /\bPASS(WORD)?=/i,
  /\bAWS_SECRET/i,
  /\bmysql\b.*-p/i,
  /\bsudo\s+-S\b/,
  /\bhtpasswd\b/i,
  /\bsshpass\b/i,
  /\bcurl\b.*-u\s/i,
  /\bexport\b.*(?:PASSWORD|SECRET|TOKEN|KEY)=/i,
];

interface UseCommandTrackerOptions {
  hostId?: number;
  enabled?: boolean;
  onCommandExecuted?: (command: string) => void;
  /** Any line submitted, also with history off. Not a typed password. */
  onLineSubmitted?: (line: string) => void;
  /** True while the terminal waits for a password, so it is never kept. */
  isPasswordInput?: () => boolean;
}

interface CommandTrackerResult {
  trackInput: (data: string) => void;
  getCurrentCommand: () => string;
  clearCurrentCommand: () => void;
  updateCurrentCommand: (command: string) => void;
}

export function useCommandTracker({
  hostId,
  enabled = true,
  onCommandExecuted,
  onLineSubmitted,
  isPasswordInput,
}: UseCommandTrackerOptions): CommandTrackerResult {
  const api = usePluginApi();
  const currentCommandRef = useRef<string>("");
  const isInEscapeSequenceRef = useRef<boolean>(false);

  const trackInput = useCallback(
    (data: string) => {
      for (let i = 0; i < data.length; i++) {
        const char = data[i];
        const charCode = char.charCodeAt(0);

        if (charCode === 27) {
          isInEscapeSequenceRef.current = true;
          continue;
        }

        if (isInEscapeSequenceRef.current) {
          if (
            (charCode >= 65 && charCode <= 90) ||
            (charCode >= 97 && charCode <= 122) ||
            charCode === 126
          ) {
            isInEscapeSequenceRef.current = false;
          }
          continue;
        }

        if (charCode === 13 || charCode === 10) {
          const command = currentCommandRef.current.trim();
          currentCommandRef.current = "";
          if (isPasswordInput?.()) continue;
          if (command.length > 0) onLineSubmitted?.(command);

          if (command.length > 0 && enabled && hostId) {
            const isSensitive = SENSITIVE_PATTERNS.some((p) => p.test(command));

            if (!isSensitive) {
              saveCommandToHistory(api, hostId, command).catch((error) => {
                console.error("Failed to save command to history:", error);
              });
            }

            if (onCommandExecuted) {
              onCommandExecuted(command);
            }
          }
          continue;
        }

        if (charCode === 8 || charCode === 127) {
          if (currentCommandRef.current.length > 0) {
            currentCommandRef.current = currentCommandRef.current.slice(0, -1);
          }
          continue;
        }

        if (charCode === 3 || charCode === 4) {
          currentCommandRef.current = "";
          continue;
        }

        if (charCode === 21) {
          currentCommandRef.current = "";
          continue;
        }

        if (charCode >= 32 && charCode <= 126) {
          currentCommandRef.current += char;
        }
      }
    },
    [enabled, hostId, onCommandExecuted, onLineSubmitted, isPasswordInput],
  );

  const getCurrentCommand = useCallback(() => {
    return currentCommandRef.current;
  }, []);

  const clearCurrentCommand = useCallback(() => {
    currentCommandRef.current = "";
  }, []);

  const updateCurrentCommand = useCallback((command: string) => {
    currentCommandRef.current = command;
  }, []);

  return {
    trackInput,
    getCurrentCommand,
    clearCurrentCommand,
    updateCurrentCommand,
  };
}
