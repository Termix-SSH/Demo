import { useState } from "react";
import { Play } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  FieldPair,
  FormFooter,
  PanelShell,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import type { RunBody, RunSummary } from "../shared/types";
import { errorMessage, startRun } from "./api";
import { TargetPicker } from "./TargetPicker";

type Source = "termix" | "project";

/** Options for one playbook run. */
export function RunForm({
  hostId,
  playbook,
  onClose,
  onStarted,
}: {
  hostId: number;
  playbook: string;
  onClose: () => void;
  onStarted: (run: RunSummary) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>("project");
  const [hostIds, setHostIds] = useState<number[]>([]);
  const [inventory, setInventory] = useState("");
  const [limit, setLimit] = useState("");
  const [tags, setTags] = useState("");
  const [skipTags, setSkipTags] = useState("");
  const [extraVars, setExtraVars] = useState("");
  const [check, setCheck] = useState(true);
  const [diff, setDiff] = useState(false);
  const [become, setBecome] = useState(false);
  const [verbosity, setVerbosity] = useState("0");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setSaving(true);
    setError("");
    const body: RunBody = {
      kind: "playbook",
      playbook,
      hostIds: source === "termix" ? hostIds : [],
      inventory: source === "project" ? inventory.trim() : "",
      limit: limit.trim(),
      tags: tags.trim(),
      skipTags: skipTags.trim(),
      extraVars,
      check,
      diff,
      become,
      verbosity: Number(verbosity),
    };
    try {
      onStarted(await startRun(hostId, body));
    } catch (e) {
      setError(errorMessage(e, t("run.startFailed")));
      setSaving(false);
    }
  };

  return (
    <PanelShell
      icon={<Play className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={t("run.title", { playbook })}
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void start()}
          saving={saving}
          saveLabel={check ? t("run.startCheck") : t("run.start")}
          cancelLabel={t("common.cancel")}
          disabled={source === "termix" && hostIds.length === 0}
          status={
            error ? (
              <span className="whitespace-pre-wrap text-destructive">
                {error}
              </span>
            ) : undefined
          }
        />
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <SelectField<Source>
          label={t("run.source")}
          value={source}
          onChange={setSource}
          options={[
            { value: "project", label: t("run.sourceProject") },
            { value: "termix", label: t("run.sourceTermix") },
          ]}
          hint={
            source === "termix"
              ? t("run.sourceTermixHint")
              : t("run.sourceProjectHint")
          }
        />
        {source === "termix" ? (
          <TargetPicker
            hostId={hostId}
            selected={hostIds}
            onChange={setHostIds}
          />
        ) : (
          <TextField
            label={t("run.inventory")}
            hint={t("run.inventoryHint")}
            value={inventory}
            onChange={setInventory}
            placeholder="inventory/hosts.ini"
            mono
          />
        )}
        <SwitchRow
          label={t("run.check")}
          description={t("run.checkHint")}
          checked={check}
          onChange={setCheck}
        />
        <SwitchRow
          label={t("run.diff")}
          description={t("run.diffHint")}
          checked={diff}
          onChange={setDiff}
        />
        <SwitchRow
          label={t("run.become")}
          description={t("run.becomeHint")}
          checked={become}
          onChange={setBecome}
        />
        <FieldPair>
          <TextField
            label={t("run.limit")}
            hint={t("run.limitHint")}
            value={limit}
            onChange={setLimit}
            placeholder="web,!db1"
            mono
          />
          <SelectField
            label={t("run.verbosity")}
            value={verbosity}
            onChange={setVerbosity}
            options={["0", "1", "2", "3", "4"].map((v) => ({
              value: v,
              label:
                v === "0"
                  ? t("run.verbosityOff")
                  : "-".concat("v".repeat(Number(v))),
            }))}
          />
        </FieldPair>
        <FieldPair>
          <TextField
            label={t("run.tags")}
            value={tags}
            onChange={setTags}
            placeholder="setup,web"
            mono
          />
          <TextField
            label={t("run.skipTags")}
            value={skipTags}
            onChange={setSkipTags}
            placeholder="slow"
            mono
          />
        </FieldPair>
        <TextAreaField
          label={t("run.extraVars")}
          hint={t("run.extraVarsHint")}
          value={extraVars}
          onChange={setExtraVars}
          placeholder={"version=1.2.3\nforce=true"}
          rows={3}
          mono
        />
      </div>
    </PanelShell>
  );
}
