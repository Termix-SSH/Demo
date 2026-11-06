import { useState } from "react";
import { Globe, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  Input,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
} from "@termix-ssh/plugin-sdk/ui";
import type { DomainRow } from "../shared/types";
import { errorMessage, type DnsApi } from "./api";

function expiryBadge(
  row: DomainRow,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  if (row.daysLeft === null) return null;
  const tone =
    row.daysLeft < 0 || row.daysLeft <= 14
      ? "destructive"
      : row.daysLeft <= 30
        ? "warning"
        : "success";
  return (
    <ListBadge tone={tone}>
      {row.daysLeft < 0
        ? t("domains.expired")
        : t("domains.days", { count: row.daysLeft })}
    </ListBadge>
  );
}

export function DomainsView({
  api,
  domains,
  canManage,
  loaded,
  onChanged,
}: {
  api: DnsApi;
  domains: DomainRow[];
  canManage: boolean;
  loaded: boolean;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  async function watch() {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await api.watchDomain(name.trim());
      setName("");
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: DomainRow) {
    try {
      await api.removeDomain(row.id);
      onChanged();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  return (
    <div>
      {canManage && (
        <form
          className="flex items-center gap-2 border-b border-border px-3 py-2"
          onSubmit={(event) => {
            event.preventDefault();
            void watch();
          }}
        >
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder={t("domains.watchPlaceholder")}
            className="h-8 max-w-sm text-xs"
          />
          <Button size="sm" variant="outline" disabled={busy || !name.trim()}>
            {t("domains.watch")}
          </Button>
        </form>
      )}
      <PanelList
        empty={
          loaded ? (
            <EmptyState
              icon={Globe}
              title={t("domains.empty")}
              hint={t("domains.emptyHint")}
            />
          ) : null
        }
      >
        {domains.map((row, index) => (
          <ListRow
            key={row.id}
            stripe={index}
            icon={<Globe />}
            title={row.name}
            badges={
              <>
                {expiryBadge(row, t)}
                {row.source === "watch" && (
                  <ListBadge tone="muted">{t("domains.watched")}</ListBadge>
                )}
                {row.autoRenew === false && (
                  <ListBadge tone="warning">{t("domains.noRenew")}</ListBadge>
                )}
                {row.locked === false && (
                  <ListBadge tone="muted">{t("domains.unlocked")}</ListBadge>
                )}
              </>
            }
            meta={[
              row.registrar ??
                (row.accountName ? row.accountName : t("domains.unknown")),
              row.expiresAt
                ? t("domains.expires", {
                    date: new Date(row.expiresAt).toLocaleDateString(),
                  })
                : (row.status ?? ""),
              row.nameservers.slice(0, 2).join(", "),
            ]
              .filter(Boolean)
              .join(" | ")}
            actions={
              canManage && row.source === "watch" ? (
                <ListRowAction
                  label={t("domains.unwatch")}
                  tone="destructive"
                  onClick={() => void remove(row)}
                >
                  <Trash2 />
                </ListRowAction>
              ) : undefined
            }
          />
        ))}
      </PanelList>
    </div>
  );
}
