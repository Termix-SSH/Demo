import {
  Select2,
  InlineView,
  Button,
  Input,
  DEFAULT_FOLDER_COLOR,
  DEFAULT_FOLDER_ICON,
  FolderIconEl,
  HexColorPicker,
  IconPicker,
  getCredentials,
  useDesktopLinked,
  FakeSwitch,
  SettingRow,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, CornerDownRight } from "lucide-react";
import { normalizePath, splitPath } from "./FolderPathPicker";

export type FolderMetadataValue = {
  name: string;
  color: string;
  icon: string;
  credentialId: number | null;
  localOnly: boolean;
};

type CredentialOption = { id: string; name: string; username?: string };

const MAX_SUGGESTIONS = 6;

/**
 * Folders to nest a new one under, from what is typed so far: paths that
 * start with it, then paths that contain it. A path typed out in full is
 * left out, since picking it again changes nothing.
 */
export function folderSuggestions(
  typed: string,
  existingPaths: string[],
): string[] {
  const query = normalizePath(typed).toLowerCase();
  if (!query) return [];
  const unique = [...new Set(existingPaths.map(normalizePath))].filter(
    (path) => path && path.toLowerCase() !== query,
  );
  const starts = unique.filter((p) => p.toLowerCase().startsWith(query));
  const contains = unique.filter(
    (p) => !starts.includes(p) && p.toLowerCase().includes(query),
  );
  return [...starts.sort(), ...contains.sort()].slice(0, MAX_SUGGESTIONS);
}

export function FolderMetadataDialog({
  open,
  mode,
  initial,
  existingPaths = [],
  currentPath,
  onOpenChange,
  onSubmit,
}: {
  open: boolean;
  mode: "create" | "edit";
  initial?: {
    name: string;
    color?: string;
    icon?: string;
    credentialId?: number | null;
    localOnly?: boolean;
  };
  /** Every folder path that already exists, for duplicate-name validation. */
  existingPaths?: string[];
  /** The folder's own current full path, in edit mode -- excluded from the duplicate check. */
  currentPath?: string;
  onOpenChange: (v: boolean) => void;
  onSubmit: (value: FolderMetadataValue) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState(DEFAULT_FOLDER_COLOR);
  const [icon, setIcon] = useState(DEFAULT_FOLDER_ICON);
  const [credentialId, setCredentialId] = useState<string>("");
  const [localOnly, setLocalOnly] = useState(false);
  const syncLinked = useDesktopLinked();
  const [credentials, setCredentials] = useState<CredentialOption[]>([]);

  const parentPath =
    mode === "edit" && currentPath?.includes(" / ")
      ? currentPath.slice(0, currentPath.lastIndexOf(" / "))
      : "";
  const resultingPath = name
    ? mode === "edit"
      ? parentPath
        ? `${parentPath} / ${normalizePath(name)}`
        : normalizePath(name)
      : normalizePath(name)
    : "";
  const nameRef = useRef<HTMLInputElement>(null);
  const suggestions =
    mode === "create" ? folderSuggestions(name, existingPaths) : [];
  const isDuplicate =
    !!resultingPath &&
    resultingPath !== currentPath &&
    existingPaths.some((p) => p.toLowerCase() === resultingPath.toLowerCase());

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? "");
      setColor(initial?.color ?? DEFAULT_FOLDER_COLOR);
      setIcon(initial?.icon ?? DEFAULT_FOLDER_ICON);
      setCredentialId(
        initial?.credentialId ? String(initial.credentialId) : "",
      );
      setLocalOnly(!!initial?.localOnly);
    }
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    getCredentials()
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setCredentials(
          list.map((c) => ({
            id: String(c.id),
            name: String(c.name ?? ""),
            username: c.username ? String(c.username) : undefined,
          })),
        );
      })
      .catch(() => setCredentials([]));
  }, [open]);

  function handleSubmit() {
    const normalized = normalizePath(name);
    if (!normalized || isDuplicate) return;
    onSubmit({
      name: normalized,
      color,
      icon,
      credentialId: credentialId ? Number(credentialId) : null,
      localOnly,
    });
    onOpenChange(false);
  }

  return (
    <InlineView
      open={open}
      onOpenChange={onOpenChange}
      title={
        <>
          {mode === "create"
            ? t("hosts.createFolderTitle")
            : t("hosts.editFolderTitle")}
        </>
      }
    >
      <p className="text-xs text-muted-foreground">
        {t("hosts.folderDialogDescription")}
      </p>
      <div className="flex flex-col gap-4 mt-1">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">
            {t("hosts.folderNameLabel")}{" "}
            <span className="text-accent-brand">*</span>
          </label>
          <Input
            ref={nameRef}
            placeholder={t("hosts.folderNamePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !isDuplicate) handleSubmit();
            }}
            aria-invalid={isDuplicate}
            className={isDuplicate ? "border-destructive" : undefined}
          />
          {suggestions.length > 0 && (
            <div className="flex flex-col border border-border bg-(--field) py-1">
              {suggestions.map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => {
                    setName(`${path} / `);
                    nameRef.current?.focus();
                  }}
                  className="flex items-center gap-2 px-2.5 py-1 text-left text-xs text-foreground/80 hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <CornerDownRight className="size-3 shrink-0 text-muted-foreground/60" />
                  <span className="truncate">{path}</span>
                </button>
              ))}
            </div>
          )}
          {isDuplicate ? (
            <p className="text-[10px] text-destructive">
              {t("hosts.folderNameDuplicate")}
            </p>
          ) : (
            <p className="text-[10px] text-muted-foreground">
              {t("hosts.folderNestingHint")}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold">
            {t("hosts.folderColor")}
          </label>
          <HexColorPicker value={color} onChange={setColor} />
        </div>
        <div className="flex flex-col gap-2">
          <label className="text-xs font-semibold">
            {t("hosts.folderIcon")}
          </label>
          <IconPicker value={icon} color={color} onChange={setIcon} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">
            {t("hosts.folderCredential")}
          </label>
          <Select2
            value={credentialId}
            onChange={(e) => setCredentialId(e.target.value)}
            className="flex h-8 w-full border border-border bg-(--field) px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            <option value="">{t("hosts.folderCredentialNone")}</option>
            {credentials.map((c) => (
              <option key={c.id} value={c.id}>
                {c.username ? `${c.name} (${c.username})` : c.name}
              </option>
            ))}
          </Select2>
          <p className="text-[10px] text-muted-foreground">
            {t("hosts.folderCredentialHint")}
          </p>
        </div>
        {syncLinked && (
          <SettingRow
            label={t("hosts.folderLocalOnly")}
            description={t("hosts.folderLocalOnlyDesc")}
          >
            <FakeSwitch checked={localOnly} onChange={setLocalOnly} />
          </SettingRow>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold">
            {t("hosts.folderPreview")}
          </label>
          <div className="flex items-center gap-2 px-3 py-3 border border-border bg-muted/20">
            <FolderIconEl
              icon={icon}
              className="size-4 shrink-0"
              style={{ color }}
            />
            <span className="flex items-center gap-0.5 text-sm font-semibold flex-wrap">
              {name
                ? splitPath(name).map((seg, i) => (
                    <span key={i} className="flex items-center gap-0.5">
                      {i > 0 && (
                        <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                      )}
                      {seg}
                    </span>
                  ))
                : t("hosts.folderNameFallback")}
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 mt-2">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          {t("hosts.cancel")}
        </Button>
        <Button
          variant="outline"
          className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand"
          onClick={handleSubmit}
          disabled={!name.trim() || isDuplicate}
        >
          {mode === "create"
            ? t("hosts.createFolderButton")
            : t("hosts.saveFolderButton")}
        </Button>
      </div>
    </InlineView>
  );
}
