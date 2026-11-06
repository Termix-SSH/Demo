import { BatteryCharging, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { SourceView } from "../shared/types";
import { stateKey } from "./format";

/** The UPS devices set up on this host. */
export function SourcesView({
  sources,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  sources: SourceView[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (source: SourceView) => void;
  onDelete: (source: SourceView) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col">
      {canEdit && (
        <div className="flex items-center border-b border-border px-3 py-2">
          <AddButton label={t("sources.add")} onClick={onAdd} />
        </div>
      )}
      {!sources.length ? (
        <EmptyState
          icon={BatteryCharging}
          title={t("sources.empty")}
          hint={t("sources.emptyHint")}
        />
      ) : (
        <PanelList>
          {sources.map((source, index) => (
            <ListRow
              key={source.id}
              stripe={index}
              icon={<BatteryCharging className="size-3.5" />}
              title={source.label}
              meta={[t(`backend.${source.backend}`), source.target]
                .filter(Boolean)
                .join(" | ")}
              badges={
                <>
                  {source.reading && (
                    <ListBadge
                      tone={
                        source.reading.state === "online"
                          ? "success"
                          : source.reading.state === "battery"
                            ? "warning"
                            : "muted"
                      }
                    >
                      {t(stateKey(source.reading.state))}
                    </ListBadge>
                  )}
                  {!source.enabled && (
                    <ListBadge tone="muted">{t("sources.off")}</ListBadge>
                  )}
                  {source.error && (
                    <ListBadge tone="destructive">
                      {t("sources.unreachable")}
                    </ListBadge>
                  )}
                </>
              }
              actions={
                canEdit ? (
                  <>
                    <ListRowAction
                      label={t("common.edit")}
                      onClick={() => onEdit(source)}
                    >
                      <Pencil className="size-3.5" />
                    </ListRowAction>
                    <ListRowAction
                      label={t("common.delete")}
                      tone="destructive"
                      onClick={() => onDelete(source)}
                    >
                      <Trash2 className="size-3.5" />
                    </ListRowAction>
                  </>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
