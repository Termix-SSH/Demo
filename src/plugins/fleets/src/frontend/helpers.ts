/** A thrown value's message, or the fallback when it is not an Error. */
export function getErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  return error instanceof Error ? error.message : fallback;
}

export interface SnippetInput {
  key: string;
  label: string;
}
