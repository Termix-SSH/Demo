import { useCallback, useEffect, useState } from "react";
import { Earth, Lock, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  useConfirm,
  LoadingState,
  ToolbarBand,
} from "@termix-ssh/plugin-sdk/ui";
import type { Site, WebStatus } from "../shared/types";
import { deleteSite, errorMessage, getSites, toggleSite } from "./api";
import { SERVER_LABEL, expiryTone } from "./format";
import type { Runner } from "./WebServersTab";

/** Every site on the host, from each installed server. */
export function SitesView({
  hostId,
  status,
  runner,
  isVisible,
  onOpen,
  compact = false,
}: {
  hostId: number;
  status: WebStatus;
  runner: Runner;
  isVisible: boolean;
  onOpen: (site: Site) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [sites, setSites] = useState<Site[] | null>(null);
  const [failed, setFailed] = useState("");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    try {
      setSites(await getSites(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("sites.loadFailed")));
    }
  }, [hostId, t]);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!sites) return <LoadingState />;

  const term = search.trim().toLowerCase();
  const shown = term
    ? sites.filter(
        (s) =>
          s.name.toLowerCase().includes(term) ||
          s.names.some((n) => n.includes(term)),
      )
    : sites;

  const toggle = async (site: Site) => {
    const on = !site.enabled;
    const ok = await runner.run(
      on ? t("sites.enable") : t("sites.disable"),
      () => toggleSite(hostId, site, on),
      on
        ? t("sites.enabled", { name: site.name })
        : t("sites.disabled", { name: site.name }),
    );
    if (ok) await load();
  };

  const remove = async (site: Site) => {
    if (
      !(await confirm({
        title: t("sites.deleteTitle", { name: site.name }),
        description: t("sites.deleteBody"),
        confirmLabel: t("sites.delete"),
      }))
    )
      return;
    const ok = await runner.run(
      t("sites.delete"),
      () => deleteSite(hostId, site),
      t("sites.deleted", { name: site.name }),
    );
    if (ok) await load();
  };

  return (
    <div className="flex flex-col">
      {!compact && sites.length > 5 && (
        <ToolbarBand>
          <PanelSearch
            value={search}
            onChange={setSearch}
            placeholder={t("sites.search")}
            fill
          />
        </ToolbarBand>
      )}
      <PanelList
        empty={
          <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
            {t("sites.empty")}
          </p>
        }
      >
        {shown.map((site, index) => {
          const tone = !site.enabled
            ? "muted"
            : site.certDaysLeft !== null
              ? expiryTone(site.certDaysLeft)
              : "brand";
          return (
            <ListRow
              key={site.key}
              stripe={index}
              tone={tone}
              dimmed={!site.enabled}
              icon={
                site.tls ? (
                  <Lock className="size-4" />
                ) : (
                  <Earth className="size-4" />
                )
              }
              title={<span className="font-mono">{site.name}</span>}
              badges={
                <>
                  <ListBadge>{SERVER_LABEL[site.server]}</ListBadge>
                  {!site.enabled && (
                    <ListBadge tone="muted">{t("sites.off")}</ListBadge>
                  )}
                  {site.certDaysLeft !== null && (
                    <ListBadge
                      tone={
                        site.certDaysLeft < 0
                          ? "destructive"
                          : site.certDaysLeft <= 14
                            ? "warning"
                            : "success"
                      }
                    >
                      {site.certDaysLeft < 0
                        ? t("sites.certExpired")
                        : t("sites.certDays", { count: site.certDaysLeft })}
                    </ListBadge>
                  )}
                  {site.spec && !compact && (
                    <ListBadge tone="brand">{t("sites.form")}</ListBadge>
                  )}
                </>
              }
              meta={[
                site.names
                  .map((n) => (n === "_" ? t("sites.anyName") : n))
                  .join(" "),
                compact ? "" : site.upstream || site.root,
              ]
                .filter(Boolean)
                .join(" | ")}
              onClick={() => onOpen(site)}
              trailing={
                status.canEdit ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={runner.busy}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggle(site);
                    }}
                  >
                    {site.enabled ? t("sites.disable") : t("sites.enable")}
                  </Button>
                ) : undefined
              }
              actions={
                status.canEdit && !compact ? (
                  <ListRowAction
                    label={t("sites.delete")}
                    tone="destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      void remove(site);
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ListRowAction>
                ) : undefined
              }
            />
          );
        })}
      </PanelList>
    </div>
  );
}
