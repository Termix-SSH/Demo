export type SortBy = "name" | "modified" | "size";
export type SortOrder = "asc" | "desc";
export type ViewMode = "grid" | "list";
export type Density = "comfortable" | "compact";

export interface CreateIntent {
  type: "file" | "directory";
  currentName: string;
}

export function formatFileSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  const formatted =
    size < 10 && unitIndex > 0 ? size.toFixed(1) : Math.round(size).toString();
  return `${formatted} ${units[unitIndex]}`;
}
