import { useCallback, useEffect, useState } from "react";
import { Archive, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListRow,
  ListRowAction,
  PanelList,
  SwitchRow,
  TextField,
  useConfirm,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { Remote, StashEntry } from "../shared/types";
import { errorMessage, getRemotes, getStashes, stash } from "./api";
import type { Runner } from "./runner";

/** Stashes and remotes of a repo. */
export function StashView({
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
  const [stashes, setStashes] = useState<StashEntry[] | null>(null);
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [failed, setFailed] = useState("");
  const [message, setMessage] = useState("");
  const [untracked, setUntracked] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, r] = await Promise.all([
        getStashes(hostId, path),
        getRemotes(hostId, path),
      ]);
      setStashes(s);
      setRemotes(r);
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("stash.loadFailed")));
    }
  }, [hostId, path, t]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!stashes) return <LoadingState />;

  const act = async (
    op: "push" | "pop" | "apply" | "drop",
    entry?: StashEntry,
  ) => {
    if (op === "drop") {
      if (
        !(await confirm({
          title: t("stash.dropTitle", { name: entry?.name ?? "" }),
          description: t("stash.dropBody"),
          confirmLabel: t("stash.drop"),
        }))
      )
        return;
    }
    const ok = await runner.run(
      t(`stash.${op}`),
      () =>
        stash(hostId, path, op, {
          index: entry?.index,
          message: op === "push" ? message.trim() : undefined,
          untracked: op === "push" ? untracked : undefined,
        }),
      t(`stash.${op}Done`),
    );
    if (ok) {
      if (op === "push") setMessage("");
      await load();
      onChanged();
    }
  };

  return (
    <div className="flex flex-col">
      {canEdit && (
        <div className="flex flex-col gap-2 border-b p-3">
          <TextField
            label={t("stash.message")}
            value={message}
            onChange={setMessage}
            placeholder={t("stash.messagePlaceholder")}
          />
          <SwitchRow
            label={t("stash.untracked")}
            checked={untracked}
            onChange={setUntracked}
          />
          <div>
            <Button
              size="sm"
              disabled={runner.busy}
              onClick={() => void act("push")}
            >
              {t("stash.push")}
            </Button>
          </div>
        </div>
      )}
      <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
        {t("stash.title")}
      </p>
      <PanelList
        empty={
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {t("stash.empty")}
          </p>
        }
      >
        {stashes.map((s, index) => (
          <ListRow
            key={s.name}
            stripe={index}
            icon={<Archive className="size-4" />}
            title={s.message || s.name}
            meta={s.name}
            trailing={
              canEdit ? (
                <>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={runner.busy}
                    onClick={() => void act("apply", s)}
                  >
                    {t("stash.apply")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={runner.busy}
                    onClick={() => void act("pop", s)}
                  >
                    {t("stash.pop")}
                  </Button>
                </>
              ) : undefined
            }
            actions={
              canEdit ? (
                <ListRowAction
                  label={t("stash.drop")}
                  tone="destructive"
                  onClick={() => void act("drop", s)}
                >
                  <Trash2 className="size-3.5" />
                </ListRowAction>
              ) : undefined
            }
          />
        ))}
      </PanelList>
      <p className="px-3 pt-2 text-xs font-medium text-muted-foreground">
        {t("stash.remotes")}
      </p>
      <PanelList
        empty={
          <p className="px-3 py-4 text-center text-xs text-muted-foreground/60">
            {t("stash.noRemotes")}
          </p>
        }
      >
        {remotes.map((r, index) => (
          <ListRow
            key={r.name}
            stripe={index}
            title={<span className="font-mono">{r.name}</span>}
            meta={r.fetch === r.push ? r.fetch : `${r.fetch} | ${r.push}`}
          />
        ))}
      </PanelList>
    </div>
  );
}
