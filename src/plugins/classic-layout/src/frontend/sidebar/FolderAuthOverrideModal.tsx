import * as sdkUi from "@termix-ssh/plugin-sdk/ui";
import {
  Select2,
  FormFooter,
  InlineView,
  getCredentials,
  type Credential,
  type Host,
  mapCredentials,
  getConnectedRemoteApi,
} from "@termix-ssh/plugin-sdk/ui";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type FolderAuthApi = {
  getFolderAuthOverride: (
    folder: string,
    protocol: "ssh",
    sharedCopySyncId?: string | null,
  ) => Promise<{ credentialId: number | null }>;
  setFolderAuthOverride: (
    folder: string,
    protocol: "ssh",
    credentialId: number | null,
    sharedCopySyncId?: string | null,
  ) => Promise<unknown>;
};

/**
 * Folder logins need Termix 26.10.6. Read through the namespace so an older
 * core, which lacks them, only hides the action.
 */
export function folderAuthApi(): FolderAuthApi | null {
  try {
    const api = sdkUi as unknown as Partial<FolderAuthApi>;
    return typeof api.getFolderAuthOverride === "function" &&
      typeof api.setFolderAuthOverride === "function"
      ? (api as FolderAuthApi)
      : null;
  } catch {
    return null;
  }
}

/** The user's own SSH login for every host shared with them in a folder. */
export function FolderAuthOverrideModal({
  open,
  onOpenChange,
  folder,
  sampleHost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  folder: string;
  /** A shared host in the folder, to reach the right server from a desktop. */
  sampleHost: Host;
}) {
  const { t } = useTranslation();
  const api = folderAuthApi();
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [initialId, setInitialId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const sharedCopySyncId = sampleHost.sharedCopy
    ? (sampleHost.syncId ?? null)
    : null;

  useEffect(() => {
    if (!open || !api) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    const credentialsRequest = sharedCopySyncId
      ? getConnectedRemoteApi().then((remote) => {
          if (!remote) throw new Error("The linked server is not reachable");
          return remote.get("/credentials").then((response) => response.data);
        })
      : getCredentials();
    Promise.all([
      credentialsRequest,
      api.getFolderAuthOverride(folder, "ssh", sharedCopySyncId),
    ])
      .then(([credentialResult, overrideResult]) => {
        if (cancelled) return;
        const nextId =
          overrideResult.credentialId == null
            ? ""
            : String(overrideResult.credentialId);
        setCredentials(mapCredentials(credentialResult));
        setSelectedId(nextId);
        setInitialId(nextId);
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api, folder, open, sharedCopySyncId]);

  const handleSave = async () => {
    if (!api) return;
    setSaving(true);
    try {
      const credentialId = selectedId ? Number(selectedId) : null;
      await api.setFolderAuthOverride(
        folder,
        "ssh",
        credentialId,
        sharedCopySyncId,
      );
      toast.success(
        t(
          credentialId === null
            ? "sharing.folderLogin.cleared"
            : "sharing.folderLogin.saved",
        ),
      );
      window.dispatchEvent(new CustomEvent("termix:hosts-changed"));
      onOpenChange(false);
    } catch {
      toast.error(t("hosts.sharing.authOverrideSaveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <span
      className="contents"
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <InlineView
        open={open}
        onOpenChange={onOpenChange}
        title={t("sharing.folderLogin.title")}
        footer={
          <FormFooter
            onCancel={() => onOpenChange(false)}
            onSave={() => void handleSave()}
            saving={saving}
            disabled={loading || loadError || selectedId === initialId}
          />
        }
      >
        <p className="text-xs text-muted-foreground">
          {t("sharing.folderLogin.description", { folder })}
        </p>
        {loading ? (
          <p className="py-4 text-center text-muted-foreground">
            {t("common.loading")}
          </p>
        ) : loadError ? (
          <p className="border border-destructive/30 bg-destructive/5 p-3 text-destructive">
            {t("hosts.sharing.authOverrideLoadError")}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <label
              htmlFor={`folder-login-${folder}`}
              className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
            >
              {t("hosts.sharing.authOverrideCredentialLabel")}
            </label>
            <Select2
              id={`folder-login-${folder}`}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
              className="flex h-9 w-full border border-border bg-background px-3 py-1 text-xs outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="">{t("sharing.folderLogin.none")}</option>
              {credentials.map((credential) => (
                <option key={credential.id} value={credential.id}>
                  {credential.username
                    ? `${credential.name} (${credential.username})`
                    : credential.name}
                </option>
              ))}
            </Select2>
            {credentials.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                {t("hosts.sharing.authOverrideNoCredentials")}
              </p>
            )}
            <p className="text-[10px] text-muted-foreground">
              {t("sharing.folderLogin.hint")}
            </p>
          </div>
        )}
      </InlineView>
    </span>
  );
}
