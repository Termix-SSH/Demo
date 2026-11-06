import { useEffect, useState } from "react";
import { GitBranch } from "lucide-react";
import { useTranslation, useToast } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  ListRow,
  PanelList,
  PanelShell,
  RefreshButton,
  Segmented,
  TextField,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { GitStatus } from "../shared/types";
import { addRepos, cloneRepo, discover, errorMessage } from "./api";
import type { Runner } from "./runner";

type Mode = "scan" | "path" | "clone";

/** Add repos by scanning the host, by folder, or by cloning. */
export function AddRepoView({
  hostId,
  status,
  runner,
  onClose,
}: {
  hostId: number;
  status: GitStatus;
  runner: Runner;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [mode, setMode] = useState<Mode>("scan");
  const [found, setFound] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [scanning, setScanning] = useState(false);
  const [folder, setFolder] = useState("");
  const [url, setUrl] = useState("");
  const [dest, setDest] = useState("");

  const scan = async () => {
    setScanning(true);
    try {
      setFound(await discover(hostId));
      setPicked(new Set());
    } catch (e) {
      toast.error(errorMessage(e, t("add.scanFailed")));
      setFound([]);
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (mode === "scan" && found === null) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const add = async (paths: string[]) => {
    try {
      await addRepos(hostId, paths);
      toast.success(t("add.added", { count: paths.length }));
      onClose();
    } catch (e) {
      toast.error(errorMessage(e, t("add.failed")));
    }
  };

  const clone = async () => {
    const ok = await runner.run(
      t("add.clone"),
      () => cloneRepo(hostId, url.trim(), dest.trim()),
      t("add.cloned"),
    );
    if (ok) onClose();
  };

  const toggle = (path: string) =>
    setPicked((old) => {
      const next = new Set(old);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  return (
    <PanelShell
      icon={<GitBranch className="size-4" />}
      leading={<BackButton onClick={onClose} label={t("common.back")} />}
      title={t("add.title")}
      actions={
        mode === "scan" ? (
          <RefreshButton
            onClick={() => void scan()}
            loading={scanning}
            label={t("add.rescan")}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col gap-3 p-3">
        <Segmented<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { value: "scan", label: t("add.modeScan") },
            { value: "path", label: t("add.modePath") },
            { value: "clone", label: t("add.modeClone") },
          ]}
        />
        {mode === "scan" && (
          <>
            <p className="text-xs text-muted-foreground">
              {t("add.scanHint", { roots: status.roots.join(", ") })}
            </p>
            {found === null ? (
              <LoadingState />
            ) : (
              <>
                <PanelList
                  empty={
                    <p className="py-4 text-center text-xs text-muted-foreground/60">
                      {t("add.noneFound")}
                    </p>
                  }
                >
                  {found.map((path, index) => (
                    <ListRow
                      key={path}
                      stripe={index}
                      tone={picked.has(path) ? "brand" : undefined}
                      title={<span className="font-mono">{path}</span>}
                      onClick={() => toggle(path)}
                      badges={
                        picked.has(path) ? (
                          <span className="text-xs">{t("add.picked")}</span>
                        ) : undefined
                      }
                    />
                  ))}
                </PanelList>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    disabled={picked.size === 0}
                    onClick={() => void add([...picked])}
                  >
                    {t("add.addPicked", { count: picked.size })}
                  </Button>
                  {found.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void add(found)}
                    >
                      {t("add.addAll")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </>
        )}
        {mode === "path" && (
          <>
            <TextField
              label={t("add.folder")}
              hint={t("add.folderHint")}
              value={folder}
              onChange={setFolder}
              placeholder="~/projects/app"
              mono
            />
            <div>
              <Button
                size="sm"
                disabled={!folder.trim()}
                onClick={() => void add([folder.trim()])}
              >
                {t("add.addRepo")}
              </Button>
            </div>
          </>
        )}
        {mode === "clone" && (
          <>
            <TextField
              label={t("add.url")}
              hint={t("add.urlHint")}
              value={url}
              onChange={setUrl}
              placeholder="git@github.com:owner/repo.git"
              mono
            />
            <TextField
              label={t("add.dest")}
              hint={t("add.destHint")}
              value={dest}
              onChange={setDest}
              placeholder="~/projects/repo"
              mono
            />
            <div>
              <Button
                size="sm"
                disabled={runner.busy || !url.trim() || !dest.trim()}
                onClick={() => void clone()}
              >
                {t("add.clone")}
              </Button>
            </div>
          </>
        )}
      </div>
    </PanelShell>
  );
}
