import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Button, SwitchRow, TextAreaField } from "@termix-ssh/plugin-sdk/ui";
import type { DiffEntry } from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { DiffList } from "./DiffList";

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function FilesPanel({
  api,
  accountId,
  zoneId,
  canEdit,
  onChanged,
}: {
  api: DnsApi;
  accountId: number;
  zoneId: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState<{
    diff: DiffEntry[];
    skipped: string[];
  } | null>(null);
  const [busy, setBusy] = useState(false);

  async function exportFile() {
    try {
      const file = await api.exportZone(accountId, zoneId);
      download(`${file.name}.zone`, file.text);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function run(apply: boolean) {
    setBusy(true);
    try {
      const result = await api.importZone(accountId, zoneId, {
        text,
        apply,
        replace,
      });
      setPreview({ diff: result.diff, skipped: result.skipped });
      if (result.applied) {
        toast.success(t("files.applied", { count: result.diff.length }));
        onChanged();
      }
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setText(await file.text());
    setPreview(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <p className="text-xs text-muted-foreground">{t("files.exportHint")}</p>
        <Button size="sm" variant="outline" onClick={() => void exportFile()}>
          <Download className="size-3.5" />
          {t("files.export")}
        </Button>
      </div>
      {canEdit && (
        <div className="space-y-2 border-b border-border p-3">
          <TextAreaField
            label={t("files.import")}
            value={text}
            onChange={(value) => {
              setText(value);
              setPreview(null);
            }}
            placeholder={t("files.placeholder")}
            rows={8}
            mono
          />
          <input
            type="file"
            accept=".zone,.txt,text/plain"
            className="text-xs"
            onChange={(event) => void pick(event.target.files?.[0])}
          />
          <SwitchRow
            label={t("files.replace")}
            description={t("files.replaceHint")}
            checked={replace}
            onChange={(value) => {
              setReplace(value);
              setPreview(null);
            }}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !text.trim()}
              onClick={() => void run(false)}
            >
              {t("files.preview")}
            </Button>
            <Button
              size="sm"
              disabled={busy || !preview || preview.diff.length === 0}
              onClick={() => void run(true)}
            >
              <Upload className="size-3.5" />
              {t("files.apply")}
            </Button>
          </div>
        </div>
      )}
      {preview && (
        <>
          <DiffList diff={preview.diff} />
          {preview.skipped.length > 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium">{t("files.skipped")}</p>
              <ul className="font-mono">
                {preview.skipped.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
