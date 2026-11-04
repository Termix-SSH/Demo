import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  useHostStatus,
  useTranslation,
  type PluginHostRecord,
  type ShellApi,
  type TabProps,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  HostTabEmbed,
  hostActionsFor,
  hostSectionsFor,
  runHostAction,
  useHostActions,
  useHostSections,
} from "@termix-ssh/plugin-sdk/ui";
import { ExternalLink, LayoutDashboard, Pencil, Server } from "lucide-react";
import { getCatalog, type Catalog } from "./api";
import { appliesTo, hostLabel, splitTags } from "./hosts";
import { HostOverview } from "./HostOverview";

type HostAction = ReturnType<typeof useHostActions>[number];

/** This page's own tab type, left out of its nav. */
const PAGE_TAB = "host";

/**
 * Everything about one host on one tab. Each tool a plugin offers for the
 * host opens inside the page, so ten tools are one tab instead of ten.
 * Sessions such as a terminal keep their own tabs.
 */
export function HostPage({ host, tab, isVisible, shell }: TabProps) {
  const { t, language } = useTranslation();
  const all = useHostActions();
  const sections = useHostSections();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const status = useHostStatus(Number(host?.id))?.status;
  const wanted = (tab.data as { section?: string } | undefined)?.section;
  const [section, setSection] = useState<string>(wanted ?? "overview");
  // Tools stay mounted once opened, so switching back keeps their state.
  const [opened, setOpened] = useState<Set<string>>(
    new Set(wanted ? [wanted] : []),
  );

  useEffect(() => {
    if (wanted) {
      setSection(wanted);
      setOpened((prev) => new Set(prev).add(wanted));
    }
  }, [wanted]);

  useEffect(() => {
    void getCatalog(language)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [language]);

  const actions = useMemo(
    () => (host ? hostActionsFor(all, host as never) : []),
    [all, host],
  );
  const connect = actions.filter((action) => action.kind === "connect");
  const tools = actions.filter(
    (action: HostAction) =>
      action.kind === "open" && !!action.tabType && action.tabType !== PAGE_TAB,
  );
  const cards = host ? hostSectionsFor(sections, host as never) : [];
  const hostActions = useMemo(
    () =>
      host && catalog
        ? catalog.actions.filter((action) => appliesTo(action, host))
        : [],
    [catalog, host],
  );

  if (!host) {
    return (
      <p className="p-4 text-sm text-muted-foreground">{t("host.noHost")}</p>
    );
  }

  const open = (id: string) => {
    setSection(id);
    if (id !== "overview") setOpened((prev) => new Set(prev).add(id));
  };
  const current = tools.find((tool) => tool.tabType === section);
  const tags = splitTags(host.tags);

  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
      <header className="flex shrink-0 flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <Server className="size-5 text-accent-brand" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold">
              {hostLabel(host)}
            </h2>
            <span
              className={`size-2 rounded-full ${status === "online" ? "bg-emerald-500" : status === "offline" ? "bg-destructive" : "bg-muted-foreground"}`}
              title={t(`state.${status ?? "unknown"}`)}
            />
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {[`${host.username}@${host.ip}:${host.port}`, tags.join(", ")]
              .filter(Boolean)
              .join(" | ")}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-1">
          {connect.map((action) => {
            const Icon = action.icon as ComponentType<{ className?: string }>;
            return (
              <Button
                key={action.id}
                size="sm"
                variant="outline"
                onClick={() =>
                  runHostAction(action, host as never, shell as never)
                }
              >
                <Icon className="mr-1 size-3.5" />
                {action.label?.(host as never) ?? t(action.titleKey)}
              </Button>
            );
          })}
          {shell.editHost && (
            <Button
              size="sm"
              variant="ghost"
              title={t("host.edit")}
              onClick={() => shell.editHost?.(Number(host.id))}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-44 shrink-0 flex-col gap-0.5 overflow-auto border-r border-border p-2">
          <NavButton
            active={section === "overview"}
            icon={LayoutDashboard}
            label={t("host.overview")}
            onClick={() => open("overview")}
          />
          {tools.map((tool) => (
            <NavButton
              key={tool.id}
              active={section === tool.tabType}
              icon={tool.icon as ComponentType<{ className?: string }>}
              label={tool.label?.(host as never) ?? t(tool.titleKey)}
              onClick={() => open(tool.tabType!)}
            />
          ))}
        </nav>

        <main className="relative min-h-0 flex-1 overflow-hidden">
          {section === "overview" && (
            <HostOverview
              host={host}
              shell={shell}
              catalog={catalog}
              actions={hostActions}
              cards={cards}
              isVisible={isVisible}
              onOpenTool={open}
            />
          )}
          {[...opened].map((type) => {
            const shown = section === type;
            return (
              <div
                key={type}
                className={`absolute inset-0 flex flex-col ${shown ? "" : "hidden"}`}
              >
                {shown && current && (
                  <div className="flex shrink-0 justify-end border-b border-border px-2 py-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        shell.openTab(host as never, type, {
                          forceNewTab: true,
                        })
                      }
                    >
                      <ExternalLink className="mr-1 size-3.5" />
                      {t("host.popOut")}
                    </Button>
                  </div>
                )}
                <div className="min-h-0 flex-1">
                  <HostTabEmbed
                    host={host as never}
                    type={type}
                    isVisible={isVisible && shown}
                    shell={shell as never}
                  />
                </div>
              </div>
            );
          })}
        </main>
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1.5 text-left text-xs ${active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60"}`}
    >
      <Icon className="size-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}

export type { PluginHostRecord, ShellApi };
