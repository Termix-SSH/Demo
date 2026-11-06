import { Link2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { Link } from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { displayName } from "./format";

export function LinksView({
  api,
  links,
  canEdit,
  canManage,
  loaded,
  onEdit,
  onChanged,
}: {
  api: DnsApi;
  links: Link[];
  canEdit: boolean;
  canManage: boolean;
  loaded: boolean;
  onEdit: (link: Link) => void;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();

  async function sync(link: Link) {
    try {
      const result = await api.syncLink(link.id);
      toast.success(t(result.changed ? "link.updated" : "link.unchanged"));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      onChanged();
    }
  }

  async function remove(link: Link) {
    const ok = await confirm({
      title: t("link.deleteConfirm", {
        name: displayName(link.name, link.zoneName),
      }),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await api.removeLink(link.id);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <PanelList
      empty={
        loaded ? (
          <EmptyState
            icon={Link2}
            title={t("link.empty")}
            hint={t("link.emptyHint")}
          />
        ) : null
      }
    >
      {links.map((link, index) => (
        <ListRow
          key={link.id}
          stripe={index}
          tone={link.lastError ? "destructive" : "none"}
          icon={<Link2 />}
          title={displayName(link.name, link.zoneName)}
          badges={
            <>
              <ListBadge tone="muted">{link.type}</ListBadge>
              {!link.enabled && (
                <ListBadge tone="warning">{t("link.off")}</ListBadge>
              )}
            </>
          }
          meta={
            link.lastError
              ? link.lastError
              : [
                  link.source === "host"
                    ? (link.hostName ?? t("link.hostGone"))
                    : t(`link.source_${link.source}`),
                  link.lastValue,
                  link.lastSyncAt
                    ? t("link.lastSync", {
                        date: new Date(link.lastSyncAt).toLocaleString(),
                      })
                    : t("link.never"),
                ]
                  .filter(Boolean)
                  .join(" | ")
          }
          actions={
            <>
              {canEdit && (
                <ListRowAction
                  label={t("link.syncNow")}
                  onClick={() => void sync(link)}
                >
                  <RefreshCw />
                </ListRowAction>
              )}
              {canManage && (
                <>
                  <ListRowAction label={t("edit")} onClick={() => onEdit(link)}>
                    <Pencil />
                  </ListRowAction>
                  <ListRowAction
                    label={t("delete")}
                    tone="destructive"
                    onClick={() => void remove(link)}
                  >
                    <Trash2 />
                  </ListRowAction>
                </>
              )}
            </>
          }
        />
      ))}
    </PanelList>
  );
}
