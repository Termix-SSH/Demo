export interface Edit {
  value: string;
  start: number;
  end: number;
}

export type FormatKind =
  | "bold"
  | "italic"
  | "code"
  | "codeblock"
  | "heading"
  | "list"
  | "task"
  | "link"
  | "quote";

/** Wraps the selection, or inserts the marks and puts the cursor between. */
function wrap(
  value: string,
  start: number,
  end: number,
  before: string,
  after: string,
  placeholder: string,
): Edit {
  const picked = value.slice(start, end) || placeholder;
  const next =
    value.slice(0, start) + before + picked + after + value.slice(end);
  return {
    value: next,
    start: start + before.length,
    end: start + before.length + picked.length,
  };
}

/** Puts a prefix at the start of every selected line. */
function prefixLines(
  value: string,
  start: number,
  end: number,
  prefix: string,
): Edit {
  const from = value.lastIndexOf("\n", start - 1) + 1;
  const stop = value.indexOf("\n", end);
  const to = stop === -1 ? value.length : stop;
  const lines = value.slice(from, to).split("\n");
  const allHave = lines.every((line) => line.startsWith(prefix));
  const changed = lines
    .map((line) => (allHave ? line.slice(prefix.length) : prefix + line))
    .join("\n");
  return {
    value: value.slice(0, from) + changed + value.slice(to),
    start: from,
    end: from + changed.length,
  };
}

/** Applies a toolbar action to the text and selection. */
export function applyFormat(
  kind: FormatKind,
  value: string,
  start: number,
  end: number,
): Edit {
  switch (kind) {
    case "bold":
      return wrap(value, start, end, "**", "**", "bold");
    case "italic":
      return wrap(value, start, end, "_", "_", "italic");
    case "code":
      return wrap(value, start, end, "`", "`", "code");
    case "codeblock": {
      const lead = start > 0 && value[start - 1] !== "\n" ? "\n" : "";
      return wrap(
        value,
        start,
        end,
        `${lead}\`\`\`bash\n`,
        "\n```\n",
        "command",
      );
    }
    case "link": {
      const edit = wrap(value, start, end, "[", "](https://)", "text");
      return edit;
    }
    case "heading":
      return prefixLines(value, start, end, "## ");
    case "list":
      return prefixLines(value, start, end, "- ");
    case "task":
      return prefixLines(value, start, end, "- [ ] ");
    case "quote":
      return prefixLines(value, start, end, "> ");
  }
}

/** Flips the nth task box in the text, for clicking boxes in the preview. */
export function toggleTask(value: string, index: number): string {
  let seen = -1;
  return value.replace(/^(\s*[-*] )\[( |x|X)\]/gm, (match, lead, mark) => {
    seen += 1;
    if (seen !== index) return match;
    return `${lead}[${mark === " " ? "x" : " "}]`;
  });
}
