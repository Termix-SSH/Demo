import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  usePluginApi,
  useSettings,
  useTabs,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button } from "@termix-ssh/plugin-sdk/ui";
import type { AlertItem } from "../types";
import { ActionButtons, itemActions, itemDisplay } from "./actions";
import { createAlertsApi } from "./api";
import { Markdown } from "./markdown";
import { shouldPopUp, type PopupLevel } from "./popups";
import type { AlertsStore } from "./store";

/**
 * A card that stays on screen until closed, for an announcement that asks
 * for one. Rendered by core's toaster, outside this plugin's providers, so
 * it takes what it needs as props.
 */
export function AnnouncementCard({
  item,
  labels,
  openTab,
  onClose,
  onView,
}: {
  item: AlertItem;
  labels: { close: string; view: string };
  openTab: (id: string) => void;
  onClose: () => void;
  onView: () => void;
}) {
  return (
    <div
      role="region"
      aria-label={item.title}
      className="flex w-[356px] max-w-[calc(100vw-2rem)] flex-col gap-2 border border-border bg-popover p-3 text-popover-foreground shadow-lg"
    >
      <div className="flex items-start gap-2">
        <span className="flex-1 text-sm font-semibold">{item.title}</span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={labels.close}
          onClick={onClose}
        >
          <X />
        </Button>
      </div>
      {item.body && (
        <Markdown
          text={item.body}
          className="max-h-64 overflow-y-auto text-xs leading-snug text-muted-foreground"
        />
      )}
      <ActionButtons
        actions={itemActions(item) ?? []}
        openTab={openTab}
        onAction={onClose}
      />
      <button
        type="button"
        className="self-start text-xs text-muted-foreground hover:text-foreground hover:underline"
        onClick={onView}
      >
        {labels.view}
      </button>
    </div>
  );
}

/** Pops up alerts as they arrive, as far as the user's setting allows. */
export function AlertToaster({
  store,
  viewId,
}: {
  store: AlertsStore;
  viewId: string;
}) {
  const { t } = useTranslation();
  const tabs = useTabs();
  const client = usePluginApi();
  const api = useMemo(() => createAlertsApi(client), [client]);
  const { values } = useSettings("user");
  const level = useRef<PopupLevel>("warning");
  level.current = (values.popups as PopupLevel | undefined) ?? "warning";

  useEffect(
    () =>
      store.onItem((item, isNew) => {
        if (!isNew || level.current === "off") return;
        if (itemDisplay(item) === "popup") {
          const markRead = () => {
            void api.setRead([item.id], true).catch(() => {});
          };
          toast.custom(
            (id) => (
              <AnnouncementCard
                item={item}
                labels={{
                  close: t("inbox.close"),
                  view: t("inbox.viewInInbox"),
                }}
                openTab={tabs.openSingletonTab}
                onClose={() => {
                  markRead();
                  toast.dismiss(id);
                }}
                onView={() => {
                  toast.dismiss(id);
                  tabs.openRailView(viewId);
                }}
              />
            ),
            { id: `alert-${item.id}`, duration: Infinity },
          );
          return;
        }
        if (!shouldPopUp(item, level.current)) return;
        const show =
          item.severity === "critical"
            ? toast.error
            : item.severity === "warning"
              ? toast.warning
              : item.severity === "success"
                ? toast.success
                : toast.info;
        show(item.title, {
          description: item.body ? item.body.slice(0, 200) : undefined,
          action: {
            label: t("inbox.view"),
            onClick: () => tabs.openRailView(viewId),
          },
        });
      }),
    [api, store, t, tabs, viewId],
  );

  return null;
}
