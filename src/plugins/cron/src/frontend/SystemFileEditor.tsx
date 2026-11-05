import { useState } from "react";
import { FileCode } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  FormFooter,
  PanelShell,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, saveSystemFile } from "./api";

const NAME_RE = /^[A-Za-z0-9_-]{1,64}$/;
const TEMPLATE =
  "# m h dom mon dow user command\n0 4 * * * root /usr/local/bin/cleanup.sh\n";

/** Creates or edits one file in /etc/cron.d. */
export function SystemFileEditor({
  hostId,
  name: initialName,
  text: initialText,
  onClose,
}: {
  hostId: number;
  name: string;
  text: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const creating = !initialName;
  const [name, setName] = useState(initialName);
  const [text, setText] = useState(initialText || TEMPLATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const validName = NAME_RE.test(name);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveSystemFile(hostId, name, text);
      toast.success(t("system.saved", { name }));
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("system.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      icon={<FileCode className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={creating ? t("system.addTitle") : `/etc/cron.d/${initialName}`}
      scroll={false}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          disabled={!validName || !text.trim()}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        {creating && (
          <div className="border-b border-border px-3 py-2">
            <TextField
              label={t("system.name")}
              hint={t("system.nameHint")}
              value={name}
              onChange={setName}
              error={name && !validName ? t("system.nameInvalid") : undefined}
              placeholder="backup"
              mono
            />
          </div>
        )}
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("system.fileHint")}
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
          aria-label={t("system.content")}
          className="min-h-0 flex-1 resize-none bg-background px-3 py-2 font-mono text-xs outline-none"
        />
      </div>
    </PanelShell>
  );
}
