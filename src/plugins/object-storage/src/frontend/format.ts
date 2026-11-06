export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined) return "";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB", "PB"];
  let value = bytes;
  let unit = -1;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString();
}

export function baseName(key: string): string {
  const clean = key.replace(/\/+$/, "");
  return clean.slice(clean.lastIndexOf("/") + 1);
}

/** The folders leading to a prefix, as breadcrumb entries. */
export function crumbs(
  prefix: string,
): Array<{ name: string; prefix: string }> {
  const parts = prefix.split("/").filter(Boolean);
  return parts.map((name, index) => ({
    name,
    prefix: `${parts.slice(0, index + 1).join("/")}/`,
  }));
}

export function limitTone(percent: number): "ok" | "warn" | "bad" {
  if (percent >= 100) return "bad";
  if (percent >= 80) return "warn";
  return "ok";
}

export function isPreviewImage(key: string): boolean {
  return /\.(png|jpe?g|gif|webp|avif|bmp)$/i.test(key);
}

export function isPreviewText(key: string): boolean {
  return /\.(txt|md|json|ya?ml|log|csv|conf|ini|toml|xml|html?|css|js|ts|sh)$/i.test(
    key,
  );
}
