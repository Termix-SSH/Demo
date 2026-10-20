import { useEffect, useState } from "react";
import {
  Button,
  ComponentSlot,
  useConfirm,
  deleteCredential,
  duplicateCredential,
  getCredentials,
  getSSHHosts,
  renameCredentialFolder,
  updateCredential,
  requestManage,
  type Credential,
  type Host,
  type CredentialRowFields,
  type CredentialSidebarFilterState,
  type CredentialSortKey,
  mapCredentials,
  sshHostToHost,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { toast } from "sonner";
import { CredentialShareModal } from "./CredentialShareModal";
import { CredentialSidebarTree } from "./credential-tree";
import { credentialPassesFilters, sortCredentials } from "./credential-sort";

const UNCATEGORIZED = "Uncategorized";

/**
 * The credentials sidebar list. Editing happens in the Manage tab; this keeps
 * the tree, its folder moves and the quick actions on each row.
 */
export function CredentialList({
  search = "",
  sort = "default",
  arrangeLocked = true,
  filter,
  density = "comfortable",
  trayTrigger = "hover",
  showTags = true,
  rowFields,
  onTagsChange,
}: {
  search?: string;
  sort?: CredentialSortKey;
  arrangeLocked?: boolean;
  filter?: CredentialSidebarFilterState;
  density?: "comfortable" | "compact";
  trayTrigger?: "always" | "hover" | "click" | "actionsOnly";
  showTags?: boolean;
  rowFields?: CredentialRowFields;
  onTagsChange?: (tags: string[]) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [shareCredential, setShareCredential] = useState<Credential | null>(
    null,
  );
  const [editingFolderName, setEditingFolderName] = useState<string | null>(
    null,
  );
  const [editingFolderValue, setEditingFolderValue] = useState("");

  useEffect(() => {
    onTagsChange?.([...new Set(credentials.flatMap((c) => c.tags ?? []))]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [credentials]);

  useEffect(() => {
    const reloadHosts = () => {
      getSSHHosts()
        .then((raw) => setHosts(raw.map(sshHostToHost)))
        .catch(() => {});
    };
    const reloadCredentials = () => {
      getCredentials()
        .then((res) => setCredentials(mapCredentials(res)))
        .catch(() => {})
        .finally(() => setLoading(false));
    };
    reloadHosts();
    reloadCredentials();
    window.addEventListener("termix:hosts-changed", reloadHosts);
    window.addEventListener("ssh-hosts:changed", reloadHosts);
    window.addEventListener("termix:credentials-changed", reloadCredentials);
    return () => {
      window.removeEventListener("termix:hosts-changed", reloadHosts);
      window.removeEventListener("ssh-hosts:changed", reloadHosts);
      window.removeEventListener(
        "termix:credentials-changed",
        reloadCredentials,
      );
    };
  }, []);

  const needle = search.toLowerCase();
  const searched = credentials.filter(
    (c) =>
      c.name.toLowerCase().includes(needle) ||
      c.username.toLowerCase().includes(needle),
  );
  const filtered = sortCredentials(
    filter
      ? searched.filter((c) => credentialPassesFilters(c, filter))
      : searched,
    sort,
  );
  const folderNames = Array.from(
    new Set(filtered.map((c) => c.folder || UNCATEGORIZED)),
  ).sort();
  const folderTree = folderNames.map((name) => ({
    name,
    children: filtered.filter((c) => (c.folder || UNCATEGORIZED) === name),
  }));
  const usedByCounts = new Map<string, number>();
  for (const cred of filtered) {
    usedByCounts.set(
      cred.id,
      hosts.filter((h) => h.credentialId === cred.id).length,
    );
  }

  const reload = async () => {
    const res = await getCredentials();
    setCredentials(mapCredentials(res));
  };

  const renameFolder = async (folder: string, newName: string) => {
    try {
      await renameCredentialFolder(folder, newName);
      await reload();
      toast.success(t("credentials.folderRenamedTo", { name: newName }));
    } catch {
      toast.error(t("credentials.failedToRenameFolder"));
    }
  };

  const moveToFolder = async (credentialId: string, targetFolder: string) => {
    const cred = credentials.find((c) => c.id === credentialId);
    if (!cred || (cred.folder || UNCATEGORIZED) === targetFolder) return;
    const folderValue = targetFolder === UNCATEGORIZED ? "" : targetFolder;
    try {
      await updateCredential(Number(credentialId), { folder: folderValue });
      setCredentials((prev) =>
        prev.map((c) =>
          c.id === credentialId ? { ...c, folder: folderValue } : c,
        ),
      );
    } catch {
      toast.error(t("credentials.failedToMoveCredential"));
    }
  };

  const clone = async (cred: Credential) => {
    try {
      await duplicateCredential(Number(cred.id), {
        name: t("credentials.clonedCredentialName", { name: cred.name }),
      });
      await reload();
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(t("credentials.clonedCredential", { name: cred.name }));
    } catch (err) {
      const msg = err instanceof Error ? err.message : null;
      toast.error(msg || t("credentials.failedToCloneCredential"));
    }
  };

  const remove = async (cred: Credential) => {
    const ok = await confirm({
      title: t("credentials.deleteCredentialConfirm", { name: cred.name }),
      description: t("manage.cannotBeUndone"),
    });
    if (!ok) return;
    try {
      await deleteCredential(Number(cred.id));
      setCredentials((prev) => prev.filter((c) => c.id !== cred.id));
      window.dispatchEvent(new CustomEvent("termix:credentials-changed"));
      toast.success(t("credentials.deletedCredential", { name: cred.name }));
    } catch {
      toast.error(t("credentials.failedToDeleteCredential"));
    }
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {!loading && filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-12 text-center">
          <span className="text-sm font-semibold text-muted-foreground/60">
            {t("credentials.noCredentialsFound")}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="mt-3 h-7 border-accent-brand/40 text-xs text-accent-brand hover:bg-accent-brand/10"
            onClick={() =>
              requestManage({ kind: "credential", credentialId: null })
            }
          >
            {t("credentials.addCredentialBtn")}
          </Button>
        </div>
      ) : (
        <CredentialSidebarTree
          folders={folderTree}
          usedByCounts={usedByCounts}
          query=""
          loading={loading}
          arrangeLocked={arrangeLocked}
          density={density}
          trayTrigger={trayTrigger}
          showTags={showTags}
          rowFields={rowFields}
          editingFolderName={editingFolderName}
          editingFolderValue={editingFolderValue}
          onEditingFolderNameChange={setEditingFolderName}
          onEditingFolderValueChange={setEditingFolderValue}
          onRenameFolder={renameFolder}
          onMoveCredentialToFolder={moveToFolder}
          onEditCredential={(cred) =>
            requestManage({ kind: "credential", credentialId: cred.id })
          }
          onCloneCredential={clone}
          onDeleteCredential={remove}
          onShareCredential={setShareCredential}
        />
      )}

      <CredentialShareModal
        credential={shareCredential}
        onClose={() => setShareCredential(null)}
      />

      {/* Plugins mount their own credential dialogs here. */}
      <ComponentSlot slotId="credentials.panel" />
    </div>
  );
}
