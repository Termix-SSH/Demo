import { useEffect, useMemo, useState } from "react";
import {
  CredentialSidebarTree,
  type CredentialFolder,
} from "@/sidebar/credential-tree";
import {
  getDemoCredentials,
  subscribeDemoCredentials,
} from "@/demo/credential-store";
import type { Credential } from "@/types/ui-types";
import type {
  HostDensity,
  HostSidebarFilterState,
  HostTrayTrigger,
  SortKey,
} from "@/types/host-sidebar-preferences";
import type {
  CredentialDensity,
  CredentialSortKey,
  CredentialTrayTrigger,
} from "@/types/credential-sidebar-preferences";

/**
 * The credential tree, and the bridge that sends edits to the workbench.
 *
 * This used to hold the host and credential editors too, rendered inside the
 * 291px dock, which is why opening one widened the dock to 560px and hid the
 * list. The editors live in the host-manager tab now; what stays here is the
 * credential tree the credentials panel delegates to, plus the forwarding of
 * edit requests so every existing trigger keeps working.
 */
export function HostManager({
  hideListHeader,
  externalSearch,
  density,
  trayTrigger,
  showTags,
  onTagsChange,
}: {
  onEditingChange?: (editing: boolean) => void;
  active?: boolean;
  hideListHeader?: boolean;
  externalSearch?: string;
  externalSort?: SortKey | CredentialSortKey;
  externalArrangeLocked?: boolean;
  externalFilter?: HostSidebarFilterState | unknown;
  density?: HostDensity | CredentialDensity;
  trayTrigger?: HostTrayTrigger | CredentialTrayTrigger;
  showTags?: boolean;
  onTagsChange?: (tags: string[]) => void;
}) {
  const [credentials, setCredentials] =
    useState<Credential[]>(getDemoCredentials);
  useEffect(
    () =>
      subscribeDemoCredentials(() => setCredentials([...getDemoCredentials()])),
    [],
  );

  const credentialFolders = useMemo<CredentialFolder[]>(() => {
    const byFolder = new Map<string, Credential[]>();
    for (const cred of credentials) {
      const key = cred.folder?.trim() || "Ungrouped";
      const list = byFolder.get(key);
      if (list) list.push(cred);
      else byFolder.set(key, [cred]);
    }
    return [...byFolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, children]) => ({ name, children }));
  }, [credentials]);

  useEffect(() => {
    const tags = new Set<string>();
    for (const cred of credentials) cred.tags?.forEach((x) => tags.add(x));
    onTagsChange?.([...tags].sort());
  }, [credentials, onTagsChange]);

  const usedByCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cred of credentials) counts.set(cred.id, 0);
    return counts;
  }, [credentials]);

  const [editingFolderName, setEditingFolderName] = useState<string | null>(
    null,
  );
  const [editingFolderValue, setEditingFolderValue] = useState("");
  const noop = (): void => {};

  if (!hideListHeader) return null;

  return (
    <CredentialSidebarTree
      folders={credentialFolders}
      usedByCounts={usedByCounts}
      query={(externalSearch ?? "").trim().toLowerCase()}
      loading={false}
      arrangeLocked
      density={density as CredentialDensity}
      trayTrigger={trayTrigger as CredentialTrayTrigger}
      showTags={showTags}
      editingFolderName={editingFolderName}
      editingFolderValue={editingFolderValue}
      onEditingFolderNameChange={setEditingFolderName}
      onEditingFolderValueChange={setEditingFolderValue}
      onRenameFolder={async () => noop()}
      onDeployCredential={noop}
      onEditCredential={(cred) =>
        window.dispatchEvent(
          new CustomEvent("host-manager:edit-credential", {
            detail: { credential: cred },
          }),
        )
      }
      onCloneCredential={noop}
      onDeleteCredential={noop}
    />
  );
}
