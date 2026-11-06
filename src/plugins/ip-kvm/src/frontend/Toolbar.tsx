import { useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, TextField } from "@termix-ssh/plugin-sdk/ui";
import { SHORTCUTS } from "../shared/types";

const select =
  "h-7 border border-border bg-background px-2 text-xs text-foreground";

/** The strip above a screen: shortcuts, paste, snapshot, fullscreen, reconnect. */
export function Toolbar({
  note,
  live,
  onShortcut,
  onPaste,
  onSnapshot,
  onFullscreen,
  onReconnect,
  extra,
}: {
  note: string;
  live: boolean;
  onShortcut: (name: string) => void;
  onPaste?: (text: string) => Promise<void>;
  onSnapshot: () => void;
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
      <div className="flex flex-wrap items-center gap-2 px-3 py-1.5">
        <select
          className={select}
          value=""
          disabled={!live}
          aria-label={t("screen.shortcuts")}
          onChange={(event) => {
            if (event.target.value) onShortcut(event.target.value);
          }}
        >
          <option value="">{t("screen.shortcuts")}</option>
          {Object.keys(SHORTCUTS).map((name) => (
            <option key={name} value={name}>
              {t(`screen.shortcut.${name}`)}
            </option>
          ))}
        </select>
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
        <Button variant="outline" disabled={!live} onClick={onFullscreen}>
          {t("screen.fullscreen")}
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
