import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Loader2,
  Pencil,
  Send,
  Trash2,
  Radio,
} from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Switch,
  useConfirm,
  AddButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { ChannelSummary } from "../types";
import type { AlertsApi } from "./api";
import { ChannelDialog } from "./ChannelDialog";

export function ChannelsView({
  api,
  onChanged,
}: {
  api: AlertsApi;
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [channels, setChannels] = useState<ChannelSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [emailAvailable, setEmailAvailable] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testing, setTesting] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [list, meta] = await Promise.all([api.channels(), api.meta()]);
      setChannels(list);
      setEmailAvailable(meta.emailAvailable);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    void load();
  }, [load]);

  const test = async (channel: ChannelSummary) => {
    setTesting(channel.id);
    try {
      await api.testChannel(channel.id);
      toast.success(t("channels.testSent"));
    } catch (error) {
      toast.error(
        t("channels.testFailed", {
          error: error instanceof Error ? error.message : String(error),
        }),
      );
    } finally {
      setTesting(null);
    }
  };

  const toggle = async (channel: ChannelSummary, enabled: boolean) => {
    try {
      await api.updateChannel(channel.id, { enabled });
      setChannels((current) =>
        current.map((entry) =>
          entry.id === channel.id ? { ...entry, enabled } : entry,
        ),
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
    }
  };

  const remove = (channel: ChannelSummary) => {
    void confirm({
      title: t("channels.deleteConfirm", { name: channel.name }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
    }).then((ok) => {
      if (ok)
        void (async () => {
          try {
            await api.deleteChannel(channel.id);
            toast.success(t("channels.deleted"));
            await load();
            onChanged?.();
          } catch (error) {
            toast.error(error instanceof Error ? error.message : String(error));
          }
        })();
      return ok;
    });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2">
        <p className="min-w-0 flex-1 text-[11px] leading-snug text-muted-foreground">
          {t("channels.intro")}
        </p>
        <AddButton
          label={t("channels.add")}
          onClick={() => {
            setEditingId(null);
            setDialogOpen(true);
          }}
        />
      </div>

      <PanelList
        empty={
          loading ? (
            <div className="flex justify-center p-6">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <EmptyState icon={Radio} title={t("channels.empty")} />
          )
        }
      >
        {!loading &&
          channels.map((channel, index) => (
            <ListRow
              key={channel.id}
              stripe={index}
              tone={
                !channel.usable
                  ? "destructive"
                  : channel.enabled
                    ? "brand"
                    : "muted"
              }
              dimmed={!channel.enabled}
              title={channel.name}
              onClick={() => {
                setEditingId(channel.id);
                setDialogOpen(true);
              }}
              badges={
                <>
                  {!channel.usable && (
                    <ListBadge tone="destructive">
                      <AlertTriangle />
                      {t("channels.needsSave")}
                    </ListBadge>
                  )}
                  <ListBadge className="ml-auto">
                    {t(`channels.types.${channel.type}`)}
                  </ListBadge>
                </>
              }
              trailing={
                <span onClick={(e) => e.stopPropagation()}>
                  <Switch
                    checked={channel.enabled}
                    onCheckedChange={(checked) => void toggle(channel, checked)}
                    aria-label={t("channels.enabled")}
                  />
                </span>
              }
              actions={
                <>
                  <ListRowAction
                    label={t("channels.test")}
                    tone="brand"
                    disabled={testing === channel.id}
                    onClick={() => void test(channel)}
                  >
                    {testing === channel.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <Send />
                    )}
                  </ListRowAction>
                  <ListRowAction
                    label={t("channels.edit")}
                    onClick={() => {
                      setEditingId(channel.id);
                      setDialogOpen(true);
                    }}
                  >
                    <Pencil />
                  </ListRowAction>
                  <ListRowAction
                    label={t("actions.delete")}
                    tone="destructive"
                    onClick={() => remove(channel)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              }
            />
          ))}
      </PanelList>

      <ChannelDialog
        api={api}
        open={dialogOpen}
        channelId={editingId}
        emailAvailable={emailAvailable}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          setDialogOpen(false);
          void load();
          onChanged?.();
        }}
      />
    </div>
  );
}
