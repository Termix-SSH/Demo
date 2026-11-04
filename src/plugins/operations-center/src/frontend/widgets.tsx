import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  useHosts,
  useToast,
  useTranslation,
  type ExtensionContribution,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import { Button, Input, Select2, WidgetTitle } from "@termix-ssh/plugin-sdk/ui";
import { Activity, Globe, Play, Zap } from "lucide-react";
import {
  errorText,
  getCatalog,
  getResources,
  getSignals,
  runAction,
  type Catalog,
  type SignalRead,
} from "./api";
import { appliesTo, hostLabel } from "./hosts";

/** The homepage's grid step, in pixels. */
const GRID = 30;
const REFRESH_MS = 30_000;

interface WidgetProps<C> {
  widget: { title?: string | null };
  config: C;
}

interface EditProps<C> {
  config: C;
  onChange: (config: C) => void;
}

interface WidgetDefinition<C> extends ExtensionContribution {
  id: string;
  name: string;
  description: string;
  category: "links" | "info" | "system" | "monitoring";
  icon: ReactNode;
  defaultConfig: C;
  defaultSize: { w: number; h: number };
  minSize: { w: number; h: number };
  components: {
    view: ComponentType<WidgetProps<C>>;
    editForm?: ComponentType<EditProps<C>>;
  };
}

function useCatalog(): Catalog | null {
  const { language } = useTranslation();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  useEffect(() => {
    void getCatalog(language)
      .then(setCatalog)
      .catch(() => setCatalog(null));
  }, [language]);
  return catalog;
}

interface TilesConfig {
  /** Only these signals. Empty shows all. */
  signals: string[];
  /** Only problems, not hosts that are fine. */
  problemsOnly: boolean;
}

const TONE: Record<string, string> = {
  ok: "border-l-emerald-500",
  warn: "border-l-amber-500",
  fail: "border-l-destructive",
  unknown: "border-l-border",
};

function StatusTiles({ widget, config }: WidgetProps<TilesConfig>) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const catalog = useCatalog();
  const [reads, setReads] = useState<SignalRead[]>([]);

  const load = useCallback(async () => {
    setReads(await getSignals().catch(() => []));
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [load]);

  const tiles = reads
    .filter(
      (read) => !config.signals.length || config.signals.includes(read.id),
    )
    .flatMap((read) =>
      read.hosts
        .filter((entry) => entry.state === "ok" && entry.value)
        .filter((entry) => !config.problemsOnly || entry.value?.status !== "ok")
        .map((entry) => ({
          key: `${read.id}|${entry.hostId}`,
          title:
            catalog?.signals.find((s) => s.id === read.id)?.title ?? read.id,
          host: hosts.find((host) => Number(host.id) === entry.hostId),
          value: entry.value!,
        })),
    );

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Activity size={11} />} />
      {tiles.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">
          {config.problemsOnly ? t("widgets.allGood") : t("widgets.noTiles")}
        </p>
      ) : (
        <div className="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-1 overflow-auto">
          {tiles.map((tile) => (
            <div
              key={tile.key}
              className={`flex flex-col border border-border border-l-4 p-1.5 ${TONE[tile.value.status] ?? ""}`}
            >
              <span className="truncate text-[10px] text-muted-foreground">
                {tile.title}
              </span>
              <span className="truncate text-xs font-medium">
                {tile.value.label ?? String(tile.value.value ?? "")}
              </span>
              {tile.host && (
                <span className="truncate text-[10px] text-muted-foreground">
                  {hostLabel(tile.host)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusTilesForm({ config, onChange }: EditProps<TilesConfig>) {
  const { t } = useTranslation();
  const catalog = useCatalog();
  return (
    <div className="flex flex-col gap-2 text-xs">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={config.problemsOnly}
          onChange={(event) =>
            onChange({ ...config, problemsOnly: event.target.checked })
          }
        />
        {t("widgets.problemsOnly")}
      </label>
      <span className="font-medium text-muted-foreground">
        {t("widgets.which")}
      </span>
      {(catalog?.signals ?? []).map((signal) => (
        <label key={signal.id} className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={config.signals.includes(signal.id)}
            onChange={(event) =>
              onChange({
                ...config,
                signals: event.target.checked
                  ? [...config.signals, signal.id]
                  : config.signals.filter((id) => id !== signal.id),
              })
            }
          />
          {signal.title}
        </label>
      ))}
    </div>
  );
}

interface ButtonConfig {
  actionId: string;
  hostId: number;
  resourceKey: string;
  label: string;
}

function ActionButton({ widget, config }: WidgetProps<ButtonConfig>) {
  const { t } = useTranslation();
  const toast = useToast();
  const catalog = useCatalog();
  const [busy, setBusy] = useState(false);
  const action = catalog?.actions.find((entry) => entry.id === config.actionId);

  const press = async () => {
    if (!action) return;
    setBusy(true);
    try {
      const outcome = await runAction(action.id, {
        hostId:
          action.scope === "server" ? undefined : config.hostId || undefined,
        resourceKey:
          action.scope === "resource" ? config.resourceKey : undefined,
        confirmed: true,
      });
      if (outcome.status === "success")
        toast.success(outcome.summary ?? t("state.success"));
      else if (outcome.status === "pending_approval")
        toast.info(t("run.waiting"));
      else toast.error(outcome.error ?? t(`state.${outcome.status}`));
    } catch (error) {
      toast.error(errorText(error, t("run.failed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col gap-1">
      <WidgetTitle title={widget.title} icon={<Zap size={11} />} />
      <div className="flex flex-1 items-center justify-center p-1">
        <Button
          className="w-full"
          variant={action?.risk === "destructive" ? "destructive" : "default"}
          disabled={!action || busy}
          onClick={() => void press()}
        >
          <Play className="mr-1 size-3.5" />
          {config.label || action?.title || t("widgets.pickAction")}
        </Button>
      </div>
    </div>
  );
}

function ActionButtonForm({ config, onChange }: EditProps<ButtonConfig>) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const catalog = useCatalog();
  const actions = (catalog?.actions ?? []).filter(
    (action) => action.risk !== "read",
  );
  const action = actions.find((entry) => entry.id === config.actionId);
  const usable = action ? hosts.filter((host) => appliesTo(action, host)) : [];
  const field = "h-8 text-xs border border-border bg-background px-2";
  return (
    <div className="flex flex-col gap-2 text-xs">
      <span className="font-medium text-muted-foreground">
        {t("widgets.action")}
      </span>
      <Select2
        className={field}
        value={config.actionId}
        onChange={(event) =>
          onChange({ ...config, actionId: event.target.value })
        }
      >
        <option value="">{t("widgets.pickAction")}</option>
        {actions
          .filter((entry) => entry.inputs.every((input) => !input.required))
          .map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.title} ({entry.pluginName})
            </option>
          ))}
      </Select2>
      {action && action.scope !== "server" && (
        <>
          <span className="font-medium text-muted-foreground">
            {t("run.host")}
          </span>
          <Select2
            className={field}
            value={config.hostId || ""}
            onChange={(event) =>
              onChange({ ...config, hostId: Number(event.target.value) })
            }
          >
            <option value="">{t("form.choose")}</option>
            {usable.map((host) => (
              <option key={host.id} value={host.id}>
                {hostLabel(host)}
              </option>
            ))}
          </Select2>
        </>
      )}
      {action?.scope === "resource" && (
        <>
          <span className="font-medium text-muted-foreground">
            {t("run.target")}
          </span>
          <Input
            value={config.resourceKey}
            onChange={(event) =>
              onChange({ ...config, resourceKey: event.target.value })
            }
          />
        </>
      )}
      <span className="font-medium text-muted-foreground">
        {t("widgets.label")}
      </span>
      <Input
        value={config.label}
        placeholder={action?.title}
        onChange={(event) => onChange({ ...config, label: event.target.value })}
      />
    </div>
  );
}

interface LinksConfig {
  /** Group the links by host. */
  byHost: boolean;
}

/** Only real web addresses, so a row can never become a script link. */
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/**
 * Every web address plugins know about, such as proxy routes, found on their
 * own. Nobody has to type these in, and they stay current as routes change.
 */
function AutoLinks({ widget, config }: WidgetProps<LinksConfig>) {
  const { t } = useTranslation();
  const { hosts } = useHosts();
  const catalog = useCatalog();
  const [links, setLinks] = useState<
    { key: string; name: string; url: string; hostId: number }[]
  >([]);

  const load = useCallback(async () => {
    const withUrls = (catalog?.resources ?? []).filter(
      (resource) => resource.url,
    );
    const found: { key: string; name: string; url: string; hostId: number }[] =
      [];
    for (const resource of withUrls) {
      const result = await getResources(resource.id).catch(() => null);
      for (const row of result?.rows ?? []) {
        const url = safeUrl(row.row[resource.url!]);
        if (!url) continue;
        found.push({
          key: `${resource.id}|${row.hostId}|${row.key}`,
          name: String(row.row[resource.name] ?? row.key),
          url,
          hostId: row.hostId,
        });
      }
    }
    setLinks(found);
  }, [catalog]);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), REFRESH_MS * 4);
    return () => clearInterval(timer);
  }, [load]);

  const groups = config.byHost
    ? [...new Set(links.map((link) => link.hostId))].map((hostId) => ({
        title:
          hostLabel(hosts.find((host) => Number(host.id) === hostId) ?? {}) ||
          String(hostId),
        links: links.filter((link) => link.hostId === hostId),
      }))
    : [{ title: "", links }];

  return (
    <div className="flex h-full w-full flex-col gap-1 overflow-hidden">
      <WidgetTitle title={widget.title} icon={<Globe size={11} />} />
      {links.length === 0 ? (
        <p className="p-2 text-xs text-muted-foreground">
          {t("widgets.noLinks")}
        </p>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-auto">
          {groups.map((group) => (
            <div key={group.title} className="flex flex-col gap-1">
              {group.title && (
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </span>
              )}
              {group.links.map((link) => (
                <a
                  key={link.key}
                  href={link.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="truncate border border-border px-2 py-1 text-xs hover:bg-muted"
                >
                  {link.name}
                </a>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AutoLinksForm({ config, onChange }: EditProps<LinksConfig>) {
  const { t } = useTranslation();
  return (
    <label className="flex items-center gap-2 text-xs">
      <input
        type="checkbox"
        checked={config.byHost}
        onChange={(event) =>
          onChange({ ...config, byHost: event.target.checked })
        }
      />
      {t("widgets.byHost")}
    </label>
  );
}

/** The homepage widgets this plugin adds, when the homepage plugin runs. */
export function registerWidgets(app: TermixApp): void {
  const tiles: WidgetDefinition<TilesConfig> = {
    id: "operations_status_tiles",
    name: app.t("widgets.tiles"),
    description: app.t("widgets.tilesDescription"),
    category: "monitoring",
    icon: <Activity size={14} />,
    defaultConfig: { signals: [], problemsOnly: false },
    defaultSize: { w: GRID * 12, h: GRID * 6 },
    minSize: { w: GRID * 5, h: GRID * 3 },
    components: { view: StatusTiles, editForm: StatusTilesForm },
  };
  const button: WidgetDefinition<ButtonConfig> = {
    id: "operations_action_button",
    name: app.t("widgets.button"),
    description: app.t("widgets.buttonDescription"),
    category: "system",
    icon: <Zap size={14} />,
    defaultConfig: { actionId: "", hostId: 0, resourceKey: "", label: "" },
    defaultSize: { w: GRID * 6, h: GRID * 3 },
    minSize: { w: GRID * 4, h: GRID * 2 },
    components: { view: ActionButton, editForm: ActionButtonForm },
  };
  app.registerExtension("homepage.widgets", tiles as never);
  app.registerExtension("homepage.widgets", button as never);
  const links: WidgetDefinition<LinksConfig> = {
    id: "operations_auto_links",
    name: app.t("widgets.links"),
    description: app.t("widgets.linksDescription"),
    category: "links",
    icon: <Globe size={14} />,
    defaultConfig: { byHost: true },
    defaultSize: { w: GRID * 8, h: GRID * 8 },
    minSize: { w: GRID * 4, h: GRID * 3 },
    components: { view: AutoLinks, editForm: AutoLinksForm },
  };
  app.registerExtension("homepage.widgets", links as never);
}
