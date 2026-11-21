import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  useHost,
  useHostStatus,
  useSettings,
  useShell,
  useTranslation,
  type CompanionProps,
  type PluginHostRecord,
  type ShellApi,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, StatusDot, ToolbarBand } from "@termix-ssh/plugin-sdk/ui";
import { ServerCog } from "lucide-react";
import { getCatalog, type Catalog } from "./api";
import { useHostAttention } from "./host-attention";
import { requestSection } from "./host-page-nav";
import { HostOverview } from "./HostOverview";
import { appliesTo, hostLabel } from "./hosts";

export const OPS_TAB = "operations";
export const HOST_TAB = "host";

type Opener = Pick<ShellApi, "openTab" | "openSingletonTab">;

/** Opens the host's page at a section, reusing a page already open. */
export function openHostPage(
  shell: Opener,
  host: PluginHostRecord,
  section = "overview",
): void {
  requestSection(host.id, section);
  shell.openTab(host, HOST_TAB);
}

function useCatalog(): Catalog | null {
  const { language } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    let live = true;
    void getCatalog(language)
      .then((value) => live && setCatalog(value))
      .catch(() => live && setCatalog(null));
    return () => {
      live = false;
    };
  }, [language]);
  return catalog;
}

/** The host row dot while one of its status tiles is not OK. */
export function useAttentionDot(host: PluginHostRecord) {
  const { values } = useSettings("user");
  const attention = useHostAttention(host.id, values.attentionDot !== false);
  if (!attention) return null;
  return {
    tone: attention.tone === "fail" ? ("bad" as const) : ("warn" as const),
    label: attention.lines.join("\n"),
  };
}

/** Tab bar button: the host page of the host you are working on. */
export function TabBarHostPageButton({
  targetTab,
  className,
  shell,
}: {
  targetTab?: { host?: PluginHostRecord; type?: string };
  className?: string;
  shell: Opener;
}) {
  const { t } = useTranslation();
  const live = useShell();
  const active = live?.tabs.list.find((tab) => tab.id === live.tabs.activeId);
  // In a frame a tab carries its host id, not the host.
  const activeHost = useHost(
    active && active.type !== HOST_TAB
      ? (active.host?.id ?? (active as { hostId?: string | number }).hostId)
      : undefined,
  );
  const host = activeHost ?? targetTab?.host;
  const label = host
    ? t("host.openFor", { name: hostLabel(host) })
    : t("host.open");
  return (
    <Button
      variant="ghost"
      size="icon"
      disabled={!host}
      title={label}
      aria-label={label}
      className={`text-muted-foreground hover:text-foreground ${className ?? ""}`}
      onClick={() => host && openHostPage(shell, host)}
    >
      <ServerCog className="size-4" />
    </Button>
  );
}

/** The host page's overview, small, beside a terminal. */
export function HostCompanion({
  host,
  isVisible,
  opener,
}: CompanionProps & {
  opener: Opener;
}) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  const status = useHostStatus(Number(host?.id))?.status;
  // The same list the host page's overview gets.
  const actions = useMemo(
    () =>
      catalog && host
        ? catalog.actions.filter((action) => appliesTo(action, host))
        : [],
    [catalog, host],
  );
  if (!host) return null;
  const Icon = ServerCog as ComponentType<{ className?: string }>;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <ToolbarBand>
        <StatusDot state={status} title={t(`state.${status ?? "unknown"}`)} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {hostLabel(host)}
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openHostPage(opener, host)}
        >
          <Icon className="mr-1 size-3.5" />
          {t("host.open")}
        </Button>
      </ToolbarBand>
      <div className="min-h-0 flex-1">
        <HostOverview
          host={host}
          shell={opener as ShellApi}
          catalog={catalog}
          actions={actions}
          cards={[]}
          isVisible={isVisible}
          compact
          onOpenTool={(type) => openHostPage(opener, host, type)}
        />
      </div>
    </div>
  );
}
