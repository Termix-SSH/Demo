import { useEffect, useState } from "react";
import { NotebookPen } from "lucide-react";
import {
  usePermission,
  useTranslation,
  type DashboardCardProps,
} from "@termix-ssh/plugin-sdk/frontend";
import { ListRow, PanelList } from "@termix-ssh/plugin-sdk/ui";
import type { NoteSummary } from "../shared/types";
import { listNotes } from "./api";

/** Dashboard card: your pinned global notes. */
export function PinnedCard({ isVisible, shell }: DashboardCardProps) {
  const { t } = useTranslation();
  const allowed = usePermission("use");
  const [notes, setNotes] = useState<NoteSummary[] | null>(null);

  useEffect(() => {
    if (!isVisible || !allowed) return;
    void listNotes({ scope: "global" })
      .then((rows) => setNotes(rows.filter((row) => row.pinned)))
      .catch(() => setNotes([]));
  }, [isVisible, allowed]);

  if (!allowed) return null;
  if (!notes) {
    return (
      <p className="p-3 text-xs text-muted-foreground">{t("card.loading")}</p>
    );
  }

  return (
    <PanelList
      empty={
        <p className="p-3 text-xs text-muted-foreground">{t("card.empty")}</p>
      }
    >
      {notes.map((note, index) => (
        <ListRow
          key={note.uid}
          stripe={index}
          icon={<NotebookPen className="size-3.5" />}
          title={note.title}
          meta={note.excerpt}
          onClick={() => shell.openSingletonTab("notes")}
        />
      ))}
    </PanelList>
  );
}
