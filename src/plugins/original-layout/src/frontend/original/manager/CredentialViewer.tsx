import { useMemo, useState } from "react";
import {
  KeyRound,
  Pencil,
  Pin,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import type { Credential } from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { outlineButton, wideButton } from "../styles";
import { FolderSections, groupByFolder } from "./FolderSections";
import { cardClass, iconButton } from "./HostViewer";

function credentialMatches(cred: Credential, needle: string): boolean {
  const text = [
    cred.name,
    cred.username,
    cred.description,
    cred.folder,
    ...(cred.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return needle
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => text.includes(word));
}

/** Someone else's credential shared at "use" can't be changed here. */
export function canEditCredential(cred: Credential): boolean {
  return !cred.isShared || cred.permissionLevel === "manage";
}

function CredentialCard({
  credential,
  onEdit,
  onDelete,
}: {
  credential: Credential;
  onEdit: (cred: Credential) => void;
  onDelete: (cred: Credential) => void;
}) {
  const { t } = useTranslation();
  const editable = canEditCredential(credential);
  return (
    <div className={cardClass}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          disabled={!editable}
          onClick={() => onEdit(credential)}
          className="flex min-w-0 flex-1 flex-col items-start text-left focus-visible:outline-none focus-visible:underline disabled:cursor-default"
        >
          <span className="flex max-w-full items-center gap-1 text-sm font-medium">
            {credential.pin && (
              <Pin
                aria-label={t("original.pinned")}
                className="size-3 shrink-0 text-yellow-500"
              />
            )}
            <span className="truncate">{credential.name}</span>
          </span>
          {credential.username && (
            <span className="max-w-full truncate text-xs text-muted-foreground">
              {credential.username}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {credential.type === "key"
              ? t("original.manager.sshKey")
              : t("original.manager.password")}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-0.5">
          {credential.isShared && (
            <Users
              aria-label={t("original.manager.shared")}
              className="mr-1 size-3.5 text-muted-foreground"
            />
          )}
          {editable && (
            <button
              type="button"
              title={t("original.edit")}
              aria-label={t("original.edit")}
              onClick={() => onEdit(credential)}
              className={iconButton}
            >
              <Pencil className="size-3.5" />
            </button>
          )}
          {!credential.isShared && (
            <button
              type="button"
              title={t("original.manager.delete")}
              aria-label={t("original.manager.delete")}
              onClick={() => onDelete(credential)}
              className={`${iconButton} text-red-500`}
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-[0.375rem] border border-border px-1.5 py-0.5 text-xs">
          <KeyRound className="size-3" />
          {credential.type === "key"
            ? t("original.manager.sshKey")
            : t("original.manager.password")}
        </span>
        {(credential.tags ?? []).map((tag) => (
          <span
            key={tag}
            className="rounded-[0.375rem] bg-background px-1.5 py-0.5 text-xs text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The old Credentials Viewer: a search and the credentials as cards. */
export function CredentialViewer({
  credentials,
  onAdd,
  onEdit,
  onDelete,
  onRefresh,
}: {
  credentials: Credential[];
  onAdd: () => void;
  onEdit: (cred: Credential) => void;
  onDelete: (cred: Credential) => void;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const needle = search.trim().toLowerCase();
  const groups = useMemo(
    () =>
      groupByFolder(
        needle
          ? credentials.filter((c) => credentialMatches(c, needle))
          : credentials,
        (c) => c.folder,
        (c) => c.name,
      ),
    [credentials, needle],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-semibold">
            {t("original.manager.sshCredentials")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t("original.manager.credentialCount", {
              count: credentials.length,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onAdd}
            className={`${wideButton} h-8 gap-1.5 px-3 text-sm`}
          >
            <Plus className="size-3.5" />
            {t("original.manager.addCredential")}
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className={`${outlineButton} h-8 gap-1.5 px-3 text-sm`}
          >
            <RefreshCw className="size-3.5" />
            {t("original.refresh")}
          </button>
        </div>
      </div>
      <div className="flex h-9 items-center gap-2 rounded-[0.5rem] border-2 border-border bg-[var(--original-field,var(--muted))] px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("original.manager.searchCredentials")}
          aria-label={t("original.manager.searchCredentials")}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        {credentials.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("original.manager.noCredentials")}
          </p>
        ) : groups.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {t("original.noMatches")}
          </p>
        ) : (
          <FolderSections
            groups={groups}
            storageKey="original-layout.managerCredentialFolders"
            keyOf={(c) => String(c.id)}
            forceOpen={!!needle}
            renderCard={(cred) => (
              <CredentialCard
                credential={cred}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            )}
          />
        )}
      </div>
    </div>
  );
}
