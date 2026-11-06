import { useCallback, useEffect, useRef, useState } from "react";
import { BatteryCharging } from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import { Segmented, TabStrip, useConfirm } from "@termix-ssh/plugin-sdk/ui";
import type { SourceInput, SourceView } from "../shared/types";
import {
  addSource,
  errorCode,
  errorMessage,
  getSources,
  getStatus,
  removeSource,
  saveSource,
} from "./api";
import { CommandsView } from "./CommandsView";
import { EventsView } from "./EventsView";
import { HistoryView } from "./HistoryView";
import { OverviewView } from "./OverviewView";
import { SourceEditor } from "./SourceEditor";
import { SourcesView } from "./SourcesView";

type View = "overview" | "history" | "events" | "commands" | "sources";

const POLL_MS = 30_000;

/**
 * The UPS views for one host. The tab and the Host Metrics card both draw it.
 * The picker shows only when a host has more than one UPS.
 */
export function UpsPanel({
  hostId,
  isVisible,
  onStatus,
}: {
  hostId: number;
  isVisible: boolean;
  onStatus?: (text: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [sources, setSources] = useState<SourceView[] | null>(null);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [view, setView] = useState<View>("overview");
  const [editing, setEditing] = useState<SourceView | "new" | null>(null);
  const [busy, setBusy] = useState(false);
  const selectedRef = useRef<number | null>(null);
  selectedRef.current = selected;

  const load = useCallback(async () => {
    try {
      const list = await getSources(hostId);
      setCanEdit(list.canEdit);
      setSources(list.sources);
      setError("");
      setSelected((current) =>
        list.sources.some((s) => s.id === current)
          ? current
          : (list.sources[0]?.id ?? null),
      );
      if (!list.sources.length) setView("sources");
    } catch (e) {
      setError(
        errorCode(e) === "disabled"
          ? t("tab.disabled")
          : errorMessage(e, t("tab.error")),
      );
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  // Fresh reading for the picked UPS, on a timer while the tab shows.
  useEffect(() => {
    if (!isVisible || selected === null) return;
    let live = true;
    const poll = async () => {
      try {
        const fresh = await getStatus(hostId, selected);
        if (!live) return;
        setSources((all) =>
          all ? all.map((s) => (s.id === fresh.id ? fresh : s)) : all,
        );
      } catch {
        // The next poll tries again. The last reading stays on screen.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [hostId, selected, isVisible]);

  const current = sources?.find((s) => s.id === selected) ?? null;

  useEffect(() => {
    if (!onStatus) return;
    const r = current?.reading;
    onStatus(
      r
        ? [
            t(`state.${r.state}`),
            r.chargePct === null ? "" : `${Math.round(r.chargePct)}%`,
          ]
            .filter(Boolean)
            .join(" | ")
        : "",
    );
  }, [current, onStatus, t]);

  const save = async (input: SourceInput, clearSecrets: boolean) => {
    setBusy(true);
    try {
      if (editing && editing !== "new") {
        await saveSource(hostId, editing.id, { ...input, clearSecrets });
      } else {
        const created = await addSource(hostId, input);
        setSelected(created.id);
        setView("overview");
      }
      await load();
      toast.success(t("sources.saved"));
      return true;
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const remove = async (source: SourceView) => {
    const ok = await confirm({
      title: t("sources.deleteTitle", { name: source.label }),
      description: t("sources.deleteText"),
      confirmLabel: t("common.delete"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await removeSource(hostId, source.id);
      await load();
    } catch (e) {
      toast.error(errorMessage(e, t("common.failed")));
    }
  };

  if (error)
    return <p className="px-3 py-2 text-xs text-destructive">{error}</p>;
  if (!sources) {
    return (
      <p className="p-2 text-xs text-muted-foreground">{t("common.loading")}</p>
    );
  }

  const tabs: Array<{ id: View; label: string; count?: number }> = [
    { id: "overview", label: t("tab.viewOverview") },
    { id: "history", label: t("tab.viewHistory") },
    { id: "events", label: t("tab.viewEvents") },
    ...(current?.backend === "nut"
      ? [{ id: "commands" as View, label: t("tab.viewCommands") }]
      : []),
    { id: "sources", label: t("tab.viewSources"), count: sources.length },
  ];
  const active = tabs.some((x) => x.id === view) ? view : "overview";

  if (editing) {
    return (
      <SourceEditor
        hostId={hostId}
        source={editing === "new" ? null : editing}
        busy={busy}
        onClose={() => setEditing(null)}
        onSave={save}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TabStrip
        tabs={tabs}
        activeTab={active}
        onTabChange={(id) => setView(id as View)}
        trailing={
          sources.length > 1 ? (
            <Segmented<string>
              value={String(selected ?? "")}
              onChange={(value) => setSelected(Number(value))}
              options={sources.map((s) => ({
                value: String(s.id),
                label: s.label,
                icon: <BatteryCharging className="size-3" />,
              }))}
            />
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-auto">
        {active === "sources" || !current ? (
          <SourcesView
            sources={sources}
            canEdit={canEdit}
            onAdd={() => setEditing("new")}
            onEdit={setEditing}
            onDelete={(s) => void remove(s)}
          />
        ) : active === "overview" ? (
          <OverviewView source={current} />
        ) : active === "history" ? (
          <HistoryView
            hostId={hostId}
            sourceId={current.id}
            isVisible={isVisible}
          />
        ) : active === "events" ? (
          <EventsView
            hostId={hostId}
            sourceId={current.id}
            isVisible={isVisible}
          />
        ) : (
          <CommandsView
            hostId={hostId}
            source={current}
            isVisible={isVisible}
            canEdit={canEdit}
          />
        )}
      </div>
    </div>
  );
}
