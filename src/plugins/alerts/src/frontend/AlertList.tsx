import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Info,
  Mail,
  MailOpen,
  OctagonAlert,
  Trash2,
} from "lucide-react";
import { useTabs, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  ListRowAction,
  cn,
  type ListRowTone,
} from "@termix-ssh/plugin-sdk/ui";
import { ANNOUNCEMENT_SOURCE, type AlertItem, type Severity } from "../types";
import { ActionButtons, itemActions } from "./actions";
import { sourceLabel, timeAgo } from "./format";
import { Markdown } from "./markdown";

const SEVERITY_ICON: Record<Severity, typeof Info> = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  critical: OctagonAlert,
};

const SEVERITY_CLASS: Record<Severity, string> = {
  info: "text-muted-foreground",
  success: "text-green-500",
  warning: "text-warning",
  critical: "text-destructive",
};

const SEVERITY_TONE: Record<Severity, ListRowTone> = {
  info: "muted",
  success: "success",
  warning: "warning",
  critical: "destructive",
};

function SeverityIcon({
  severity,
  className,
}: {
  severity: Severity;
  className?: string;
}) {
  const Icon = SEVERITY_ICON[severity];
  return <Icon className={cn(SEVERITY_CLASS[severity], className)} />;
}

export function AlertList({
  items,
  compact = false,
  onOpen,
  onToggleRead,
  onDelete,
}: {
  items: AlertItem[];
  compact?: boolean;
  onOpen: (item: AlertItem) => void;
  onToggleRead: (item: AlertItem) => void;
  onDelete: (item: AlertItem) => void;
}) {
  const { t, language } = useTranslation();
  const tabs = useTabs();

  return (
    <div className="flex flex-col">
      {items.map((item, index) => {
        const unread = !item.readAt;
        const failed = (item.deliveries ?? []).filter((entry) => !entry.ok);
        const actions = itemActions(item);
        const announcement = item.source === ANNOUNCEMENT_SOURCE;
        const actionText =
          typeof item.context?.actionText === "string"
            ? item.context.actionText
            : t("inbox.openLink");
        return (
          <ListRow
            key={item.id}
            stripe={index}
            tone={SEVERITY_TONE[item.severity]}
            className={unread ? "bg-accent-brand/5" : undefined}
            icon={<SeverityIcon severity={item.severity} />}
            title={
              <span className={unread ? "font-bold" : "font-medium"}>
                {item.title}
              </span>
            }
            badges={
              unread ? (
                <ListBadge tone="brand" className="ml-auto">
                  {t("inbox.unread")}
                </ListBadge>
              ) : undefined
            }
            onClick={() => onOpen(item)}
            meta={
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span title={item.category}>{sourceLabel(item.source, t)}</span>
                <span>{timeAgo(item.createdAt, language)}</span>
                {failed.length > 0 && (
                  <span
                    className="text-destructive"
                    title={failed
                      .map((entry) => `${entry.name}: ${entry.error ?? ""}`)
                      .join("\n")}
                  >
                    {t("inbox.deliveryFailed", { count: failed.length })}
                  </span>
                )}
                {item.link?.url && !actions && (
                  <a
                    href={item.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-accent-brand hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {actionText}
                    <ExternalLink className="size-3" />
                  </a>
                )}
              </span>
            }
            actions={
              <>
                <ListRowAction
                  label={unread ? t("inbox.markRead") : t("inbox.markUnread")}
                  onClick={() => onToggleRead(item)}
                >
                  {unread ? <MailOpen /> : <Mail />}
                </ListRowAction>
                <ListRowAction
                  label={t("inbox.delete")}
                  tone="destructive"
                  onClick={() => onDelete(item)}
                >
                  <Trash2 />
                </ListRowAction>
              </>
            }
          >
            {item.body &&
              (announcement ? (
                <Markdown
                  text={item.body}
                  className={cn(
                    "text-xs leading-snug text-muted-foreground",
                    compact && "line-clamp-3",
                  )}
                />
              ) : (
                <span
                  className={cn(
                    "whitespace-pre-wrap break-words text-xs leading-snug text-muted-foreground",
                    compact && "line-clamp-2",
                  )}
                >
                  {item.body}
                </span>
              ))}
            {actions && actions.length > 0 && (
              <ActionButtons
                actions={actions}
                openTab={tabs.openSingletonTab}
                className="mt-1.5"
                onAction={() => onOpen(item)}
              />
            )}
          </ListRow>
        );
      })}
    </div>
  );
}
