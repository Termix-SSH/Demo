import { useCallback, useEffect, useState } from "react";
import { FileText, Minus, Plus, Undo2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InlineView,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  TextAreaField,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { FileChange, StatusView } from "../shared/types";
import {
  commit,
  discard,
  errorMessage,
  getDiff,
  getRepoStatus,
  stage,
  unstage,
} from "./api";
import { DiffText } from "./DiffText";
import { isStaged, isUnstaged, letter } from "./format";
import type { Runner } from "./runner";

type Open = { file: FileChange; mode: "tree" | "staged" | "untracked" };

/** Changed files with stage, unstage, discard, diffs and a commit box. */
export function ChangesView({
  hostId,
  path,
  canEdit,
  runner,
  tick,
  onChanged,
}: {
  hostId: number;
  path: string;
  canEdit: boolean;
  runner: Runner;
  tick: number;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [status, setStatus] = useState<StatusView | null>(null);
  const [failed, setFailed] = useState("");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState<Open | null>(null);
  const [diff, setDiff] = useState<{ text: string; truncated: boolean } | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      setStatus(await getRepoStatus(hostId, path));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("changes.loadFailed")));
    }
  }, [hostId, path, t]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  useEffect(() => {
    if (!open) {
      setDiff(null);
      return;
    }
    let live = true;
    getDiff(hostId, path, open.file.path, open.mode)
      .then((d) => live && setDiff(d))
      .catch(
        (e) =>
          live &&
          setDiff({
            text: errorMessage(e, t("changes.loadFailed")),
            truncated: false,
          }),
      );
    return () => {
      live = false;
    };
  }, [open, hostId, path, t]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!status) return <LoadingState />;

  const staged = status.files.filter(isStaged);
  const unstaged = status.files.filter(isUnstaged);

  const after = async (ok: boolean) => {
    if (ok) {
      await load();
      onChanged();
    }
  };

  const doCommit = async () => {
    const ok = await runner.run(
      t("changes.commit"),
      () => commit(hostId, path, message.trim(), staged.length === 0),
      t("changes.committed"),
    );
    if (ok) setMessage("");
    await after(ok);
  };

  const doDiscard = async (file: FileChange) => {
    if (
      !(await confirm({
        title: t("changes.discardTitle", { name: file.path }),
        description: t("changes.discardBody"),
        confirmLabel: t("changes.discard"),
      }))
    )
      return;
    await after(
      await runner.run(
        t("changes.discard"),
        () =>
          discard(
            hostId,
            path,
            file.untracked ? [] : [file.path],
            file.untracked ? [file.path] : [],
          ),
        t("changes.discarded"),
      ),
    );
  };

  const row = (file: FileChange, index: number, isStagedRow: boolean) => (
    <ListRow
      key={`${isStagedRow ? "s" : "u"}:${file.path}`}
      stripe={index}
      tone={file.conflict ? "destructive" : isStagedRow ? "success" : "warning"}
      icon={<FileText className="size-4" />}
      title={<span className="font-mono">{file.path}</span>}
      badges={
        <>
          <ListBadge tone={file.conflict ? "destructive" : "muted"}>
            {letter(isStagedRow ? file.index : file.tree) || "M"}
          </ListBadge>
          {file.from && <ListBadge>{t("changes.renamed")}</ListBadge>}
        </>
      }
      meta={file.from ?? ""}
      onClick={() =>
        setOpen({
          file,
          mode: isStagedRow ? "staged" : file.untracked ? "untracked" : "tree",
        })
      }
      trailing={
        canEdit ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={runner.busy}
            onClick={(e) => {
              e.stopPropagation();
              void (async () =>
                after(
                  await runner.run(
                    isStagedRow ? t("changes.unstage") : t("changes.stage"),
                    () =>
                      isStagedRow
                        ? unstage(hostId, path, [file.path])
                        : stage(hostId, path, [file.path]),
                    isStagedRow ? t("changes.unstaged") : t("changes.staged"),
                  ),
                ))();
            }}
          >
            {isStagedRow ? (
              <Minus className="size-3.5" />
            ) : (
              <Plus className="size-3.5" />
            )}
            {isStagedRow ? t("changes.unstage") : t("changes.stage")}
          </Button>
        ) : undefined
      }
      actions={
        canEdit && !isStagedRow ? (
          <ListRowAction
            label={t("changes.discard")}
            tone="destructive"
            onClick={(e) => {
              e.stopPropagation();
              void doDiscard(file);
            }}
          >
            <Undo2 className="size-3.5" />
          </ListRowAction>
        ) : undefined
      }
    />
  );

  const empty = (
    <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
      {t("changes.clean")}
    </p>
  );

  return (
    <div className="flex flex-col">
      {canEdit && (
        <div className="flex flex-col gap-2 border-b p-3">
          <TextAreaField
            label={t("changes.message")}
            value={message}
            onChange={setMessage}
            rows={3}
            placeholder={t("changes.messagePlaceholder")}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={
                runner.busy ||
                !message.trim() ||
                (staged.length === 0 && unstaged.every((f) => f.untracked))
              }
              onClick={() => void doCommit()}
            >
              {staged.length === 0
                ? t("changes.commitAll")
                : t("changes.commitStaged", { count: staged.length })}
            </Button>
            {unstaged.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                disabled={runner.busy}
                onClick={() =>
                  void (async () =>
                    after(
                      await runner.run(
                        t("changes.stageAll"),
                        () => stage(hostId, path, [], true),
                        t("changes.staged"),
                      ),
                    ))()
                }
              >
                {t("changes.stageAll")}
              </Button>
            )}
          </div>
        </div>
      )}
      {status.files.length === 0 ? (
        empty
      ) : (
        <>
          {staged.length > 0 && (
            <>
              <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                {t("changes.stagedTitle", { count: staged.length })}
              </p>
              <PanelList>{staged.map((f, i) => row(f, i, true))}</PanelList>
            </>
          )}
          {unstaged.length > 0 && (
            <>
              <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
                {t("changes.unstagedTitle", { count: unstaged.length })}
              </p>
              <PanelList>{unstaged.map((f, i) => row(f, i, false))}</PanelList>
            </>
          )}
        </>
      )}
      <InlineView
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        title={open?.file.path ?? ""}
        bare
      >
        {diff ? (
          <>
            <DiffText text={diff.text || t("changes.noDiff")} />
            {diff.truncated && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t("changes.truncated")}
              </p>
            )}
          </>
        ) : (
          <LoadingState />
        )}
      </InlineView>
    </div>
  );
}
