import { useCallback, useEffect, useState } from "react";
import { CheckCheck, ShieldCheck } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  LoadingState,
  PanelList,
  PanePrompt,
  Pager,
  StatusDot,
  TextField,
  usePaged,
} from "@termix-ssh/plugin-sdk/ui";
import type { IncidentView } from "../shared/types";
import { ackIncident, errorMessage, listIncidents } from "./api";
import { lengthText, POLL_MS, whenText } from "./format";

const PAGE_SIZE = 25;
const FETCH_SIZE = 200;

export function IncidentsView({
  canAck,
  isVisible,
}: {
  canAck: boolean;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [incidents, setIncidents] = useState<IncidentView[] | null>(null);
  const [acking, setAcking] = useState<IncidentView | null>(null);
  const [note, setNote] = useState("");
  const paged = usePaged(incidents ?? [], PAGE_SIZE);

  const load = useCallback(async () => {
    try {
      setIncidents(await listIncidents({ limit: FETCH_SIZE }));
    } catch (e) {
      toast.error(errorMessage(e, t("tab.error")));
    }
  }, [t, toast]);

  useEffect(() => {
    if (!isVisible) return;
    void load();
    const timer = setInterval(() => void load(), POLL_MS * 2);
    return () => clearInterval(timer);
  }, [isVisible, load]);

  if (incidents === null) return <LoadingState label={t("common.loading")} />;
  if (incidents.length === 0) {
    return <EmptyState icon={ShieldCheck} title={t("incidents.none")} />;
  }

  const saveAck = async () => {
    if (!acking) return;
    try {
      await ackIncident(acking.id, note);
      setAcking(null);
      setNote("");
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("detail.failed")));
    }
  };

  return (
    <div className="flex min-h-0 flex-col">
      <PanelList>
        {paged.rows.map((incident) => (
          <ListRow
            key={incident.id}
            title={incident.monitorName}
            leading={
              <StatusDot
                tone={incident.endedAt ? "idle" : "bad"}
                pulse={!incident.endedAt}
              />
            }
            meta={`${whenText(incident.startedAt)} | ${incident.cause}`}
            badges={
              <ListBadge tone={incident.endedAt ? "muted" : "destructive"}>
                {incident.endedAt
                  ? lengthText(incident.endedAt - incident.startedAt)
                  : t("incidents.ongoing")}
              </ListBadge>
            }
            trailing={
              incident.ackAt ? (
                <span
                  className="text-xs text-muted-foreground"
                  title={incident.note}
                >
                  {t("incidents.seen")}
                </span>
              ) : canAck ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  title={t("incidents.ack")}
                  aria-label={t("incidents.ack")}
                  onClick={() => setAcking(incident)}
                >
                  <CheckCheck className="size-4" />
                </Button>
              ) : null
            }
          />
        ))}
      </PanelList>
      <Pager page={paged.page} pages={paged.pages} onPage={paged.setPage} />
      <PanePrompt
        open={!!acking}
        title={t("incidents.ack")}
        onCancel={() => setAcking(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setAcking(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void saveAck()}>{t("common.save")}</Button>
          </>
        }
      >
        <TextField
          label={t("incidents.note")}
          value={note}
          onChange={setNote}
        />
      </PanePrompt>
    </div>
  );
}
