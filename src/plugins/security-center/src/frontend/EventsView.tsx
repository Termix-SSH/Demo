import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  EmptyState,
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { SecurityEvent } from "../shared/types";
import { errorMessage, getEvents } from "./api";

function tone(type: string): "destructive" | "warning" | "success" | "muted" {
  if (type.endsWith("-cleared") || type === "rotated" || type === "revoked") {
    return "success";
  }
  if (
    [
      "key-dsa",
      "authkeys-writable",
      "sshd-empty-passwords",
      "vuln-new",
      "rotate-failed",
    ].includes(type)
  ) {
    return "destructive";
  }
  if (type.startsWith("key-") || type.startsWith("sshd-")) return "warning";
  if (["ssh-dir-writable", "unreachable"].includes(type)) return "warning";
  return "muted";
}

/** Problems found and cleared, scans and rotations, newest first. */
export function EventsView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [events, setEvents] = useState<SecurityEvent[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isVisible) return;
    let live = true;
    const load = () =>
      getEvents(hostId)
        .then((rows) => {
          if (!live) return;
          setEvents(rows);
          setError("");
        })
        .catch((e) => live && setError(errorMessage(e, t("events.error"))));
    void load();
    const timer = setInterval(() => void load(), 30_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostId, isVisible, t]);

  if (error) return <p className="p-3 text-xs text-destructive">{error}</p>;
  if (!events) {
    return <LoadingState label={t("common.loading")} />;
  }
  if (!events.length) {
    return <EmptyState icon={History} title={t("events.empty")} />;
  }
  return (
    <PanelList>
      {events.map((event, index) => (
        <ListRow
          key={event.id}
          stripe={index}
          tone={tone(event.type)}
          title={event.text}
          meta={new Date(event.at).toLocaleString()}
          badges={
            <ListBadge tone={tone(event.type)}>
              {t(`events.type.${event.type}`, { defaultValue: event.type })}
            </ListBadge>
          }
        />
      ))}
    </PanelList>
  );
}
