/** First line of a site made in the site form, followed by its values. */
export const SPEC_MARK = "# termix-site: ";
export const SPEC_NOTE =
  "# Made in Termix Web Servers. Edit it there to keep the site form in step.";

/** The text without the form lines. Text saved by hand loses the form. */
export function dropSpec(content: string): string {
  const lines = content.split("\n");
  if (!lines[0]?.startsWith(SPEC_MARK)) return content;
  return lines.slice(lines[1] === SPEC_NOTE ? 2 : 1).join("\n");
}
