import { useCallback } from "react";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import {
  invokeAction,
  useTranslation,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { PanelFrame, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { NotesView } from "./NotesView";

/** Pastes text into the terminal the user last used, without running it. */
export function useSendToTerminal(): (text: string) => void {
  const { t } = useTranslation();
  return useCallback(
    (text: string) => {
      void invokeAction("terminal.sendToActive", text, { run: false })
        .catch(() => false)
        .then((sent) => {
          if (sent === true) toast.success(t("code.sent"));
          else toast.error(t("code.noTerminal"));
        });
    },
    [t],
  );
}

/** The full tab for writing notes. */
export function NotesTab({ isVisible, host, label }: TabProps) {
  const { t } = useTranslation();
  const send = useSendToTerminal();
  return (
    <PanelFrame>
      <PanelShell
        icon={<NotebookPen className="size-4" />}
        title={label || host?.name || t("tab.title")}
        scroll={false}
      >
        <NotesView
          host={host}
          isVisible={isVisible}
          compact={false}
          onSend={send}
        />
      </PanelShell>
    </PanelFrame>
  );
}
