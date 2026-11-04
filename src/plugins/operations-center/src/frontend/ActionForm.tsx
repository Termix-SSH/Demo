import { useEffect, useState } from "react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Field,
  Input,
  PasswordInput,
  Select2,
  Switch,
  Textarea,
} from "@termix-ssh/plugin-sdk/ui";
import { runAction, type CatalogField } from "./api";

export type FormValues = Record<string, unknown>;

/** Starting values from each field's default. */
export function initialValues(fields: CatalogField[]): FormValues {
  const values: FormValues = {};
  for (const field of fields) {
    if (field.default !== undefined) values[field.key] = field.default;
  }
  return values;
}

/** Drops empty values, so the gate fills defaults and checks required ones. */
export function cleanValues(values: FormValues): FormValues {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== "" && value !== undefined && value !== null,
    ),
  );
}

type Choices = Record<string, { value: string; label: string }[]>;

/** Choices a read action fills, for a field declared with optionsFrom. */
function useDynamicChoices(fields: CatalogField[], hostId?: number): Choices {
  const [choices, setChoices] = useState<Choices>({});
  const wanted = fields
    .filter((field) => field.optionsFrom)
    .map((field) => `${field.key}:${field.optionsFrom}`)
    .join(",");
  useEffect(() => {
    let live = true;
    const next: Choices = {};
    void Promise.all(
      fields
        .filter((field) => field.optionsFrom)
        .map(async (field) => {
          const outcome = await runAction(field.optionsFrom!, { hostId }).catch(
            () => null,
          );
          const data = (outcome?.data ?? {}) as {
            options?: { value: string; label?: string }[];
            rows?: Record<string, unknown>[];
          };
          next[field.key] = data.options
            ? data.options.map((option) => ({
                value: String(option.value),
                label: option.label ?? String(option.value),
              }))
            : (data.rows ?? []).map((row) => ({
                value: String(row.id ?? row.name),
                label: String(row.name ?? row.id),
              }));
        }),
    ).then(() => live && setChoices(next));
    return () => {
      live = false;
    };
    // wanted stands in for fields, whose identity changes each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, hostId]);
  return choices;
}

/** Draws an action's inputs from its declaration. Core checks them again. */
export function ActionForm({
  fields,
  values,
  onChange,
  disabled,
  hostId,
}: {
  fields: CatalogField[];
  /** The host, so a field whose choices come from the host can load them. */
  hostId?: number;
  values: FormValues;
  onChange: (next: FormValues) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const dynamic = useDynamicChoices(fields, hostId);
  const set = (key: string, value: unknown) =>
    onChange({ ...values, [key]: value });

  const visible = fields.filter(
    (field) => !field.requires || values[field.requires] === true,
  );
  if (visible.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">{t("form.noInputs")}</p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.map((field) => {
        const id = `op-field-${field.key}`;
        const value = values[field.key];
        const label = field.required ? `${field.label} *` : field.label;
        let control;
        switch (field.type) {
          case "boolean":
            control = (
              <Switch
                id={id}
                checked={value === true}
                disabled={disabled}
                onCheckedChange={(checked) => set(field.key, checked)}
              />
            );
            break;
          case "select":
            control = (
              <Select2
                id={id}
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                onChange={(event) => set(field.key, event.target.value)}
                placeholder={field.placeholder ?? t("form.choose")}
              >
                {(field.optionsFrom
                  ? (dynamic[field.key] ?? [])
                  : (field.options ?? []).map((option) => ({
                      value: option.value,
                      label: field.optionLabels?.[option.value] ?? option.value,
                    }))
                ).map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select2>
            );
            break;
          case "number":
            control = (
              <Input
                id={id}
                type="number"
                min={field.min}
                max={field.max}
                value={value === undefined ? "" : String(value)}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => set(field.key, event.target.value)}
              />
            );
            break;
          case "secret":
            control = (
              <PasswordInput
                id={id}
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                onChange={(event) => set(field.key, event.target.value)}
              />
            );
            break;
          case "textarea":
          case "json":
            control = (
              <Textarea
                id={id}
                rows={field.type === "json" ? 6 : 4}
                className="font-mono text-xs"
                value={
                  typeof value === "string"
                    ? value
                    : value === undefined
                      ? ""
                      : JSON.stringify(value, null, 2)
                }
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => set(field.key, event.target.value)}
              />
            );
            break;
          case "multiselect":
            control = (
              <Input
                id={id}
                value={Array.isArray(value) ? value.join(", ") : ""}
                disabled={disabled}
                placeholder={t("form.commaList")}
                onChange={(event) =>
                  set(
                    field.key,
                    event.target.value
                      .split(",")
                      .map((entry) => entry.trim())
                      .filter(Boolean),
                  )
                }
              />
            );
            break;
          default:
            control = (
              <Input
                id={id}
                value={typeof value === "string" ? value : ""}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => set(field.key, event.target.value)}
              />
            );
        }
        return (
          <Field
            key={field.key}
            label={label}
            hint={field.description}
            htmlFor={id}
          >
            {control}
          </Field>
        );
      })}
    </div>
  );
}
