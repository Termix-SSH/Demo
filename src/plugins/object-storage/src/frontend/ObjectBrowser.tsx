import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
  Download,
  File as FileIcon,
  Folder,
  FolderPlus,
  Link2,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  copyToClipboard,
  EmptyState,
  Input,
  ListRow,
  ListRowAction,
  LoadingState,
  PanePrompt,
  PanelList,
  RefreshButton,
  useConfirm,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { Listing, ObjectHead, ObjectRow } from "../shared/types";
import { saveBlob, errorMessage, type Api } from "./api";
import {
  baseName,
  crumbs,
  formatBytes,
  formatDate,
  isPreviewImage,
  isPreviewText,
} from "./format";

type Prompt =
  | { kind: "folder" }
  | { kind: "rename" | "copy"; key: string; folder: boolean }
  | { kind: "share"; key: string };

interface Transfer {
  id: number;
  name: string;
  fraction: number;
  error?: string;
}

const SHARE_CHOICES = [
  { seconds: 3600, key: "share.hour" },
  { seconds: 86_400, key: "share.day" },
  { seconds: 604_800, key: "share.week" },
];

export function ObjectBrowser({
  api,
  accountId,
  bucket,
  canEdit,
}: {
  api: Api;
  accountId: number;
  bucket: string;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [prefix, setPrefix] = useState("");
  const [listing, setListing] = useState<Listing | null>(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [value, setValue] = useState("");
  const [seconds, setSeconds] = useState(3600);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [detail, setDetail] = useState<{
    head: ObjectHead;
    image?: string;
    text?: string;
  } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const counter = useRef(0);
  const preview = useRef<string | null>(null);

  const load = useCallback(
    async (target: string, more?: string) => {
      setLoading(true);
      try {
        const page = await api.objects(accountId, bucket, {
          prefix: target,
          token: more,
        });
        setListing((current) =>
          more && current
            ? {
                ...page,
                folders: current.folders,
                objects: [...current.objects, ...page.objects],
              }
            : page,
        );
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoading(false);
      }
    },
    [api, accountId, bucket],
  );

  useEffect(() => {
    void load(prefix);
  }, [load, prefix]);

  useEffect(
    () => () => {
      if (preview.current) URL.revokeObjectURL(preview.current);
    },
    [],
  );

  function open(target: string) {
    setFilter("");
    setDetail(null);
    setPrefix(target);
  }

  const folders = useMemo(
    () =>
      (listing?.folders ?? []).filter((folder) =>
        baseName(folder).toLowerCase().includes(filter.toLowerCase()),
      ),
    [listing, filter],
  );
  const objects = useMemo(
    () =>
      (listing?.objects ?? []).filter(
        (item) =>
          item.key !== prefix &&
          baseName(item.key).toLowerCase().includes(filter.toLowerCase()),
      ),
    [listing, filter, prefix],
  );

  async function uploadFiles(files: Array<{ file: File; name: string }>) {
    for (const { file, name } of files) {
      const id = ++counter.current;
      setTransfers((current) => [...current, { id, name, fraction: 0 }]);
      try {
        await api.upload(accountId, bucket, prefix, file, name, (fraction) =>
          setTransfers((current) =>
            current.map((item) =>
              item.id === id ? { ...item, fraction } : item,
            ),
          ),
        );
        setTransfers((current) => current.filter((item) => item.id !== id));
      } catch (error) {
        setTransfers((current) =>
          current.map((item) =>
            item.id === id ? { ...item, error: errorMessage(error) } : item,
          ),
        );
      }
    }
    await load(prefix);
  }

  function pickFiles(list: FileList | null, keepPath: boolean) {
    if (!list?.length) return;
    void uploadFiles(
      [...list].map((file) => ({
        file,
        name:
          keepPath && file.webkitRelativePath
            ? file.webkitRelativePath
            : file.name,
      })),
    );
  }

  async function download(item: ObjectRow) {
    try {
      saveBlob(await api.blob(accountId, bucket, item.key), baseName(item.key));
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function show(item: ObjectRow) {
    try {
      const head = await api.head(accountId, bucket, item.key);
      const next: { head: ObjectHead; image?: string; text?: string } = {
        head,
      };
      if (preview.current) URL.revokeObjectURL(preview.current);
      preview.current = null;
      if (isPreviewImage(item.key) && head.size < 20 * 1024 * 1024) {
        const blob = await api.blob(accountId, bucket, item.key, true);
        preview.current = URL.createObjectURL(blob);
        next.image = preview.current;
      } else if (isPreviewText(item.key) && head.size < 256 * 1024) {
        next.text = await (
          await api.blob(accountId, bucket, item.key, true)
        ).text();
      }
      setDetail(next);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function remove(key: string, folder: boolean) {
    const ok = await confirm({
      title: t(folder ? "objects.deleteFolder" : "objects.deleteObject", {
        name: baseName(key),
      }),
      description: folder ? t("objects.deleteFolderHint") : undefined,
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      const result = await api.remove(
        accountId,
        bucket,
        folder ? { prefixes: [key] } : { keys: [key] },
      );
      if (result.failed.length) {
        toast.error(t("objects.deleteFailed", { count: result.failed.length }));
      }
      setDetail(null);
      await load(prefix);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  function ask(next: Prompt) {
    setPrompt(next);
    setValue(
      next.kind === "folder"
        ? ""
        : next.kind === "share"
          ? ""
          : next.key.replace(/\/$/, ""),
    );
  }

  async function submit() {
    if (!prompt) return;
    const current = prompt;
    try {
      if (current.kind === "folder") {
        const name = value.trim().replace(/^\/+|\/+$/g, "");
        if (!name) return;
        await api.makeFolder(accountId, bucket, `${prefix}${name}`);
      } else if (current.kind === "share") {
        const link = await api.share(accountId, bucket, current.key, seconds);
        await copyToClipboard(link.url);
        toast.success(t("share.copied"));
      } else {
        const to = value.trim();
        if (!to || to === current.key.replace(/\/$/, "")) return;
        const run = current.kind === "rename" ? api.move : api.copy;
        await run(accountId, bucket, {
          from: current.key,
          to,
          folder: current.folder,
        });
      }
      setPrompt(null);
      await load(prefix);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const empty =
    !!listing && !folders.length && !objects.length && !loading && !detail;

  return (
    <div
      className="flex h-full min-h-0 flex-col"
      onDragOver={(event) => canEdit && event.preventDefault()}
      onDrop={(event) => {
        if (!canEdit) return;
        event.preventDefault();
        pickFiles(event.dataTransfer.files, false);
      }}
    >
      <ToolbarBand>
        <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            className="font-medium hover:underline"
            onClick={() => open("")}
          >
            {bucket}
          </button>
          {crumbs(prefix).map((crumb) => (
            <span key={crumb.prefix} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-muted-foreground" />
              <button
                type="button"
                className="hover:underline"
                onClick={() => open(crumb.prefix)}
              >
                {crumb.name}
              </button>
            </span>
          ))}
        </nav>
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder={t("objects.filter")}
          className="h-8 w-44"
        />
        {canEdit && (
          <>
            <Button
              size="sm"
              variant="outline"
              onClick={() => ask({ kind: "folder" })}
            >
              <FolderPlus className="size-4" />
              {t("objects.newFolder")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => folderInput.current?.click()}
            >
              <Folder className="size-4" />
              {t("objects.uploadFolder")}
            </Button>
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              <Upload className="size-4" />
              {t("objects.upload")}
            </Button>
          </>
        )}
        <RefreshButton onClick={() => void load(prefix)} loading={loading} />
        <input
          ref={fileInput}
          type="file"
          multiple
          hidden
          onChange={(event) => {
            pickFiles(event.target.files, false);
            event.target.value = "";
          }}
        />
        <input
          ref={folderInput}
          type="file"
          hidden
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(event) => {
            pickFiles(event.target.files, true);
            event.target.value = "";
          }}
        />
      </ToolbarBand>

      {transfers.length > 0 && (
        <div className="border-b border-border">
          {transfers.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 px-3 py-1.5 text-xs"
            >
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {item.error ? (
                <>
                  <span className="text-destructive">{item.error}</span>
                  <button
                    type="button"
                    className="underline"
                    onClick={() =>
                      setTransfers((current) =>
                        current.filter((other) => other.id !== item.id),
                      )
                    }
                  >
                    {t("objects.dismiss")}
                  </button>
                </>
              ) : (
                <span className="w-12 text-right tabular-nums">
                  {Math.round(item.fraction * 100)}%
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {detail && (
        <div className="space-y-2 border-b border-border p-3 text-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate font-medium">
              {detail.head.key}
            </span>
            <Button size="sm" variant="ghost" onClick={() => setDetail(null)}>
              {t("objects.close")}
            </Button>
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">{t("objects.size")}</dt>
            <dd>{formatBytes(detail.head.size)}</dd>
            <dt className="text-muted-foreground">{t("objects.type")}</dt>
            <dd>{detail.head.contentType}</dd>
            <dt className="text-muted-foreground">{t("objects.modified")}</dt>
            <dd>{formatDate(detail.head.modifiedAt)}</dd>
            <dt className="text-muted-foreground">ETag</dt>
            <dd className="truncate font-mono">{detail.head.etag}</dd>
            {Object.entries(detail.head.metadata).map(([name, text]) => (
              <div key={name} className="contents">
                <dt className="text-muted-foreground">{name}</dt>
                <dd className="truncate">{text}</dd>
              </div>
            ))}
          </dl>
          {detail.image && (
            <img
              src={detail.image}
              alt={detail.head.key}
              className="max-h-72 max-w-full border border-border"
            />
          )}
          {detail.text !== undefined && (
            <pre className="overflow-auto border border-border bg-background p-2 font-mono text-xs">
              {detail.text}
            </pre>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {!listing ? (
          <LoadingState />
        ) : (
          <PanelList
            empty={
              empty ? (
                <EmptyState
                  icon={Folder}
                  title={t("objects.empty")}
                  hint={canEdit ? t("objects.emptyHint") : undefined}
                />
              ) : undefined
            }
          >
            {folders.map((folder, index) => (
              <ListRow
                key={folder}
                stripe={index}
                icon={<Folder className="size-3.5" />}
                title={baseName(folder)}
                onClick={() => open(folder)}
                actions={
                  canEdit && (
                    <>
                      <ListRowAction
                        label={t("objects.rename")}
                        onClick={() =>
                          ask({ kind: "rename", key: folder, folder: true })
                        }
                      >
                        <Pencil className="size-3.5" />
                      </ListRowAction>
                      <ListRowAction
                        label={t("delete")}
                        tone="destructive"
                        onClick={() => void remove(folder, true)}
                      >
                        <Trash2 className="size-3.5" />
                      </ListRowAction>
                    </>
                  )
                }
              />
            ))}
            {objects.map((item, index) => (
              <ListRow
                key={item.key}
                stripe={folders.length + index}
                icon={<FileIcon className="size-3.5" />}
                title={baseName(item.key)}
                meta={`${formatBytes(item.size)} | ${formatDate(item.modifiedAt)}`}
                onClick={() => void show(item)}
                actions={
                  <>
                    <ListRowAction
                      label={t("objects.download")}
                      onClick={() => void download(item)}
                    >
                      <Download className="size-3.5" />
                    </ListRowAction>
                    {canEdit && (
                      <>
                        <ListRowAction
                          label={t("share.title")}
                          onClick={() => ask({ kind: "share", key: item.key })}
                        >
                          <Link2 className="size-3.5" />
                        </ListRowAction>
                        <ListRowAction
                          label={t("objects.copy")}
                          onClick={() =>
                            ask({ kind: "copy", key: item.key, folder: false })
                          }
                        >
                          <Copy className="size-3.5" />
                        </ListRowAction>
                        <ListRowAction
                          label={t("objects.rename")}
                          onClick={() =>
                            ask({
                              kind: "rename",
                              key: item.key,
                              folder: false,
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </ListRowAction>
                        <ListRowAction
                          label={t("delete")}
                          tone="destructive"
                          onClick={() => void remove(item.key, false)}
                        >
                          <Trash2 className="size-3.5" />
                        </ListRowAction>
                      </>
                    )}
                  </>
                }
              />
            ))}
          </PanelList>
        )}
        {listing?.next && (
          <div className="p-3">
            <Button
              size="sm"
              variant="outline"
              disabled={loading}
              onClick={() => void load(prefix, listing.next ?? undefined)}
            >
              {t("objects.more")}
            </Button>
          </div>
        )}
      </div>

      <PanePrompt
        open={!!prompt}
        title={t(
          prompt?.kind === "folder"
            ? "objects.newFolder"
            : prompt?.kind === "share"
              ? "share.title"
              : prompt?.kind === "copy"
                ? "objects.copy"
                : "objects.rename",
        )}
        description={
          prompt?.kind === "share"
            ? t("share.hint")
            : prompt?.kind === "folder"
              ? t("objects.folderHint", { prefix })
              : t("objects.pathHint")
        }
        onCancel={() => setPrompt(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setPrompt(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void submit()}>
              {t(prompt?.kind === "share" ? "share.make" : "ok")}
            </Button>
          </>
        }
      >
        {prompt?.kind === "share" ? (
          <div className="flex gap-2">
            {SHARE_CHOICES.map((choice) => (
              <Button
                key={choice.seconds}
                size="sm"
                variant={seconds === choice.seconds ? "default" : "outline"}
                onClick={() => setSeconds(choice.seconds)}
              >
                {t(choice.key)}
              </Button>
            ))}
          </div>
        ) : (
          <Input
            autoFocus
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void submit()}
          />
        )}
      </PanePrompt>
    </div>
  );
}
