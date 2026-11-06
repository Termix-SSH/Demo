import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  FormFooter,
  PanelShell,
  TextField,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import { deleteFile, errorMessage, getFile, saveFile } from "./api";

/** One project file as text. Playbooks are syntax checked before they save. */
export function FileEditor({
  hostId,
  path,
  canEdit,
  onClose,
}: {
  hostId: number;
  /** Empty for a new file. */
  path: string;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const isNew = path === "";
  const [name, setName] = useState(path);
  const [text, setText] = useState<string | null>(isNew ? "" : null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (isNew) return;
    getFile(hostId, path)
      .then((file) => {
        setText(file.text);
        setOriginal(file.text);
      })
      .catch((e) => setError(errorMessage(e, t("files.loadFailed"))));
  }, [hostId, path, isNew, t]);

  const save = async () => {
    if (text === null) return;
    setSaving(true);
    setError("");
    try {
      await saveFile(hostId, name.trim(), text);
      toast.success(t("files.saved"));
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("files.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    const ok = await confirm({
      title: t("files.deleteTitle"),
      description: path,
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await deleteFile(hostId, path);
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("files.saveFailed")));
    }
  };

  return (
    <PanelShell
      icon={<FileText className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={isNew ? t("files.newTitle") : path}
      scroll={false}
      footer={
        canEdit ? (
          <FormFooter
            onCancel={onClose}
            onSave={() => void save()}
            saving={saving}
            dirty={text !== original || (isNew && name !== "")}
            status={
              error ? (
                <span className="whitespace-pre-wrap text-destructive">
                  {error}
                </span>
              ) : undefined
            }
            saveLabel={t("common.save")}
            cancelLabel={t("common.cancel")}
            disabled={text === null || !name.trim() || text === original}
            onDelete={isNew ? undefined : () => void remove()}
            deleteLabel={t("common.delete")}
          />
        ) : undefined
      }
    >
      {text === null ? (
        error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : (
          <LoadingState />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          {isNew && (
            <div className="border-b border-border p-3">
              <TextField
                label={t("files.name")}
                hint={t("files.nameHint")}
                value={name}
                onChange={setName}
                placeholder="site.yml"
                mono
              />
            </div>
          )}
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {t("files.hint")}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            readOnly={!canEdit}
            spellCheck={false}
            aria-label={t("files.text")}
            className="min-h-0 flex-1 resize-none bg-background px-3 py-2 font-mono text-xs outline-none"
          />
        </div>
      )}
    </PanelShell>
  );
}
