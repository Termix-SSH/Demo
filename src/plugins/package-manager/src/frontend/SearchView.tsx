import { useState } from "react";
import { Download, Package, Search } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  PanelSearch,
  ToolbarBand,
  LoadingState,
} from "@termix-ssh/plugin-sdk/ui";
import type { PackagesStatus, SearchItem } from "../shared/types";
import { errorMessage, searchPackages } from "./api";
import type { Runner } from "./PackagesTab";

const QUERY_RE = /^[A-Za-z0-9+._-]{2,64}$/;

export function SearchView({
  hostId,
  status,
  runner,
}: {
  hostId: number;
  status: PackagesStatus;
  runner: Runner;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState("");
  const valid = QUERY_RE.test(query.trim());

  const search = async () => {
    if (!valid) return;
    setSearching(true);
    try {
      setItems(await searchPackages(hostId, query.trim()));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("search.failed")));
    } finally {
      setSearching(false);
    }
  };

  const install = async (name: string) => {
    if (await runner.run("install", [name])) {
      setItems(
        (prev) =>
          prev?.map((item) =>
            item.name === name ? { ...item, installed: true } : item,
          ) ?? null,
      );
    }
  };

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <PanelSearch
          value={query}
          onChange={setQuery}
          onEnter={() => void search()}
          placeholder={t("search.placeholder")}
          className="flex-1"
          autoFocus
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!valid || searching}
          onClick={() => void search()}
        >
          <Search className="size-4" />
          {t("search.button")}
        </Button>
      </ToolbarBand>
      {searching ? (
        <LoadingState />
      ) : failed ? (
        <p className="px-3 py-2 text-xs text-destructive">{failed}</p>
      ) : !items ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("search.hint")}
        </p>
      ) : items.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("search.empty")}
        </p>
      ) : (
        <PanelList>
          {items.map((item, index) => (
            <ListRow
              key={item.name}
              stripe={index}
              icon={<Package className="size-4" />}
              tone={item.installed ? "success" : undefined}
              title={<span className="font-mono">{item.name}</span>}
              badges={
                item.installed ? (
                  <ListBadge tone="success">{t("search.installed")}</ListBadge>
                ) : undefined
              }
              meta={[item.version, item.summary].filter(Boolean).join(" | ")}
              actions={
                status.canEdit && !item.installed ? (
                  <ListRowAction
                    label={t("actions.install.label")}
                    tone="brand"
                    disabled={!!runner.busy}
                    onClick={() => void install(item.name)}
                  >
                    <Download className="size-4" />
                  </ListRowAction>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
