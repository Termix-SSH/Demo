import { useCallback, useEffect, useState } from "react";
import { Database } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  ListBadge,
  ListRow,
  PanelList,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { RepoItem } from "../shared/types";
import { errorMessage, getRepos } from "./api";

export function ReposView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<RepoItem[] | null>(null);
  const [failed, setFailed] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await getRepos(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("repos.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (failed) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!items) return <LoadingState />;

  return (
    <div className="flex flex-col">
      <p className="border-b border-border px-3 py-2 text-xs text-muted-foreground">
        {t("repos.hint")}
      </p>
      {items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("repos.empty")}
        </p>
      ) : (
        <PanelList>
          {items.map((item, index) => (
            <ListRow
              key={`${item.id}-${index}`}
              stripe={index}
              icon={<Database className="size-4" />}
              dimmed={!item.enabled}
              tone={item.enabled ? "brand" : "muted"}
              title={<span className="font-mono">{item.url || item.id}</span>}
              badges={
                !item.enabled ? (
                  <ListBadge>{t("repos.off")}</ListBadge>
                ) : undefined
              }
              meta={[item.url ? item.id : "", item.name]
                .filter(Boolean)
                .join(" | ")}
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
