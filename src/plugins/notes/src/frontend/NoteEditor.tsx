import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  Pin,
  PinOff,
  Quote,
  SquareCode,
  Trash2,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  BackButton,
  Button,
  Segmented,
  ToolbarBand,
  cn,
} from "@termix-ssh/plugin-sdk/ui";
import type { Note } from "../shared/types";
import { applyFormat, type FormatKind } from "./format";
import { NoteMarkdown } from "./Markdown";

type Mode = "write" | "preview" | "split";
export type Patch = Partial<Pick<Note, "title" | "body" | "tags" | "pinned">>;

const TOOLS: { kind: FormatKind; icon: typeof Bold; key: string }[] = [
  { kind: "heading", icon: Heading2, key: "format.heading" },
  { kind: "bold", icon: Bold, key: "format.bold" },
  { kind: "italic", icon: Italic, key: "format.italic" },
  { kind: "code", icon: Code, key: "format.code" },
  { kind: "codeblock", icon: SquareCode, key: "format.codeblock" },
  { kind: "list", icon: List, key: "format.list" },
  { kind: "task", icon: ListChecks, key: "format.task" },
  { kind: "quote", icon: Quote, key: "format.quote" },
  { kind: "link", icon: Link2, key: "format.link" },
];

const SAVE_DELAY = 800;

/**
 * One note: title, tags, a small toolbar and Write / Preview. Edits save
 * on their own after a short pause. Mount it with the note's uid as key.
 */
export function NoteEditor({
  note,
  compact,
  onSave,
  onDelete,
  onBack,
  onSend,
}: {
  note: Note;
  compact: boolean;
  onSave: (patch: Patch) => Promise<void>;
  onDelete: () => void;
  onBack?: () => void;
  onSend?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [tags, setTags] = useState(note.tags.join(", "));
  const [mode, setMode] = useState<Mode>(
    note.canEdit ? (note.body ? "preview" : "write") : "preview",
  );
  const [state, setState] = useState<"saved" | "saving" | "error">("saved");
  const area = useRef<HTMLTextAreaElement>(null);
  const pending = useRef<Patch>({});
  const timer = useRef<number | null>(null);
  const saveRef = useRef(onSave);
  saveRef.current = onSave;

  const flush = useCallback(async () => {
    if (timer.current !== null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
    const patch = pending.current;
    if (Object.keys(patch).length === 0) return;
    pending.current = {};
    setState("saving");
    try {
      await saveRef.current(patch);
      setState(Object.keys(pending.current).length ? "saving" : "saved");
    } catch {
      pending.current = { ...patch, ...pending.current };
      setState("error");
    }
  }, []);

  const queue = useCallback(
    (patch: Patch) => {
      pending.current = { ...pending.current, ...patch };
      setState("saving");
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void flush(), SAVE_DELAY);
    },
    [flush],
  );

  // Save what is left when the note is closed.
  useEffect(() => () => void flush(), [flush]);

  const edit = (kind: FormatKind) => {
    const el = area.current;
    if (!el) return;
    const result = applyFormat(kind, body, el.selectionStart, el.selectionEnd);
    setBody(result.value);
    queue({ body: result.value });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(result.start, result.end);
    });
  };

  const writable = note.canEdit;
  const showWrite = writable && (mode === "write" || mode === "split");
  const showPreview = mode === "preview" || mode === "split" || !writable;

  const modes = [
    { value: "write" as const, label: t("editor.write") },
    { value: "preview" as const, label: t("editor.preview") },
    ...(compact ? [] : [{ value: "split" as const, label: t("editor.split") }]),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12.5 shrink-0 items-center gap-1 border-b border-border pr-1.5">
        {onBack && (
          <div className="flex h-full shrink-0 border-r border-border">
            <BackButton
              onClick={() => {
                void flush();
                onBack();
              }}
              label={t("editor.back")}
            />
          </div>
        )}
        <input
          value={title}
          readOnly={!writable}
          onChange={(event) => {
            setTitle(event.target.value);
            queue({ title: event.target.value });
          }}
          placeholder={t("editor.titlePlaceholder")}
          aria-label={t("editor.title")}
          maxLength={200}
          className="min-w-0 flex-1 bg-transparent px-3 text-sm font-medium outline-none placeholder:text-muted-foreground"
        />
        <span
          className={cn(
            "shrink-0 text-[11px] text-muted-foreground",
            state === "error" && "text-destructive",
          )}
        >
          {t(`editor.state.${state}`)}
        </span>
        {writable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              onSave({ pinned: !note.pinned }).catch(() => setState("error"));
            }}
            title={note.pinned ? t("editor.unpin") : t("editor.pin")}
            aria-label={note.pinned ? t("editor.unpin") : t("editor.pin")}
          >
            {note.pinned ? (
              <PinOff className="size-4" />
            ) : (
              <Pin className="size-4" />
            )}
          </Button>
        )}
        {writable && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onDelete}
            title={t("editor.delete")}
            aria-label={t("editor.delete")}
          >
            <Trash2 className="size-4" />
          </Button>
        )}
      </div>

      <ToolbarBand>
        {writable && (
          <Segmented
            value={mode}
            onChange={(next) => setMode(next as Mode)}
            options={modes}
          />
        )}
        {showWrite && (
          <div className="flex items-center gap-0.5">
            {TOOLS.map(({ kind, icon: Icon, key }) => (
              <Button
                key={kind}
                variant="ghost"
                size="icon"
                onClick={() => edit(kind)}
                title={t(key)}
                aria-label={t(key)}
              >
                <Icon className="size-3.5" />
              </Button>
            ))}
          </div>
        )}
        <input
          value={tags}
          readOnly={!writable}
          onChange={(event) => {
            setTags(event.target.value);
            queue({
              tags: event.target.value
                .split(",")
                .map((tag) => tag.trim())
                .filter(Boolean),
            });
          }}
          placeholder={t("editor.tagsPlaceholder")}
          aria-label={t("editor.tags")}
          className="ml-auto min-w-24 max-w-48 flex-1 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
        />
      </ToolbarBand>

      <div
        className={cn(
          "grid min-h-0 flex-1",
          showWrite && showPreview ? "grid-cols-2" : "grid-cols-1",
        )}
      >
        {showWrite && (
          <textarea
            ref={area}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              queue({ body: event.target.value });
            }}
            placeholder={t("editor.bodyPlaceholder")}
            aria-label={t("editor.body")}
            spellCheck={false}
            className={cn(
              "h-full min-h-0 w-full resize-none bg-background p-3 font-mono text-xs leading-relaxed outline-none",
              showPreview && "border-r border-border",
            )}
          />
        )}
        {showPreview && (
          <div className="min-h-0 overflow-y-auto p-3">
            {body.trim() ? (
              <NoteMarkdown
                source={body}
                onSend={onSend}
                onChange={
                  writable
                    ? (next) => {
                        setBody(next);
                        queue({ body: next });
                      }
                    : undefined
                }
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                {t("editor.empty")}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
