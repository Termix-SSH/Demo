import { useCallback, useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GitBranch, GitMerge, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  TextField,
  useConfirm,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { Branch } from "../shared/types";
import {
  checkout,
  createBranch,
  deleteBranch,
  errorMessage,
  getBranches,
  mergeBranch,
} from "./api";
import type { Runner } from "./runner";

/** Local and remote branches: switch, create, merge and delete. */
export function BranchesView({
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
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [failed, setFailed] = useState("");
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    try {
      setBranches(await getBranches(hostId, path));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("branches.loadFailed")));
    }
  }, [hostId, path, t]);

  useEffect(() => {
    void load();
  }, [load, tick]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!branches) return <LoadingState />;

  const current = branches.find((b) => b.current);
  const after = async (ok: boolean) => {
    if (ok) {
      await load();
      onChanged();
    }
  };

  const switchTo = (b: Branch) => {
    // A remote branch becomes a local one that tracks it.
    const local = b.remote ? b.name.replace(/^[^/]+\//, "") : b.name;
    return runner
      .run(
        t("branches.switch"),
        () => checkout(hostId, path, local, b.remote),
        t("branches.switched", { name: local }),
      )
      .then(after);
  };

  const merge = async (b: Branch) => {
    if (
      !(await confirm({
        title: t("branches.mergeTitle", {
          name: b.name,
          into: current?.name ?? "",
        }),
        description: t("branches.mergeBody"),
        confirmLabel: t("branches.merge"),
      }))
    )
      return;
    await after(
      await runner.run(
        t("branches.merge"),
        () => mergeBranch(hostId, path, b.name),
        t("branches.merged", { name: b.name }),
      ),
    );
  };

  const remove = async (b: Branch) => {
    if (
      !(await confirm({
        title: t("branches.deleteTitle", { name: b.name }),
        description: t("branches.deleteBody"),
        confirmLabel: t("branches.delete"),
      }))
    )
      return;
    let ok = await runner.run(
      t("branches.delete"),
      () => deleteBranch(hostId, path, b.name, false),
      t("branches.deleted", { name: b.name }),
    );
    if (!ok) {
      // An unmerged branch needs a second, explicit confirm.
      if (
        await confirm({
          title: t("branches.forceTitle", { name: b.name }),
          description: t("branches.forceBody"),
          confirmLabel: t("branches.forceDelete"),
        })
      ) {
        ok = await runner.run(
          t("branches.delete"),
          () => deleteBranch(hostId, path, b.name, true),
          t("branches.deleted", { name: b.name }),
        );
      }
    }
    await after(ok);
  };

  const create = async () => {
    const ok = await runner.run(
      t("branches.create"),
      () => createBranch(hostId, path, name.trim()),
      t("branches.created", { name: name.trim() }),
    );
    if (ok) setName("");
    await after(ok);
  };

  return (
    <div className="flex flex-col">
      {canEdit && (
        <ToolbarBand className="items-end">
          <div className="min-w-0 flex-1">
            <TextField
              label={t("branches.newName")}
              value={name}
              onChange={setName}
              placeholder="feature/my-change"
              mono
            />
          </div>
          <Button
            size="sm"
            disabled={runner.busy || !name.trim()}
            onClick={() => void create()}
          >
            {t("branches.create")}
          </Button>
        </ToolbarBand>
      )}
      <PanelList
        empty={
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            {t("branches.empty")}
          </p>
        }
      >
        {branches.map((b, index) => (
          <ListRow
            key={`${b.remote ? "r" : "l"}:${b.name}`}
            stripe={index}
            tone={b.current ? "brand" : b.remote ? "muted" : undefined}
            icon={<GitBranch className="size-4" />}
            title={<span className="font-mono">{b.name}</span>}
            badges={
              <>
                {b.current && (
                  <ListBadge tone="brand">{t("branches.current")}</ListBadge>
                )}
                {b.remote && (
                  <ListBadge tone="muted">{t("branches.remote")}</ListBadge>
                )}
                {b.ahead > 0 && (
                  <ListBadge>
                    <ArrowUp className="size-3" /> {b.ahead}
                  </ListBadge>
                )}
                {b.behind > 0 && (
                  <ListBadge tone="warning">
                    <ArrowDown className="size-3" /> {b.behind}
                  </ListBadge>
                )}
                {b.gone && (
                  <ListBadge tone="destructive">{t("branches.gone")}</ListBadge>
                )}
              </>
            }
            meta={[b.hash, b.subject, b.upstream && `-> ${b.upstream}`]
              .filter(Boolean)
              .join(" | ")}
            trailing={
              canEdit && !b.current ? (
                <Button
                  variant="ghost"
                  size="xs"
                  disabled={runner.busy}
                  onClick={(e) => {
                    e.stopPropagation();
                    void switchTo(b);
                  }}
                >
                  {t("branches.switch")}
                </Button>
              ) : undefined
            }
            actions={
              canEdit && !b.current ? (
                <>
                  <ListRowAction
                    label={t("branches.merge")}
                    onClick={(e) => {
                      e.stopPropagation();
                      void merge(b);
                    }}
                  >
                    <GitMerge className="size-3.5" />
                  </ListRowAction>
                  {!b.remote && (
                    <ListRowAction
                      label={t("branches.delete")}
                      tone="destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        void remove(b);
                      }}
                    >
                      <Trash2 className="size-3.5" />
                    </ListRowAction>
                  )}
                </>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
