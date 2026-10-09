import { ExternalLink } from "lucide-react";
import { Button, cn } from "@termix-ssh/plugin-sdk/ui";
import type {
  AnnouncementAction,
  AnnouncementDisplay,
} from "../announcements-schema";
import type { AlertItem } from "../types";

/** The buttons an announcement carries, or null for any other alert. */
export function itemActions(item: AlertItem): AnnouncementAction[] | null {
  const raw = item.context?.actions;
  if (!Array.isArray(raw)) return null;
  return raw.filter(
    (action): action is AnnouncementAction =>
      !!action &&
      typeof action === "object" &&
      typeof action.label === "string" &&
      ((typeof action.url === "string" && /^https?:\/\//i.test(action.url)) ||
        typeof action.tab === "string"),
  );
}

export function itemDisplay(item: AlertItem): AnnouncementDisplay {
  return item.context?.display === "popup" ? "popup" : "inbox";
}

export function ActionButtons({
  actions,
  openTab,
  onAction,
  className,
}: {
  actions: AnnouncementAction[];
  openTab: (id: string) => void;
  onAction?: (action: AnnouncementAction) => void;
  className?: string;
}) {
  if (actions.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {actions.map((action, index) =>
        action.url ? (
          <Button
            key={index}
            asChild
            size="xs"
            variant={index === 0 ? "default" : "outline"}
          >
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(event) => {
                event.stopPropagation();
                onAction?.(action);
              }}
            >
              {action.label}
              <ExternalLink />
            </a>
          </Button>
        ) : (
          <Button
            key={index}
            size="xs"
            variant={index === 0 ? "default" : "outline"}
            onClick={(event) => {
              event.stopPropagation();
              openTab(action.tab!);
              onAction?.(action);
            }}
          >
            {action.label}
          </Button>
        ),
      )}
    </div>
  );
}
