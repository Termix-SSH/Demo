import { useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  FormFooter,
  LoadingState,
  Textarea,
  useConfirm,
  PanelShell,
} from "@termix-ssh/plugin-sdk/ui";
import { errorMessage, getXml, putXml } from "./api";
import { useAction } from "./useAction";

/** The VM's config as XML. The host checks it before it saves. */
export function VmXml({
  hostId,
  uuid,
  onChanged,
}: {
  hostId: number;
  uuid: string;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const action = useAction(onChanged);
  const [saved, setSaved] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState("");

  useEffect(() => {
    getXml(hostId, uuid)
      .then((xml) => {
        setSaved(xml);
        setText(xml);
      })
      .catch((e) => setFailed(errorMessage(e, t("tab.error"))));
  }, [hostId, uuid, t]);

  if (failed) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (saved === null) return <LoadingState label={t("common.loading")} />;

  return (
    <PanelShell
      chrome={false}
      footer={
        <FormFooter
          saving={action.busy}
          dirty={text !== saved}
          saveLabel={t("common.save")}
          onSave={async () => {
            const ok = await confirm({
              title: t("xml.saveTitle"),
              description: t("xml.saveText"),
              confirmLabel: t("common.save"),
              destructive: false,
            });
            if (!ok) return;
            const done = await action.run(
              () => putXml(hostId, uuid, text),
              t("xml.saved"),
            );
            if (done) setSaved(text);
          }}
        />
      }
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
          {t("xml.hint")}
        </p>
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          spellCheck={false}
          className="min-h-0 flex-1 resize-none rounded-none border-0 bg-background px-3 py-2 font-mono text-xs shadow-none focus-visible:ring-0 dark:bg-background"
        />
      </div>
    </PanelShell>
  );
}
