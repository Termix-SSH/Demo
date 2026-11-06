import { ArrowDown, ArrowUp, GitBranch, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { useState } from "react";
import type { RepoInfo } from "../shared/types";
import { ago, repoTone } from "./format";

/** The repos added to the host, with their state in a line each. */
export function RepoList({
  repos,
  canEdit,
  compact = false,
  onOpen,
  onRemove,
}: {
  repos: RepoInfo[];
  canEdit: boolean;
  compact?: boolean;
  onOpen: (repo: RepoInfo) => void;
  onRemove?: (repo: RepoInfo) => void;
}) {
  const { t, language } = useTranslation();
  const confirm = useConfirm();
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const shown = term
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(term) ||
          r.path.toLowerCase().includes(term),
      )
    : repos;

  return (
    <div className="flex flex-col">
      {!compact && repos.length > 5 && (
        <PanelSearch
          value={search}
          onChange={setSearch}
          placeholder={t("repos.search")}
        />
      )}
      <PanelList
        empty={
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            {term ? t("repos.noMatch") : t("repos.empty")}
          </p>
        }
      >
        {shown.map((repo, index) => (
          <ListRow
            key={repo.path}
            stripe={index}
            tone={repoTone(repo)}
            icon={<GitBranch className="size-4" />}
            title={<span className="font-mono">{repo.name}</span>}
            badges={
              <>
                {repo.error ? (
                  <ListBadge tone="destructive">
                    {t(`repos.error.${repo.error}`, {
                      defaultValue: t("repos.error.unreadable"),
                    })}
                  </ListBadge>
                ) : (
                  <>
                    <ListBadge tone="brand">
                      {repo.branch || t("repos.detached")}
                    </ListBadge>
                    {repo.ahead > 0 && (
                      <ListBadge>
                        <ArrowUp className="size-3" /> {repo.ahead}
                      </ListBadge>
                    )}
                    {repo.behind > 0 && (
                      <ListBadge tone="warning">
                        <ArrowDown className="size-3" /> {repo.behind}
                      </ListBadge>
                    )}
                    {repo.changed + repo.untracked > 0 && (
                      <ListBadge tone="warning">
                        {t("repos.changes", {
                          count: repo.changed + repo.untracked,
                        })}
                      </ListBadge>
                    )}
                    {repo.conflicts > 0 && (
                      <ListBadge tone="destructive">
                        {t("repos.conflicts")}
                      </ListBadge>
                    )}
                    {repo.auto?.enabled && (
                      <ListBadge
                        tone={repo.auto.failing ? "destructive" : "muted"}
                      >
                        {repo.auto.failing
                          ? t("repos.autoFailing")
                          : t("repos.auto")}
                      </ListBadge>
                    )}
                  </>
                )}
              </>
            }
            meta={
              compact
                ? ""
                : [
                    repo.path,
                    repo.last
                      ? `${repo.last.subject} (${ago(repo.last.date, language)})`
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" | ")
            }
            onClick={() => onOpen(repo)}
            actions={
              canEdit && !compact && onRemove ? (
                <ListRowAction
                  label={t("repos.remove")}
                  tone="destructive"
                  onClick={(e) => {
                    e.stopPropagation();
                    void (async () => {
                      if (
                        await confirm({
                          title: t("repos.removeTitle", { name: repo.name }),
                          description: t("repos.removeBody"),
                          confirmLabel: t("repos.remove"),
                        })
                      )
                        onRemove(repo);
                    })();
                  }}
                >
                  <Trash2 className="size-3.5" />
                </ListRowAction>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
