import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Newspaper, Plus, X } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  Button,
  EmptyState,
  Field,
  FormFooter,
  InlineView,
  ListBadge,
  ListRow,
  LoadingState,
  NoticePanel,
  PanelList,
  SectionCard,
  SelectField,
  SwitchRow,
  TextField,
  Textarea,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  MonitorView,
  NoteLevel,
  StatusNoteView,
  StatusPageInput,
  StatusPageView,
} from "../shared/types";
import {
  addNote,
  deleteNote,
  deletePage,
  errorMessage,
  listNotes,
  listPages,
  resolveNote,
  savePage,
} from "./api";
import { whenText } from "./format";
import { MonitorPicker } from "./MonitorPicker";

function blank(): StatusPageInput {
  return {
    slug: "",
    title: "",
    description: "",
    published: false,
    showLatency: false,
    groups: [{ name: "", monitorKeys: [] }],
  };
}

function Notes({ pageId }: { pageId: number }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [notes, setNotes] = useState<StatusNoteView[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [level, setLevel] = useState<NoteLevel>("info");

  const load = useCallback(async () => {
    setNotes(await listNotes(pageId).catch(() => []));
  }, [pageId]);
  useEffect(() => {
    void load();
  }, [load]);

  const run = async (work: () => Promise<void>) => {
    try {
      await work();
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("detail.failed")));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <TextField
        label={t("pages.noteTitle")}
        value={title}
        onChange={setTitle}
      />
      <Field label={t("pages.noteBody")}>
        <Textarea
          value={body}
          rows={3}
          onChange={(event) => setBody(event.target.value)}
        />
      </Field>
      <div className="flex items-end gap-2">
        <SelectField<NoteLevel>
          className="min-w-0 flex-1"
          label={t("pages.noteLevel")}
          value={level}
          onChange={setLevel}
          options={[
            { value: "info", label: t("pages.levelInfo") },
            { value: "warning", label: t("pages.levelWarning") },
            { value: "critical", label: t("pages.levelCritical") },
          ]}
        />
        <Button
          disabled={!title.trim()}
          onClick={() =>
            void run(async () => {
              await addNote(pageId, { title, body, level });
              setTitle("");
              setBody("");
            })
          }
        >
          {t("pages.post")}
        </Button>
      </div>
      {notes.map((note) => (
        <div key={note.id} className="border-t border-border pt-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">{note.title}</span>
            <span className="flex shrink-0 gap-1">
              {note.resolvedAt ? null : (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => void run(() => resolveNote(pageId, note.id))}
                >
                  {t("pages.resolve")}
                </Button>
              )}
              <Button
                variant="ghost"
                size="xs"
                onClick={() => void run(() => deleteNote(pageId, note.id))}
              >
                {t("common.delete")}
              </Button>
            </span>
          </div>
          <p className="text-muted-foreground">
            {whenText(note.createdAt)}
            {note.resolvedAt ? ` | ${t("pages.resolved")}` : ""}
          </p>
        </div>
      ))}
    </div>
  );
}

function PageEditor({
  page,
  monitors,
  onClose,
  onSaved,
}: {
  page: StatusPageView | "new";
  monitors: MonitorView[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<StatusPageInput>(
    page === "new" ? blank() : page,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (patch: Partial<StatusPageInput>) =>
    setForm((current) => ({ ...current, ...patch }));
  const setGroup = (
    index: number,
    patch: Partial<StatusPageInput["groups"][number]>,
  ) =>
    set({
      groups: form.groups.map((group, at) =>
        at === index ? { ...group, ...patch } : group,
      ),
    });

  const save = async () => {
    setSaving(true);
    try {
      await savePage(form, page === "new" ? undefined : page.id);
      await onSaved();
      onClose();
    } catch (e) {
      setError(errorMessage(e, t("editor.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const usable = monitors.filter((monitor) => monitor.access !== "view");
  return (
    <InlineView
      open
      onOpenChange={(next) => !next && onClose()}
      title={t(page === "new" ? "pages.add" : "pages.edit")}
      stacked
      footer={
        <FormFooter
          onCancel={onClose}
          onSave={() => void save()}
          saveLabel={t("common.save")}
          cancelLabel={t("common.cancel")}
          saving={saving}
          status={
            error ? <span className="text-destructive">{error}</span> : null
          }
        />
      }
    >
      <SectionCard
        title={t("pages.about")}
        icon={<Newspaper className="size-4" />}
      >
        <div className="flex flex-col gap-3">
          <TextField
            label={t("pages.title")}
            value={form.title}
            onChange={(title) => set({ title })}
          />
          <TextField
            label={t("pages.slug")}
            value={form.slug}
            onChange={(slug) => set({ slug })}
            hint={t("pages.slugHint")}
            mono
          />
          <Field label={t("pages.description")}>
            <Textarea
              value={form.description ?? ""}
              rows={2}
              onChange={(event) => set({ description: event.target.value })}
            />
          </Field>
          <SwitchRow
            label={t("pages.published")}
            description={t("pages.publishedHint")}
            checked={form.published === true}
            onChange={(published) => set({ published })}
          />
          <SwitchRow
            label={t("pages.showLatency")}
            checked={form.showLatency === true}
            onChange={(showLatency) => set({ showLatency })}
          />
        </div>
      </SectionCard>
      {form.groups.map((group, index) => (
        <SectionCard
          key={index}
          title={group.name || t("pages.group", { number: index + 1 })}
          icon={<Plus className="size-4" />}
          action={
            form.groups.length > 1 ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.delete")}
                onClick={() =>
                  set({ groups: form.groups.filter((_, at) => at !== index) })
                }
              >
                <X className="size-4" />
              </Button>
            ) : undefined
          }
        >
          <div className="flex flex-col gap-3">
            <TextField
              label={t("pages.groupName")}
              value={group.name}
              onChange={(name) => setGroup(index, { name })}
            />
            <MonitorPicker
              monitors={usable}
              picked={group.monitorKeys}
              onChange={(monitorKeys) => setGroup(index, { monitorKeys })}
            />
          </div>
        </SectionCard>
      ))}
      <div className="px-3 py-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            set({ groups: [...form.groups, { name: "", monitorKeys: [] }] })
          }
        >
          {t("pages.addGroup")}
        </Button>
      </div>
      {page !== "new" ? (
        <SectionCard
          title={t("pages.notes")}
          icon={<Newspaper className="size-4" />}
        >
          <Notes pageId={page.id} />
        </SectionCard>
      ) : null}
    </InlineView>
  );
}

export function StatusPagesView({
  monitors,
  publicPages,
}: {
  monitors: MonitorView[];
  publicPages: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [pages, setPages] = useState<StatusPageView[] | null>(null);
  const [editing, setEditing] = useState<StatusPageView | "new" | null>(null);

  const load = useCallback(async () => {
    try {
      setPages(await listPages());
    } catch (e) {
      toast.error(errorMessage(e, t("tab.error")));
    }
  }, [t, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (page: StatusPageView) => {
    const yes = await confirm({
      title: t("pages.deleteTitle", { name: page.title }),
      confirmLabel: t("common.delete"),
    });
    if (!yes) return;
    await deletePage(page.id);
    await load();
  };

  if (pages === null) return <LoadingState label={t("common.loading")} />;

  return (
    <div className="flex min-h-0 flex-col">
      {publicPages ? null : (
        <NoticePanel tone="warning" title={t("pages.offTitle")}>
          {t("pages.offHint")}
        </NoticePanel>
      )}
      <div className="flex justify-end border-b border-border px-3 py-2">
        <AddButton label={t("pages.add")} onClick={() => setEditing("new")} />
      </div>
      {pages.length === 0 ? (
        <EmptyState
          icon={Newspaper}
          title={t("pages.none")}
          hint={t("pages.noneHint")}
        />
      ) : (
        <PanelList>
          {pages.map((page) => (
            <ListRow
              key={page.id}
              title={page.title}
              meta={page.url}
              onClick={() => setEditing(page)}
              badges={
                <ListBadge tone={page.published ? "success" : "muted"}>
                  {t(page.published ? "pages.live" : "pages.draft")}
                </ListBadge>
              }
              trailing={
                <span className="flex gap-1">
                  {page.published ? (
                    <Button variant="ghost" size="icon-sm" asChild>
                      <a
                        href={page.url}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={t("pages.open")}
                        onClick={(event) => event.stopPropagation()}
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </Button>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      void remove(page);
                    }}
                  >
                    {t("common.delete")}
                  </Button>
                </span>
              }
            />
          ))}
        </PanelList>
      )}
      {editing ? (
        <PageEditor
          page={editing}
          monitors={monitors}
          onClose={() => setEditing(null)}
          onSaved={load}
        />
      ) : null}
    </div>
  );
}
