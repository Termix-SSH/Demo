import { useState } from "react";
import {
  Button,
  FieldPair,
  SelectField,
  SwitchRow,
  TextAreaField,
  TextField,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import type { RunSummary } from "../shared/types";
import { errorMessage, startRun } from "./api";
import { TargetPicker } from "./TargetPicker";

type Source = "termix" | "project";

/** One module on some hosts, like `ansible all -m ping`. */
export function AdhocView({
  hostId,
  onStarted,
}: {
  hostId: number;
  onStarted: (run: RunSummary) => void;
}) {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>("termix");
  const [hostIds, setHostIds] = useState<number[]>([]);
  const [pattern, setPattern] = useState("all");
  const [module, setModule] = useState("ping");
  const [args, setArgs] = useState("");
  const [become, setBecome] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      onStarted(
        await startRun(hostId, {
          kind: "adhoc",
          hostIds: source === "termix" ? hostIds : [],
          pattern: pattern.trim() || "all",
          module: module.trim() || "ping",
          args,
          become,
        }),
      );
    } catch (e) {
      setError(errorMessage(e, t("run.startFailed")));
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs text-muted-foreground">{t("adhoc.hint")}</p>
      <SelectField<Source>
        label={t("run.source")}
        value={source}
        onChange={setSource}
        options={[
          { value: "termix", label: t("run.sourceTermix") },
          { value: "project", label: t("run.sourceProject") },
        ]}
      />
      {source === "termix" && (
        <TargetPicker
          hostId={hostId}
          selected={hostIds}
          onChange={setHostIds}
        />
      )}
      <FieldPair>
        <TextField
          label={t("adhoc.pattern")}
          hint={t("adhoc.patternHint")}
          value={pattern}
          onChange={setPattern}
          placeholder="all"
          mono
        />
        <TextField
          label={t("adhoc.module")}
          hint={t("adhoc.moduleHint")}
          value={module}
          onChange={setModule}
          placeholder="ping"
          mono
        />
      </FieldPair>
      <TextAreaField
        label={t("adhoc.args")}
        hint={t("adhoc.argsHint")}
        value={args}
        onChange={setArgs}
        placeholder="uptime"
        rows={2}
        mono
      />
      <SwitchRow
        label={t("run.become")}
        description={t("run.becomeHint")}
        checked={become}
        onChange={setBecome}
      />
      {error && (
        <p className="whitespace-pre-wrap text-xs text-destructive">{error}</p>
      )}
      <div>
        <Button
          onClick={() => void start()}
          disabled={busy || (source === "termix" && hostIds.length === 0)}
        >
          {t("adhoc.run")}
        </Button>
      </div>
    </div>
  );
}
