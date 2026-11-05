import { useCallback, useEffect, useState } from "react";
import { History } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  Pager,
  PanelList,
  usePaged,
} from "@termix-ssh/plugin-sdk/ui";
import type { HistoryItem } from "../shared/types";
import { errorMessage, getHistory } from "./api";
import { Loading } from "./Loading";

function tone(action: string) {
  if (/remove|purge/i.test(action)) return "destructive" as const;
  if (/upgrade|update/i.test(action)) return "brand" as const;
  if (/install/i.test(action)) return "success" as const;
  return "muted" as const;
}

export function HistoryView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await getHistory(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("history.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  const { rows, page, pages, setPage } = usePaged(items ?? [], 50);

  if (failed) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!items) return <Loading />;
  if (items.length === 0) {
    return (
      <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
        {t("history.empty")}
      </p>
    );
  }

  return (
    <div className="flex flex-col">
      <PanelList>
        {rows.map((item, index) => (
          <ListRow
            key={`${item.date}-${index}`}
            stripe={index}
            icon={<History className="size-4" />}
            tone={tone(item.action)}
            title={
              <span className="font-mono">{item.packages || item.command}</span>
            }
            badges={
              <ListBadge tone={tone(item.action)}>{item.action}</ListBadge>
            }
            meta={[item.date, item.packages ? item.command : ""]
              .filter(Boolean)
              .join(" | ")}
          />
        ))}
      </PanelList>
      <Pager page={page} pages={pages} onPage={setPage} />
    </div>
  );
}
