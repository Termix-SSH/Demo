import { useCallback, useEffect, useState } from "react";
import { CircleCheck, FileText, History, Link2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  ListRow,
  PanelList,
  PanelSearch,
  Segmented,
  TextAreaField,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { FileContent, ServerKind, WebStatus } from "../shared/types";
import { errorMessage, getFile, getFiles, saveFile, testConfig } from "./api";
import { SERVER_LABEL, formatSize } from "./format";
import { Loading } from "./Loading";
import type { Runner } from "./WebServersTab";

/** Every file under the server's folder, with a tested editor. */
export function ConfigView({
  hostId,
  status,
  runner,
}: {
  hostId: number;
  status: WebStatus;
  runner: Runner;
}) {
  const { t } = useTranslation();
  const kinds = status.servers
    .filter((s) => s.installed)
    .map((s) => s.kind) as ServerKind[];
  const [server, setServer] = useState<ServerKind>(kinds[0]);
  const [files, setFiles] = useState<Array<{
    path: string;
    size: number;
    link: boolean;
  }> | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setFiles(null);
    try {
      setFiles(await getFiles(hostId, server));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("config.loadFailed")));
    }
  }, [hostId, server, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async () => {
    try {
      const result = await testConfig(hostId, server);
      runner.show(
        result.ok ? t("config.testOk") : t("config.testFailed"),
        result.ok,
        result.output,
      );
    } catch (e) {
      runner.show(
        t("config.test"),
        false,
        errorMessage(e, t("actions.failed")),
      );
    }
  };

  if (open) {
    return (
      <FileEditor
        hostId={hostId}
        server={server}
        path={open}
        canEdit={status.canEdit}
        runner={runner}
        onBack={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  }

  const term = search.trim().toLowerCase();
  const shown = (files ?? []).filter(
    (f) => !term || f.path.toLowerCase().includes(term),
  );
  const root = status.servers.find((s) => s.kind === server)?.root ?? "";

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        {kinds.length > 1 && (
          <Segmented<ServerKind>
            value={server}
            onChange={(value) => {
              setServer(value);
              setOpen(null);
            }}
            options={kinds.map((value) => ({
              value,
              label: SERVER_LABEL[value],
            }))}
          />
        )}
        <span className="flex-1 truncate font-mono text-xs text-muted-foreground">
          {root}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={runner.busy}
          onClick={() => void test()}
        >
          <CircleCheck className="size-4" />
          {t("config.test")}
        </Button>
      </div>
      <PanelSearch
        value={search}
        onChange={setSearch}
        placeholder={t("config.search")}
      />
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !files ? (
        <Loading />
      ) : (
        <PanelList
          empty={
            <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
              {t("config.empty")}
            </p>
          }
        >
          {shown.map((file, index) => (
            <ListRow
              key={file.path}
              stripe={index}
              tone="muted"
              icon={
                file.link ? (
                  <Link2 className="size-4" />
                ) : (
                  <FileText className="size-4" />
                )
              }
              title={
                <span className="font-mono">
                  {file.path.slice(root.length + 1) || file.path}
                </span>
              }
              meta={formatSize(file.size)}
              onClick={() => setOpen(file.path)}
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}

function FileEditor({
  hostId,
  server,
  path,
  canEdit,
  runner,
  onBack,
}: {
  hostId: number;
  server: ServerKind;
  path: string;
  canEdit: boolean;
  runner: Runner;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [file, setFile] = useState<FileContent | null>(null);
  const [text, setText] = useState("");
  const [failed, setFailed] = useState("");
  const [showBackups, setShowBackups] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await getFile(hostId, server, path);
      setFile(data);
      setText(data.content);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("config.loadFailed")));
    }
  }, [hostId, server, path, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    const ok = await runner.run(
      t("config.save"),
      () => saveFile(hostId, server, file?.path ?? path, { content: text }),
      t("config.saved"),
    );
    if (ok) await load();
  };

  const restore = async (id: string, at: string) => {
    if (
      !(await confirm({
        title: t("config.restoreTitle"),
        description: t("config.restoreBody", {
          time: new Date(at).toLocaleString(),
        }),
        confirmLabel: t("config.restore"),
        destructive: false,
      }))
    )
      return;
    const ok = await runner.run(
      t("config.restore"),
      () => saveFile(hostId, server, file?.path ?? path, { backup: id }),
      t("config.restored"),
    );
    if (ok) {
      setShowBackups(false);
      await load();
    }
  };

  const changed = !!file && text !== file.content;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 border-b border-border px-2 py-1.5">
        <BackButton onClick={onBack} label={t("common.back")} />
        <span className="min-w-0 flex-1 truncate font-mono text-xs">
          {file?.path ?? path}
        </span>
        {file && file.backups.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBackups((v) => !v)}
          >
            <History className="size-4" />
            {t("config.backups", { count: file.backups.length })}
          </Button>
        )}
        {canEdit && (
          <Button
            size="sm"
            disabled={!changed || runner.busy}
            onClick={() => void save()}
          >
            {t("config.save")}
          </Button>
        )}
      </div>
      {failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !file ? (
        <Loading />
      ) : (
        <>
          {showBackups && (
            <PanelList>
              {file.backups.map((backup, index) => (
                <ListRow
                  key={backup.id}
                  stripe={index}
                  tone="muted"
                  icon={<History className="size-4" />}
                  title={new Date(backup.at).toLocaleString()}
                  meta={formatSize(backup.size)}
                  trailing={
                    canEdit ? (
                      <Button
                        variant="ghost"
                        size="xs"
                        disabled={runner.busy}
                        onClick={() => void restore(backup.id, backup.at)}
                      >
                        {t("config.restore")}
                      </Button>
                    ) : undefined
                  }
                />
              ))}
            </PanelList>
          )}
          <div className="p-3">
            <TextAreaField
              label={t("config.content")}
              hint={canEdit ? t("config.saveHint") : undefined}
              value={text}
              onChange={setText}
              rows={28}
              mono
              disabled={!canEdit}
            />
          </div>
        </>
      )}
    </div>
  );
}
