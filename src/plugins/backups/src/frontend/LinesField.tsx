import { useState } from "react";
import { TextAreaField } from "@termix-ssh/plugin-sdk/ui";

/** One value per line, so paths with spaces keep working. */
export function LinesField({
  label,
  hint,
  lines,
  placeholder,
  rows = 3,
  onChange,
}: {
  label: string;
  hint?: string;
  lines: string[];
  placeholder?: string;
  rows?: number;
  onChange: (lines: string[]) => void;
}) {
  const [text, setText] = useState(lines.join("\n"));
  return (
    <TextAreaField
      label={label}
      hint={hint}
      value={text}
      rows={rows}
      mono
      placeholder={placeholder}
      onChange={(value) => {
        setText(value);
        onChange(
          value
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }}
    />
  );
}
