import { useCallback, useEffect, useState } from "react";
import { Monitor } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { SessionsView as Sessions } from "../shared/types";
import { errorMessage, getSessions } from "./api";
import { Loading } from "./Loading";

export function SessionsView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [data, setData] = useState<Sessions | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await getSessions(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("sessions.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (failed) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!data) return <Loading />;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("sessions.now")}
      </div>
      {data.sessions.length === 0 ? (
        <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground/60">
          {t("sessions.none")}
        </p>
      ) : (
        <PanelList className="border-b border-border">
          {data.sessions.map((session, index) => (
            <ListRow
              key={`${session.user}-${session.tty}-${index}`}
              stripe={index}
              icon={<Monitor className="size-4" />}
              tone="success"
              title={session.user}
              meta={[session.tty, session.from, session.since]
                .filter(Boolean)
                .join(" | ")}
            />
          ))}
        </PanelList>
      )}
      <div className="border-b border-border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {t("sessions.recent")}
      </div>
      {data.recent.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground/60">
          {t("sessions.noRecent")}
        </p>
      ) : (
        <pre className="overflow-x-auto px-3 py-2 font-mono text-xs leading-5">
          {data.recent.join("\n")}
        </pre>
      )}
    </div>
  );
}
