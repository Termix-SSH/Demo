import { useCallback, useEffect, useState } from "react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  TextAreaField,
  LoadingState,
  PanelShell,
} from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, getConfig, saveConfig } from "./api";

export function ConfigView({ hostId, name }: { hostId: number; name: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const next = (await getConfig(hostId, name)).text;
      setSaved(next);
      setText(next);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("config.loadFailed")));
    }
  }, [hostId, name, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (saved === null) return <LoadingState />;

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveConfig(hostId, name, text);
      toast.success(t("config.saved"));
      await load();
    } catch (e) {
      setError(errorMessage(e, t("config.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  return (
    <PanelShell
      chrome={false}
      footer={
        <FormFooter
          onSave={() => void save()}
          saving={saving}
          dirty={text !== saved}
          saveLabel={t("common.save")}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
        <TextAreaField
          label={t("config.title")}
          hint={t("config.hint")}
          value={text}
          onChange={setText}
          fill
          mono
        />
        {error && (
          <pre className="whitespace-pre-wrap border border-border p-2 font-mono text-xs text-destructive">
            {error}
          </pre>
        )}
      </div>
    </PanelShell>
  );
}
