import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileText, Folder, Globe, Pin, Server } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Badge,
  EmptyState,
  ListRow,
  LoadingState,
  PanelList,
  PanelSearch,
  Segmented,
  ToolbarBand,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import { toast } from "sonner";
import type { Note, NoteSummary, Scope } from "../shared/types";
import {
  createNote,
  deleteNote,
  errorMessage,
  getNote,
  listNotes,
  searchNotes,
  updateNote,
} from "./api";
import { NoteEditor, type Patch } from "./NoteEditor";

type View = Scope | "all";

export interface NotesHost {
  id: number | string;
  name?: string | null;
  folder?: string | null;
}

const SCOPE_ICON = { host: Server, folder: Folder, global: Globe } as const;

/**
 * The notes of a host, its folder or the user, with search across all of
 * them. The same view is the full tab and the terminal panel (compact).
 */
export function NotesView({
  host,
  isVisible,
  compact,
  onSend,
}: {
  host?: NotesHost | null;
  isVisible: boolean;
  compact: boolean;
  onSend?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const hostId = host?.id !== undefined ? Number(host.id) : undefined;
  const folder = host?.folder?.trim() || undefined;

  const [view, setView] = useState<View>(hostId ? "host" : "global");
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<NoteSummary[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [openUid, setOpenUid] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);
  const loadSeq = useRef(0);

  const load = useCallback(async () => {
    // A slow answer for an older view or query must not replace a newer one.
    const seq = ++loadSeq.current;
    try {
      const q = query.trim();
      const list =
        view === "all"
          ? await searchNotes(q)
          : await listNotes({
              scope: view,
              hostId: view === "host" ? hostId : undefined,
              folder: view === "folder" ? folder : undefined,
              q: q || undefined,
            });
      if (seq !== loadSeq.current) return;
      setItems(list);
      setFailed(false);
    } catch {
      if (seq !== loadSeq.current) return;
      setFailed(true);
      setItems((current) => current ?? []);
    }
  }, [view, hostId, folder, query]);

  useEffect(() => {
    if (!isVisible) return;
    const handle = window.setTimeout(() => void load(), query ? 250 : 0);
    return () => window.clearTimeout(handle);
  }, [isVisible, load, query]);

  useEffect(() => {
    if (!openUid) {
      setNote(null);
      return;
    }
    let live = true;
    getNote(openUid)
      .then((loaded) => live && setNote(loaded))
      .catch((error) => {
        if (!live) return;
        toast.error(errorMessage(error, t("error.open")));
        setOpenUid(null);
      });
    return () => {
      live = false;
    };
  }, [openUid, t]);

  const canCreate =
    view === "global" ||
    (view === "host" && hostId !== undefined) ||
    (view === "folder" && folder !== undefined);

  const create = async () => {
    if (view === "all") return;
    try {
      const made = await createNote({
        scope: view,
        hostId: view === "host" ? hostId : null,
        folder: view === "folder" ? (folder ?? null) : null,
        title: t("editor.newTitle"),
        body: "",
        tags: [],
        pinned: false,
      });
      setNote(made);
      setOpenUid(made.uid);
      void load();
    } catch (error) {
      toast.error(errorMessage(error, t("error.create")));
    }
  };

  // Takes the editor's own uid: a closing editor flushes after openUid moved on.
  const save = useCallback(
    async (uid: string, patch: Patch) => {
      const updated = await updateNote(uid, patch);
      setNote((current) =>
        current && current.uid === updated.uid
          ? {
              ...current,
              pinned: updated.pinned,
              updatedAt: updated.updatedAt,
            }
          : current,
      );
      setItems((current) =>
        current
          ? current.map((item) =>
              item.uid === updated.uid
                ? {
                    ...item,
                    title: updated.title,
                    excerpt: updated.excerpt,
                    tags: updated.tags,
                    pinned: updated.pinned,
                    updatedAt: updated.updatedAt,
                  }
                : item,
            )
          : current,
      );
      if (patch.pinned !== undefined) void load();
    },
    [load],
  );

  const remove = async () => {
    if (!note) return;
    const ok = await confirm({
      title: t("delete.title", { title: note.title }),
      description: t("delete.description"),
      confirmLabel: t("editor.delete"),
    });
    if (!ok) return;
    try {
      await deleteNote(note.uid);
      setOpenUid(null);
      void load();
    } catch (error) {
      toast.error(errorMessage(error, t("error.delete")));
    }
  };

  const options = useMemo(() => {
    const list: { value: View; label: string }[] = [];
    if (hostId !== undefined)
      list.push({ value: "host", label: t("scope.host") });
    if (folder) list.push({ value: "folder", label: t("scope.folder") });
    list.push({ value: "global", label: t("scope.global") });
    list.push({ value: "all", label: t("scope.all") });
    return list;
  }, [hostId, folder, t]);

  const showList = !compact || !openUid;
  const showEditor = !compact || Boolean(openUid);

  const list = (
    <div
      className={
        compact
          ? "flex h-full min-h-0 w-full flex-col"
          : "flex h-full min-h-0 w-72 shrink-0 flex-col border-r border-border"
      }
    >
      <ToolbarBand className="flex-nowrap">
        <PanelSearch
          value={query}
          onChange={setQuery}
          placeholder={t("search.placeholder")}
          fill
        />
        {canCreate && <AddButton label={t("new")} compact onClick={create} />}
      </ToolbarBand>
      <ToolbarBand>
        <Segmented
          value={view}
          onChange={(next) => setView(next as View)}
          options={options}
        />
      </ToolbarBand>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {items === null ? (
          <LoadingState compact />
        ) : failed && items.length === 0 ? (
          <EmptyState icon={FileText} title={t("error.load")} />
        ) : (
          <PanelList
            empty={
              <EmptyState
                icon={FileText}
                title={query ? t("empty.search") : t("empty.title")}
                hint={query ? undefined : t(`empty.hint.${view}`)}
              />
            }
          >
            {items.map((item) => {
              const Icon = SCOPE_ICON[item.scope];
              return (
                <ListRow
                  key={item.uid}
                  title={item.title}
                  icon={
                    item.pinned ? (
                      <Pin className="size-3.5 text-accent-brand" />
                    ) : (
                      <Icon className="size-3.5 text-muted-foreground" />
                    )
                  }
                  meta={item.excerpt || t("empty.note")}
                  badges={
                    item.tags.length ? (
                      <>
                        {item.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} variant="secondary">
                            {tag}
                          </Badge>
                        ))}
                      </>
                    ) : undefined
                  }
                  active={item.uid === openUid}
                  onClick={() => setOpenUid(item.uid)}
                />
              );
            })}
          </PanelList>
        )}
      </div>
    </div>
  );

  const editor = note ? (
    <NoteEditor
      key={note.uid}
      note={note}
      compact={compact}
      onSave={(patch) => save(note.uid, patch)}
      onDelete={() => void remove()}
      onBack={compact ? () => setOpenUid(null) : undefined}
      onSend={onSend}
    />
  ) : openUid ? (
    <LoadingState compact />
  ) : (
    <EmptyState icon={FileText} title={t("editor.pick")} />
  );

  return (
    <div className="flex h-full min-h-0 w-full">
      {showList && list}
      {showEditor && <div className="h-full min-w-0 flex-1">{editor}</div>}
    </div>
  );
}
