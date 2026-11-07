import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  TextField,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  TOOLBAR_FIT,
} from "@termix-ssh/plugin-sdk/ui";
import { SHORTCUTS } from "../shared/types";

/** The strip above a screen: shortcuts, paste, snapshot, fullscreen, reconnect. */
export function Toolbar({
  note,
  live,
  onShortcut,
  onPaste,
  onSnapshot,
  fullscreen,
  onFullscreen,
  onReconnect,
  extra,
}: {
  note: string;
  live: boolean;
  onShortcut: (name: string) => void;
  onPaste?: (text: string) => Promise<void>;
  onSnapshot: () => void;
  fullscreen: boolean;
  onFullscreen: () => void;
  onReconnect: () => void;
  extra?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function paste() {
    if (!onPaste || !text) return;
    setBusy(true);
    try {
      await onPaste(text);
      setText("");
      setPasting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-border">
      <div
        className={`flex flex-wrap items-center gap-2 px-3 py-2 ${TOOLBAR_FIT}`}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!live}>
              {t("screen.shortcuts")}
              <ChevronDown className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {Object.keys(SHORTCUTS).map((name) => (
              <DropdownMenuItem key={name} onSelect={() => onShortcut(name)}>
                {t(`screen.shortcut.${name}`)}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onPaste && (
          <Button
            variant="outline"
            disabled={!live}
            onClick={() => setPasting(!pasting)}
          >
            {t("screen.paste")}
          </Button>
        )}
        <Button variant="outline" disabled={!live} onClick={onSnapshot}>
          {t("screen.snapshot")}
        </Button>
        <Button
          variant="outline"
          disabled={!live && !fullscreen}
          onClick={onFullscreen}
        >
          {t(fullscreen ? "screen.exitFullscreen" : "screen.fullscreen")}
        </Button>
        <Button variant="outline" onClick={onReconnect}>
          {t("screen.reconnect")}
        </Button>
        {extra}
        <span className="ml-auto text-xs text-muted-foreground">
          {note || (live ? t("screen.hint") : "")}
        </span>
      </div>
      {pasting && onPaste && (
        <div className="flex items-end gap-2 border-t border-border px-3 py-2">
          <div className="flex-1">
            <TextField
              label={t("screen.pasteLabel")}
              value={text}
              onChange={setText}
              mono
            />
          </div>
          <Button disabled={busy || !text} onClick={() => void paste()}>
            {t("screen.type")}
          </Button>
        </div>
      )}
    </div>
  );
}
