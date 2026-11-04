import { useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Field, Input } from "@termix-ssh/plugin-sdk/ui";
import { getResources, type CatalogAction } from "./api";
import { Choice } from "./parts";

export interface ResourceChoice {
  key: string;
  name: string;
}

/** What a resource action can act on, read from the resource's own list. */
export function useResourceChoices(
  action: CatalogAction | undefined,
  hostId: number | undefined,
): ResourceChoice[] {
  const [choices, setChoices] = useState<ResourceChoice[]>([]);
  useEffect(() => {
    setChoices([]);
    if (!action?.resource || hostId === undefined) return;
    let stop = false;
    const load = async (attempt: number) => {
      try {
        const result = await getResources(action.resource!, {
          hostIds: [hostId],
        });
        if (stop) return;
        const state = result.hosts[0]?.state;
        if (state === "loading" && attempt < 10) {
          setTimeout(() => void load(attempt + 1), 1500);
          return;
        }
        setChoices(
          result.rows.map((row) => ({
            key: row.key,
            name: String(row.row.name ?? row.key),
          })),
        );
      } catch {
        // The picker stays empty and a key can still be typed.
      }
    };
    void load(0);
    return () => {
      stop = true;
    };
  }, [action, hostId]);
  return choices;
}

/** The item on the host a resource action acts on. */
export function TargetField({
  choices,
  value,
  onChange,
}: {
  choices: ResourceChoice[];
  value: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <Field label={t("run.target")} hint={t("run.targetHint")}>
      {choices.length > 0 ? (
        <Choice
          label={t("run.target")}
          value={value}
          onChange={onChange}
          options={[
            { value: "", label: t("form.choose") },
            ...choices.map((choice) => ({
              value: choice.key,
              label: choice.name,
            })),
          ]}
        />
      ) : (
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}
