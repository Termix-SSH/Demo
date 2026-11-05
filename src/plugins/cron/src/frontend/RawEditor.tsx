import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { BackButton, FormFooter, PanelShell } from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, getJobs, saveCrontab } from "./api";
import { Loading } from "./Loading";

/** The whole crontab as text. crontab on the host checks it before saving. */
export function RawEditor({
  hostId,
  user,
  onClose,
}: {
  hostId: number;
  user: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [text, setText] = useState<string | null>(null);
  const [original, setOriginal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJobs(hostId, user)
      .then((tab) => {
        setText(tab.raw);
        setOriginal(tab.raw);
      })
      .catch((e) => setError(errorMessage(e, t("jobs.loadFailed"))));
  }, [hostId, user, t]);

  const save = async () => {
    if (text === null) return;
    setSaving(true);
    setError("");
    try {
      await saveCrontab(hostId, user, text);
      toast.success(t("form.saved"));
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("jobs.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      icon={<FileText className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={t("raw.title")}
      status={user || undefined}
      scroll={false}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saving={saving}
          dirty={text !== original}
          status={
            error ? (
              <span className="text-destructive">{error}</span>
            ) : undefined
          }
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          disabled={text === null || text === original}
        />
      }
    >
      {text === null ? (
        error ? (
          <p className="px-3 py-2 text-xs text-destructive">{error}</p>
        ) : (
          <Loading />
        )
      ) : (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
            {t("raw.hint")}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            aria-label={t("raw.title")}
            className="min-h-0 flex-1 resize-none bg-background px-3 py-2 font-mono text-xs outline-none"
          />
        </div>
      )}
    </PanelShell>
  );
}
