import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
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
  SideNav,
  useHostActions,
  useHostSections,
  StatusDot,
} from "@termix-ssh/plugin-sdk/ui";
import {
  Check,
  LayoutDashboard,
  LayoutGrid,
  Pencil,
  Server,
} from "lucide-react";
import { getCatalog, type Catalog } from "./api";
import { appliesTo, hostLabel, splitTags } from "./hosts";
import { HostGrid } from "./tiles/HostGrid";
import { EmbedSlot, useEmbedNodes } from "./tiles/embeds";
import { FRESH_MS, useSectionRequest } from "./host-page-nav";

type HostAction = ReturnType<typeof useHostActions>[number];

/** This page's own tab type, left out of its nav. */
const PAGE_TAB = "host";

/**
 * Everything about one host on one tab. Each tool and session a plugin
 * offers for the host opens inside the page and stays alive while you move
 * between them, so ten tools are one tab instead of ten.
 */
export function HostPage({ host, tab, isVisible, shell }: TabProps) {
  const { t, language } = useTranslation();
  const all = useHostActions();
  const sections = useHostSections();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const status = useHostStatus(Number(host?.id))?.status;
  const wanted = (tab.data as { section?: string } | undefined)?.section;
  const [section, setSection] = useState<string>(wanted ?? "overview");
  const [editMode, setEditMode] = useState(false);
  // Tools and sessions stay alive once opened, so switching back keeps their state.
  const embed = useEmbedNodes();

  useEffect(() => {
    if (wanted) setSection(wanted);
  }, [wanted]);

  // A tool button on the host row asked for a section of this page.
  const request = useSectionRequest(host?.id);
  const seenRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!request || seenRequest.current === request.seq) return;
    const first = seenRequest.current === null;
    seenRequest.current = request.seq;
    if (first && Date.now() - request.at > FRESH_MS) return;
    setSection(request.section);
  }, [request]);

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
  // Sessions such as the terminal open inside the page too, next to the tools.
  const sessions = connect.filter(
    (action) => !!action.tabType && !action.run && !action.items,
  );
  const tools = actions.filter(
    (action: HostAction) =>
      action.kind === "open" && !!action.tabType && action.tabType !== PAGE_TAB,
  );
  const cards = useMemo(
    () => (host ? hostSectionsFor(sections, host as never) : []),
    [sections, host],
  );
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
    if (id !== "overview") setEditMode(false);
  };
  const inPage = (action: HostAction) => sessions.includes(action);
  const popOut = (type: string) =>
    shell.openTab(host as never, type, { forceNewTab: true });
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
            <StatusDot
              state={status}
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
          {connect
            .filter((action) => !inPage(action))
            .map((action) => {
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
          {section === "overview" && (
            <Button
              size="sm"
              variant="ghost"
              className={editMode ? "text-accent-brand" : ""}
              title={editMode ? t("tiles.done") : t("tiles.customize")}
              aria-label={editMode ? t("tiles.done") : t("tiles.customize")}
              onClick={() => setEditMode((on) => !on)}
            >
              {editMode ? (
                <Check className="size-3.5" />
              ) : (
                <LayoutGrid className="size-3.5" />
              )}
            </Button>
          )}
          {shell.editHost && (
            <Button
              size="sm"
              variant="ghost"
              title={t("host.edit")}
              aria-label={t("host.edit")}
              onClick={() => shell.editHost?.(Number(host.id))}
            >
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SideNav
          label={t("host.sections")}
          active={section}
          onSelect={open}
          entries={[
            {
              id: "overview",
              icon: LayoutDashboard,
              label: t("host.overview"),
            },
            ...sessions.map((session) => ({
              id: session.tabType!,
              icon: session.icon as ComponentType<{ className?: string }>,
              label: session.label?.(host as never) ?? t(session.titleKey),
              onPopOut: () => popOut(session.tabType!),
              popOutLabel: t("host.popOut"),
            })),
            ...tools.map((tool, index) => ({
              id: tool.tabType!,
              icon: tool.icon as ComponentType<{ className?: string }>,
              label: tool.label?.(host as never) ?? t(tool.titleKey),
              onPopOut: () => popOut(tool.tabType!),
              popOutLabel: t("host.popOut"),
              divider: index === 0 && sessions.length > 0,
            })),
          ]}
        />

        <main className="relative min-h-0 flex-1 overflow-hidden">
          {section === "overview" ? (
            <HostGrid
              host={host}
              shell={shell}
              catalog={catalog}
              actions={hostActions}
              sessions={sessions}
              sections={cards}
              isVisible={isVisible}
              editMode={editMode}
              onEditMode={setEditMode}
              onOpenTool={open}
              embed={embed}
            />
          ) : (
            <div key={section} className="absolute inset-0 flex flex-col">
              <EmbedSlot type={section} embed={embed} />
            </div>
          )}
          <div ref={embed.parking} className="hidden" aria-hidden="true" />
          {[...embed.wanted].map((type) =>
            createPortal(
              <HostTabEmbed
                host={host as never}
                type={type}
                isVisible={isVisible && embed.shown.has(type)}
                shell={shell as never}
              />,
              embed.nodeFor(type),
              type,
            ),
          )}
        </main>
      </div>
    </div>
  );
}

export type { PluginHostRecord, ShellApi };
