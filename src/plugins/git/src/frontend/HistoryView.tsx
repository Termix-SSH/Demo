import { useCallback, useEffect, useState } from "react";
import { GitCommitHorizontal } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  InlineView,
  ListBadge,
  ListRow,
  PanelList,
  Segmented,
} from "@termix-ssh/plugin-sdk/ui";
import type { Commit, CommitDetail } from "../shared/types";
import { errorMessage, getCommit, getLog } from "./api";
import { DiffText } from "./DiffText";
import { ago } from "./format";
import { Loading } from "./Loading";

const PAGE = 50;

/** Commit history with a detail view for each commit. */
export function HistoryView({
  hostId,
  path,
  tick,
}: {
  hostId: number;
  path: string;
  tick: number;
}) {
  const { t, language } = useTranslation();
  const [scope, setScope] = useState<"branch" | "all">("branch");
  const [commits, setCommits] = useState<Commit[] | null>(null);
  const [more, setMore] = useState(false);
  const [failed, setFailed] = useState("");
  const [detail, setDetail] = useState<CommitDetail | null>(null);
  const [opening, setOpening] = useState<Commit | null>(null);

  const load = useCallback(
    async (skip: number) => {
      try {
        const list = await getLog(hostId, path, {
          all: scope === "all",
          skip,
        });
        setCommits((old) => (skip ? [...(old ?? []), ...list] : list));
        setMore(list.length === PAGE);
        setFailed("");
      } catch (e) {
        setFailed(errorMessage(e, t("history.loadFailed")));
      }
    },
    [hostId, path, scope, t],
  );

  useEffect(() => {
    setCommits(null);
    void load(0);
  }, [load, tick]);

  useEffect(() => {
    if (!opening) {
      setDetail(null);
      return;
    }
    let live = true;
    getCommit(hostId, path, opening.hash)
      .then((d) => live && setDetail(d))
      .catch(() => live && setOpening(null));
    return () => {
      live = false;
    };
  }, [opening, hostId, path]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!commits) return <Loading />;

  return (
    <div className="flex flex-col">
      <div className="border-b p-2">
        <Segmented<"branch" | "all">
          value={scope}
          onChange={setScope}
          options={[
            { value: "branch", label: t("history.branch") },
            { value: "all", label: t("history.all") },
          ]}
        />
      </div>
      <PanelList
        empty={
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            {t("history.empty")}
          </p>
        }
      >
        {commits.map((c, index) => (
          <ListRow
            key={c.hash}
            stripe={index}
            icon={<GitCommitHorizontal className="size-4" />}
            title={c.subject}
            badges={c.refs.slice(0, 3).map((r) => (
              <ListBadge key={r} tone="brand">
                {r}
              </ListBadge>
            ))}
            meta={`${c.short} | ${c.author} | ${ago(c.date, language)}`}
            onClick={() => setOpening(c)}
          />
        ))}
      </PanelList>
      {more && (
        <div className="p-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void load(commits.length)}
          >
            {t("history.more")}
          </Button>
        </div>
      )}
      <InlineView
        open={opening !== null}
        onOpenChange={(o) => !o && setOpening(null)}
        title={opening ? `${opening.short} ${opening.subject}` : ""}
        bare
      >
        {detail ? (
          <>
            <div className="border-b px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                {detail.commit.author} | {detail.commit.date}
              </p>
              {detail.body && (
                <p className="mt-1 whitespace-pre-wrap">{detail.body}</p>
              )}
              <pre className="mt-2 whitespace-pre-wrap font-mono">
                {detail.stat}
              </pre>
            </div>
            <DiffText text={detail.diff} />
            {detail.truncated && (
              <p className="px-3 py-2 text-xs text-muted-foreground">
                {t("changes.truncated")}
              </p>
            )}
          </>
        ) : (
          <Loading />
        )}
      </InlineView>
    </div>
  );
}
