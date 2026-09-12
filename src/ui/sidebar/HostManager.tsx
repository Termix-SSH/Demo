import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Info } from "lucide-react";
import { Button } from "@/components/button";
import {
  CredentialSidebarTree,
  type CredentialFolder,
} from "@/sidebar/credential-tree";
import {
  makeCredentialTabs,
  makeHostSshSubTabs,
  makeHostTabs,
  SSH_GROUP_TABS,
  TabStrip,
  type HostTabId,
} from "@/sidebar/HostManagerTabs";
import {
  DemoHostEditor,
  createHostEditorForm,
  type HostEditorForm,
} from "@/demo/DemoHostEditor";
import {
  DemoCredentialEditor,
  createCredentialEditorForm,
  type CredentialEditorForm,
} from "@/demo/DemoCredentialEditor";
import {
  addDemoHost,
  getDemoHosts,
  subscribeDemoHosts,
  updateDemoHost,
} from "@/demo/demo-store";
import { DEMO_CREDENTIALS } from "@/demo/demo-data";
import type { Credential, Host } from "@/types/ui-types";
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
 * Hosts and credentials share one editor container, as in the real app: the
 * tree is swapped for a back button, a tab strip and the matching editor body.
 */
export function HostManager({
  onEditingChange,
  hideListHeader,
  externalSearch,
  density,
  trayTrigger,
  showTags,
  onTagsChange,
  active = true,
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
  const { t } = useTranslation();

  const [editingHost, setEditingHost] = useState<Host | "new" | null>(null);
  const [editingCredential, setEditingCredential] = useState<
    Credential | "new" | null
  >(null);
  const [activeHostTab, setActiveHostTab] = useState<HostTabId>("general");
  const [activeCredentialTab, setActiveCredentialTab] = useState("general");

  const [hostForm, setHostForm] = useState<HostEditorForm>(() =>
    createHostEditorForm(null),
  );
  const [credForm, setCredForm] = useState<CredentialEditorForm>(() =>
    createCredentialEditorForm(null),
  );

  const [hosts, setHosts] = useState<Host[]>(getDemoHosts);
  useEffect(() => subscribeDemoHosts(() => setHosts([...getDemoHosts()])), []);

  const openHostEditor = (host: Host | "new") => {
    setEditingCredential(null);
    setEditingHost(host);
    setActiveHostTab("general");
    setHostForm(createHostEditorForm(host === "new" ? null : host));
  };

  const openCredentialEditor = (credential: Credential | "new") => {
    setEditingHost(null);
    setEditingCredential(credential);
    setActiveCredentialTab("general");
    setCredForm(
      createCredentialEditorForm(credential === "new" ? null : credential),
    );
  };

  useEffect(() => {
    if (!active) return;
    const onAddHost = () => openHostEditor("new");
    const onEditHost = (event: Event) => {
      const host = (event as CustomEvent<{ host?: Host }>).detail?.host;
      openHostEditor(host ?? "new");
    };
    const onAddCredential = () => openCredentialEditor("new");
    window.addEventListener("host-manager:add-host", onAddHost);
    window.addEventListener("host-manager:edit-host", onEditHost);
    window.addEventListener("host-manager:add-credential", onAddCredential);
    return () => {
      window.removeEventListener("host-manager:add-host", onAddHost);
      window.removeEventListener("host-manager:edit-host", onEditHost);
      window.removeEventListener(
        "host-manager:add-credential",
        onAddCredential,
      );
    };
  }, [active]);

  // Both panels keep a HostManager mounted, so an editor left open in the
  // hidden one would reappear when you switch back to it.
  useEffect(() => {
    if (active) return;
    setEditingHost(null);
    setEditingCredential(null);
  }, [active]);

  const isEditing = !!editingHost || !!editingCredential;
  useEffect(() => {
    if (active) onEditingChange?.(isEditing);
  }, [isEditing, active, onEditingChange]);

  const closeEditor = () => {
    setEditingHost(null);
    setEditingCredential(null);
  };

  const setHostField = <K extends keyof HostEditorForm>(
    key: K,
    value: HostEditorForm[K],
  ) => setHostForm((prev) => ({ ...prev, [key]: value }));

  const setCredField = <K extends keyof CredentialEditorForm>(
    key: K,
    value: CredentialEditorForm[K],
  ) => setCredForm((prev) => ({ ...prev, [key]: value }));

  function saveHost() {
    const updates: Partial<Host> = {
      name: hostForm.name.trim(),
      ip: hostForm.ip.trim(),
      folder: hostForm.folder,
      username: hostForm.username.trim(),
      sshPort: hostForm.sshPort,
      port: hostForm.sshPort,
      authType: hostForm.authType,
      credentialId: hostForm.credentialId || undefined,
      tags: hostForm.tags,
      notes: hostForm.notes,
      pin: hostForm.pin,
      defaultPath: hostForm.defaultPath || undefined,
      enableSsh: hostForm.enableSsh,
      enableRdp: hostForm.enableRdp,
      enableVnc: hostForm.enableVnc,
      enableTelnet: hostForm.enableTelnet,
      rdpPort: hostForm.rdpPort,
      vncPort: hostForm.vncPort,
      telnetPort: hostForm.telnetPort,
      enableTerminal: hostForm.enableTerminal,
      enableTerminalToolbar: hostForm.enableTerminalToolbar,
      enableCommandHistory: hostForm.enableCommandHistory,
      enableTunnel: hostForm.enableTunnel,
      enableDocker: hostForm.enableDocker,
      enableFileManager: hostForm.enableFileManager,
      scpLegacy: hostForm.scpLegacy,
      enableProxmox: hostForm.enableProxmox,
    };

    if (editingHost && editingHost !== "new") {
      updateDemoHost(editingHost.id, updates);
    } else {
      addDemoHost({
        ...updates,
        id: `h-${Date.now().toString(36)}`,
        status: "online",
        online: true,
        cpu: null,
        ram: null,
        parentHostId: null,
        serverTunnels: [],
        quickActions: [],
        enableProxmoxStats: false,
        enableTmuxMonitor: false,
        lastAccess: new Date().toISOString(),
      } as Host);
    }
    closeEditor();
  }

  const credentialFolders = useMemo<CredentialFolder[]>(() => {
    const byFolder = new Map<string, Credential[]>();
    for (const cred of DEMO_CREDENTIALS) {
      const key = cred.folder?.trim() || "Ungrouped";
      const list = byFolder.get(key);
      if (list) list.push(cred);
      else byFolder.set(key, [cred]);
    }
    return [...byFolder.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, children]) => ({ name, children }));
  }, []);

  const existingFolders = useMemo(
    () =>
      [
        ...new Set(
          DEMO_CREDENTIALS.map((c) => c.folder).filter((f): f is string => !!f),
        ),
      ].sort(),
    [],
  );

  useEffect(() => {
    const tags = new Set<string>();
    for (const cred of DEMO_CREDENTIALS) cred.tags?.forEach((x) => tags.add(x));
    onTagsChange?.([...tags].sort());
  }, [onTagsChange]);

  const usedByCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const cred of DEMO_CREDENTIALS) counts.set(cred.id, 0);
    return counts;
  }, []);

  const [editingFolderName, setEditingFolderName] = useState<string | null>(
    null,
  );
  const [editingFolderValue, setEditingFolderValue] = useState("");
  const noop = (): void => {};

  if (isEditing) {
    const isHost = !!editingHost;
    const tabs = isHost
      ? makeHostTabs(t).filter((tab) => {
          if (tab.id === "general" || tab.id === "ssh") return true;
          if (tab.id === "rdp") return hostForm.enableRdp;
          if (tab.id === "vnc") return hostForm.enableVnc;
          if (tab.id === "telnet") return hostForm.enableTelnet;
          return true;
        })
      : makeCredentialTabs(t);
    const showSshSubTabs = isHost && SSH_GROUP_TABS.has(activeHostTab);
    const activeTab = isHost ? activeHostTab : activeCredentialTab;

    return (
      <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="shrink-0 border-b border-border">
          <button
            onClick={closeEditor}
            className="flex items-center gap-2 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ArrowLeft className="size-3.5 shrink-0" />
            <span>
              {isHost
                ? t("hosts.backToHosts")
                : t("credentials.backToCredentials")}
            </span>
            {isHost && editingHost !== "new" && (
              <span
                className="ml-auto font-semibold text-foreground truncate max-w-[200px]"
                title={(editingHost as Host).name}
              >
                {(editingHost as Host).name}
              </span>
            )}
          </button>
          <TabStrip
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(id) => {
              if (isHost) {
                if (id === "ssh") {
                  if (!SSH_GROUP_TABS.has(activeHostTab)) {
                    setActiveHostTab("ssh");
                  }
                } else {
                  setActiveHostTab(id as HostTabId);
                }
              } else {
                setActiveCredentialTab(id);
              }
            }}
            isActive={
              isHost
                ? (id) =>
                    id === "ssh"
                      ? SSH_GROUP_TABS.has(activeHostTab)
                      : activeHostTab === id
                : undefined
            }
          />
          {showSshSubTabs && (
            <TabStrip
              tabs={makeHostSshSubTabs(t)}
              activeTab={activeHostTab}
              onTabChange={(id) => setActiveHostTab(id as HostTabId)}
              variant="secondary"
            />
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 flex flex-col gap-3">
          <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <Info className="size-3 shrink-0" />
            {t("credentials.demoEditorNote")}
          </p>

          {isHost ? (
            <DemoHostEditor
              form={hostForm}
              setField={setHostField}
              activeTab={activeHostTab}
              hosts={hosts}
              credentials={DEMO_CREDENTIALS}
            />
          ) : (
            <DemoCredentialEditor
              form={credForm}
              setField={setCredField}
              activeTab={activeCredentialTab}
              existingFolders={existingFolders}
            />
          )}

          <div className="flex justify-end gap-3 mt-3 mb-6">
            <Button variant="ghost" onClick={closeEditor}>
              {t("hosts.guac.cancelBtn")}
            </Button>
            <Button
              variant="outline"
              className="border-accent-brand/40 text-accent-brand hover:bg-accent-brand/10 hover:text-accent-brand px-8"
              onClick={() => (isHost ? saveHost() : closeEditor())}
            >
              {isHost
                ? editingHost === "new"
                  ? t("hosts.guac.addHostBtn")
                  : t("hosts.guac.updateHostBtn")
                : editingCredential === "new"
                  ? t("hosts.addCredentialBtn")
                  : t("hosts.updateCredentialBtn")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

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
      onEditCredential={(cred) => openCredentialEditor(cred)}
      onCloneCredential={noop}
      onDeleteCredential={noop}
    />
  );
}
