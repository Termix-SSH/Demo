import { useCallback } from "react";
import {
  useSettings,
  useTranslation,
  type CompanionDefaults,
  type CompanionProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import { NotesView } from "./NotesView";
import { useSendToTerminal } from "./NotesTab";

/** Starting state of the panel, from the user's settings. */
export function useNotesCompanionDefaults(): CompanionDefaults {
  const { values } = useSettings("user");
  const side = values.companionSide;
  return {
    open: values.companionAutoOpen === true,
    side: side === "left" || side === "bottom" ? side : "right",
    size: typeof values.companionSize === "number" ? values.companionSize : 420,
    edgeButton: values.companionEdgeButton !== false,
  };
}

/** The host's notes beside its terminal. Code goes to this terminal. */
export function NotesCompanion({ host, isVisible, getHandle }: CompanionProps) {
  const { t } = useTranslation();
  const fallback = useSendToTerminal();
  const send = useCallback(
    (text: string) => {
      const handle = getHandle();
      if (handle?.paste) {
        handle.paste(text);
        toast.success(t("code.sent"));
        return;
      }
      fallback(text);
    },
    [getHandle, fallback, t],
  );
  return <NotesView host={host} isVisible={isVisible} compact onSend={send} />;
}
