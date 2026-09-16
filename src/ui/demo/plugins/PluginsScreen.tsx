import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownWideNarrow,
  ArrowLeft,
  Cpu,
  Check,
  Download,
  ExternalLink,
  Globe,
  MemoryStick,
  Puzzle,
  RotateCcw,
  Search,
  Trash2,
  TriangleAlert,
  Upload,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/button";
import { Card } from "@/components/card";
import { Input } from "@/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/select";
import { Separator } from "@/components/separator";
import { FakeSwitch } from "@/components/section-card";
import { EmptyState } from "@/components/empty-state";
import { TabStrip } from "@/components/tab-strip";
import { PluginIcon, SourceBadge } from "./plugin-bits";
import {
  GroupHeading,
  Facts,
  PANEL,
  Segmented,
} from "@/components/panel-layout";
import { SectionCard } from "@/components/section-card";
import { PluginPermissionDialog } from "./PluginPermissionDialog";
import { CAPABILITY_INFO, type DemoPlugin } from "./plugin-data";
import {
  getPlugins,
  getRegistries,
  installPlugin,
  retryPlugin,
  setAutoUpdate,
  setPluginEnabled,
  setRegistryEnabled,
  subscribePlugins,
  uninstallPlugin,
  updatePlugin,
} from "./plugin-store";

// Opened from the rail's bottom group, next to alerts and settings. It takes
// the whole window rather than a tab: installing a plugin changes the shape of
// the app, so it is a place you go and come back from, not another workspace.

type Section = "installed" | "browse" | "updates";

/** `chrome={false}` nests this inside the settings surface, which draws its
 * own header, so the screen does not repeat the title row. */
/** Shown wherever a required plugin's controls are greyed out. */
const REQUIRED_REASON = "Termix needs this to connect to anything.";

export function PluginsScreen({ chrome = true }: { chrome?: boolean } = {}) {
  const [plugins, setPlugins] = useState(getPlugins);
  const [registries, setRegistries] = useState(getRegistries);
  const [section, setSection] = useState<Section>("installed");
  const [query, setQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [consent, setConsent] = useState<{
    plugin: DemoPlugin;
    mode: "install" | "update";
  } | null>(null);

  useEffect(
    () =>
      subscribePlugins(() => {
        setPlugins([...getPlugins()]);
        setRegistries([...getRegistries()]);
      }),
    [],
  );

  useEffect(() => {
    if (!detailId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !consent) setDetailId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detailId, consent]);

  const installed = plugins.filter((p) => p.installed);
  const updates = installed.filter((p) => p.latestVersion);
  const detail = plugins.find((p) => p.id === detailId) ?? null;

  function askInstall(plugin: DemoPlugin) {
    setConsent({ plugin, mode: "install" });
  }

  // An update that adds a capability never applies on its own, even with
  // auto-update on. That is the whole anti-abuse control.
  function askOrRunUpdate(plugin: DemoPlugin) {
    if (plugin.addedCapabilities?.length) {
      setConsent({ plugin, mode: "update" });
      return;
    }
    updatePlugin(plugin.id);
  }

  const tabs = [
    {
      id: "installed",
      label: `Installed (${installed.length})`,
      icon: <Puzzle className="size-3" />,
    },
    { id: "browse", label: "Browse", icon: <Globe className="size-3" /> },
    {
      id: "updates",
      label: updates.length ? `Updates (${updates.length})` : "Updates",
      icon: <Download className="size-3" />,
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-background">
      {/* The app's header idiom: h-12.5, vertical separators, w-12.5 icon
          buttons that fill the row. The section nav sits on its own row below
          so TabStrip's underline lands on a real border. */}
      {chrome && (
        <header className="flex h-12.5 shrink-0 flex-row items-center border-b border-border">
          {detail && (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-full w-12.5 rounded-none text-muted-foreground hover:text-foreground"
                onClick={() => setDetailId(null)}
                title="Back"
              >
                <ArrowLeft className="size-3.5" />
              </Button>
              <Separator orientation="vertical" />
            </>
          )}
          <div className="flex flex-1 items-center gap-2 px-3">
            <Puzzle className="size-4 shrink-0 text-accent-brand" />
            <span className="truncate text-base font-bold tracking-tight">
              {detail ? detail.name : "Plugins"}
            </span>
          </div>
        </header>
      )}

      {!detail && (
        <div className="shrink-0 border-b border-border">
          <TabStrip
            tabs={tabs}
            activeTab={section}
            onTabChange={(id) => setSection(id as Section)}
          />
        </div>
      )}

      {/* Without the header there is no back button, so the nested copy grows
          its own row rather than trapping you in the detail view. */}
      {detail && !chrome && (
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
            onClick={() => setDetailId(null)}
          >
            <ArrowLeft className="size-3.5" />
            {detail.name}
          </Button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {detail ? (
          <DetailView
            plugin={detail}
            onInstall={() => askInstall(detail)}
            onUpdate={() => askOrRunUpdate(detail)}
            onUninstall={() => {
              uninstallPlugin(detail.id);
              setDetailId(null);
            }}
          />
        ) : section === "installed" ? (
          <InstalledSection
            plugins={installed}
            query={query}
            onQuery={setQuery}
            onOpen={setDetailId}
            onUpdate={askOrRunUpdate}
          />
        ) : section === "browse" ? (
          <BrowseSection
            plugins={plugins}
            registries={registries}
            query={query}
            onQuery={setQuery}
            onOpen={setDetailId}
            onInstall={askInstall}
            onToggleRegistry={setRegistryEnabled}
          />
        ) : (
          <UpdatesSection
            plugins={updates}
            onOpen={setDetailId}
            onUpdate={askOrRunUpdate}
          />
        )}
      </div>

      <PluginPermissionDialog
        plugin={consent?.plugin ?? null}
        mode={consent?.mode ?? "install"}
        open={!!consent}
        onOpenChange={(o) => !o && setConsent(null)}
        onConfirm={() => {
          if (!consent) return;
          if (consent.mode === "install") installPlugin(consent.plugin.id);
          else updatePlugin(consent.plugin.id);
        }}
      />
    </div>
  );
}

type SourceFilter = "all" | "official" | "community";

const SOURCE_FILTERS = [
  { value: "all", label: "All" },
  { value: "official", label: "Official" },
  { value: "community", label: "Community" },
] as const satisfies readonly { value: SourceFilter; label: string }[];

/** Anything not from the official registry counts as community here. */
function matchesSource(plugin: DemoPlugin, filter: SourceFilter): boolean {
  if (filter === "all") return true;
  if (filter === "official") return plugin.source === "official";
  return plugin.source !== "official";
}

function sourceCounts(plugins: DemoPlugin[]): Record<SourceFilter, number> {
  return {
    all: plugins.length,
    official: plugins.filter((p) => p.source === "official").length,
    community: plugins.filter((p) => p.source !== "official").length,
  };
}

type SortKey = "downloads" | "name" | "updated";

const SORT_LABELS: Record<SortKey, string> = {
  downloads: "Most installed",
  name: "Name",
  updated: "Recently updated",
};

/** "128k" / "9.4k" / "340" as a number, so the fixtures stay display strings. */
function downloadCount(value: string): number {
  const n = parseFloat(value);
  return value.toLowerCase().includes("k") ? n * 1000 : n;
}

function latestPublished(plugin: DemoPlugin): string {
  return (
    plugin.history
      .map((h) => h.publishedAt)
      .sort()
      .at(-1) ?? ""
  );
}

function sortPlugins(plugins: DemoPlugin[], key: SortKey): DemoPlugin[] {
  const sorted = [...plugins];
  if (key === "name") {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (key === "downloads") {
    sorted.sort(
      (a, b) => downloadCount(b.downloads) - downloadCount(a.downloads),
    );
  } else {
    sorted.sort((a, b) => latestPublished(b).localeCompare(latestPublished(a)));
  }
  return sorted;
}

function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (next: SortKey) => void;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as SortKey)}>
      <SelectTrigger size="sm" className="w-auto gap-1.5 text-xs">
        <ArrowDownWideNarrow className="size-3.5 text-muted-foreground" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
          <SelectItem key={k} value={k} className="text-xs">
            {SORT_LABELS[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Toolbar({
  query,
  onQuery,
  placeholder,
  children,
}: {
  query: string;
  onQuery: (v: string) => void;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative max-w-xs flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={placeholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
      {children}
    </div>
  );
}

function InstalledSection({
  plugins,
  query,
  onQuery,
  onOpen,
  onUpdate,
}: {
  plugins: DemoPlugin[];
  query: string;
  onQuery: (v: string) => void;
  onOpen: (id: string) => void;
  onUpdate: (p: DemoPlugin) => void;
}) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [sort, setSort] = useState<SortKey>("name");

  const q = query.trim().toLowerCase();
  const searched = plugins.filter(
    (p) => !q || p.name.toLowerCase().includes(q),
  );
  const counts = sourceCounts(searched);
  const rows = sortPlugins(
    searched.filter((p) => matchesSource(p, source)),
    sort,
  );

  const running = rows.filter((p) => p.state === "enabled");
  const stopped = rows.filter((p) => p.state !== "enabled");

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <Toolbar query={query} onQuery={onQuery} placeholder="Search installed">
        <Segmented<SourceFilter>
          value={source}
          onChange={setSource}
          options={SOURCE_FILTERS.map((f) => ({
            ...f,
            count: counts[f.value],
          }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <SortSelect value={sort} onChange={setSort} />
          <Button variant="outline" className="gap-1.5">
            <Download className="size-3.5" />
            Update all
          </Button>
        </div>
      </Toolbar>

      {rows.length === 0 ? (
        <EmptyState icon={Puzzle} title="Nothing matches that." />
      ) : (
        <>
          <Group title="Running" count={running.length}>
            {running.map((p) => (
              <InstalledCard
                key={p.id}
                plugin={p}
                onOpen={() => onOpen(p.id)}
                onUpdate={() => onUpdate(p)}
              />
            ))}
          </Group>
          {stopped.length > 0 && (
            <Group title="Not running" count={stopped.length}>
              {stopped.map((p) => (
                <InstalledCard
                  key={p.id}
                  plugin={p}
                  onOpen={() => onOpen(p.id)}
                  onUpdate={() => onUpdate(p)}
                />
              ))}
            </Group>
          )}
        </>
      )}
    </div>
  );
}

function Group({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <GroupHeading title={title} count={count} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {children}
      </div>
    </section>
  );
}

function InstalledCard({
  plugin,
  onOpen,
  onUpdate,
}: {
  plugin: DemoPlugin;
  onOpen: () => void;
  onUpdate: () => void;
}) {
  const enabled = plugin.state === "enabled";
  const failed = plugin.state === "failed";
  const required = plugin.required === true;

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <button
        onClick={onOpen}
        className="group/open flex items-start gap-3 p-3 text-left"
      >
        <PluginIcon name={plugin.icon} muted={!enabled} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span
              className={`truncate text-sm font-semibold transition-colors group-hover/open:text-accent-brand ${enabled ? "" : "text-muted-foreground"}`}
            >
              {plugin.name}
            </span>
            <SourceBadge source={plugin.source} />
          </div>
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {plugin.description}
          </span>
          <Facts className="text-[10px] text-muted-foreground/70">
            <span>{plugin.author}</span>
            <span>v{plugin.version}</span>
            <span>{plugin.contributes.join(", ")}</span>
          </Facts>
        </div>
      </button>

      {failed && (
        <div className="flex items-center gap-2 border-t border-border bg-destructive/5 px-3 py-2">
          <TriangleAlert className="size-3.5 shrink-0 text-destructive" />
          <span className="flex-1 text-[11px] text-muted-foreground">
            Stopped unexpectedly
          </span>
        </div>
      )}

      {!enabled && !failed && (
        <div className="border-t border-border bg-muted/20 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">Disabled</span>
        </div>
      )}

      {/* Only a running worker has resource use to report. */}
      {enabled && (
        <div className="flex items-center gap-4 border-t border-border px-3 py-2">
          <Usage icon={Cpu} value={plugin.cpu} />
          <Usage icon={MemoryStick} value={plugin.ram} />
        </div>
      )}

      <div className="flex items-center gap-1.5 border-t border-border px-3 py-2">
        {plugin.latestVersion && !failed && (
          <Button size="xs" onClick={onUpdate} className="gap-1">
            <Download className="size-3" />
            {plugin.addedCapabilities?.length
              ? "Review update"
              : `Update to ${plugin.latestVersion}`}
          </Button>
        )}
        {failed ? (
          <Button
            variant="outline"
            size="xs"
            className="gap-1"
            onClick={() => retryPlugin(plugin.id)}
          >
            <RotateCcw className="size-3" />
            Restart
          </Button>
        ) : (
          <Button
            variant="outline"
            size="xs"
            disabled={required}
            title={required ? REQUIRED_REASON : undefined}
            onClick={() => setPluginEnabled(plugin.id, !enabled)}
          >
            {enabled ? "Disable" : "Enable"}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={required}
          title={required ? REQUIRED_REASON : "Uninstall"}
          className="ml-auto text-muted-foreground hover:text-destructive"
          onClick={() => uninstallPlugin(plugin.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>
    </Card>
  );
}

function Usage({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <Icon className="size-3 shrink-0 opacity-60" />
      {value}
    </span>
  );
}

function BrowseSection({
  plugins,
  registries,
  query,
  onQuery,
  onOpen,
  onInstall,
  onToggleRegistry,
}: {
  plugins: DemoPlugin[];
  registries: ReturnType<typeof getRegistries>;
  query: string;
  onQuery: (v: string) => void;
  onOpen: (id: string) => void;
  onInstall: (p: DemoPlugin) => void;
  onToggleRegistry: (id: string, on: boolean) => void;
}) {
  const [category, setCategory] = useState("All");
  const [source, setSource] = useState<SourceFilter>("all");
  const [sort, setSort] = useState<SortKey>("downloads");
  // The registry list is setup, not browsing, so it stays out of the way
  // until asked for.
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const active = new Set(registries.filter((r) => r.enabled).map((r) => r.id));
  const visible = plugins.filter((p) => active.has(p.registry));

  // Sort the categories, then pin "All" in front. Sorting after prepending
  // put "AI" ahead of it.
  const categories = useMemo(
    () => ["All", ...[...new Set(visible.map((p) => p.category))].sort()],
    [visible],
  );

  const q = query.trim().toLowerCase();
  const searched = visible.filter(
    (p) =>
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q),
  );
  const counts = sourceCounts(searched);
  const rows = sortPlugins(
    searched.filter((p) => {
      if (category !== "All" && p.category !== category) return false;
      return matchesSource(p, source);
    }),
    sort,
  );

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      <Toolbar query={query} onQuery={onQuery} placeholder="Search plugins">
        <Segmented<SourceFilter>
          value={source}
          onChange={setSource}
          options={SOURCE_FILTERS.map((f) => ({
            ...f,
            count: counts[f.value],
          }))}
        />
        <div className="ml-auto flex items-center gap-2">
          <SortSelect value={sort} onChange={setSort} />
          <Button variant="outline" className="gap-1.5">
            <Upload className="size-3.5" />
            Load from file
          </Button>
          <Button
            variant="outline"
            className="gap-1.5"
            aria-pressed={sourcesOpen}
            onClick={() => setSourcesOpen((v) => !v)}
          >
            <Globe className="size-3.5" />
            Sources
          </Button>
        </div>
      </Toolbar>

      {sourcesOpen && (
        <Card className="overflow-hidden py-0 gap-0">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2">
            <Globe className="size-3.5 text-muted-foreground" />
            <span className="flex-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Sources
            </span>
            <Button
              variant="ghost"
              size="icon-xs"
              title="Hide sources"
              onClick={() => setSourcesOpen(false)}
            >
              <X className="size-3" />
            </Button>
          </div>
          <div className="divide-y divide-border">
            {registries.map((r) => (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-medium">
                      {r.name}
                    </span>
                  </div>
                  <Facts className="text-[10px] text-muted-foreground">
                    <span className="truncate">{r.url}</span>
                    <span className="shrink-0">{r.pluginCount} plugins</span>
                    <span className="shrink-0">checked {r.lastChecked}</span>
                  </Facts>
                </div>
                <FakeSwitch
                  checked={r.enabled}
                  onChange={(v) => onToggleRegistry(r.id, v)}
                />
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-1">
        {categories.map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`border px-2 py-1 text-[11px] font-medium transition-colors ${
              category === c
                ? "border-accent-brand bg-accent-brand/10 text-accent-brand"
                : "border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Puzzle}
          title="Nothing here."
          hint="Try another category, or turn on another source."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {rows.map((p) => (
            <BrowseCard
              key={p.id}
              plugin={p}
              onOpen={() => onOpen(p.id)}
              onInstall={() => onInstall(p)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BrowseCard({
  plugin,
  onOpen,
  onInstall,
}: {
  plugin: DemoPlugin;
  onOpen: () => void;
  onInstall: () => void;
}) {
  const severe = plugin.capabilities.filter(
    (c) => CAPABILITY_INFO[c].risk === "high",
  );

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <button
        onClick={onOpen}
        className="group/open flex flex-1 items-start gap-3 p-3 text-left"
      >
        <PluginIcon name={plugin.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold transition-colors group-hover/open:text-accent-brand">
              {plugin.name}
            </span>
            <SourceBadge source={plugin.source} />
          </div>
          <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
            {plugin.description}
          </span>
          <Facts className="text-[10px] text-muted-foreground/70">
            <span>{plugin.author}</span>
            <span>v{plugin.version}</span>
            <span>{plugin.downloads} installs</span>
          </Facts>
        </div>
      </button>

      <div className="flex items-center gap-2 border-t border-border px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">
          {severe.length > 0
            ? CAPABILITY_INFO[severe[0]].title
            : "No access to your servers"}
        </span>
        {plugin.installed ? (
          <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent-brand">
            <Check className="size-3" />
            Installed
          </span>
        ) : (
          <Button size="xs" onClick={onInstall}>
            {plugin.tier === "store" ? "Install" : "Enable"}
          </Button>
        )}
      </div>
    </Card>
  );
}

function UpdatesSection({
  plugins,
  onOpen,
  onUpdate,
}: {
  plugins: DemoPlugin[];
  onOpen: (id: string) => void;
  onUpdate: (p: DemoPlugin) => void;
}) {
  const gated = plugins.filter((p) => p.addedCapabilities?.length);
  const plain = plugins.filter((p) => !p.addedCapabilities?.length);

  if (plugins.length === 0) {
    return (
      <div className={PANEL.body}>
        <EmptyState icon={Check} title="Everything is up to date." />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${PANEL.gap} ${PANEL.body}`}>
      {plain.length > 0 && (
        <Card className="flex-row items-center gap-3 px-3 py-2.5">
          <span className="flex-1 text-xs text-muted-foreground">
            {plain.length} update{plain.length === 1 ? "" : "s"} ready.
            {gated.length > 0 &&
              ` ${gated.length} more need your say-so first.`}
          </span>
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => plain.forEach((p) => updatePlugin(p.id))}
          >
            <Download className="size-3.5" />
            Update all
          </Button>
        </Card>
      )}

      <div className="flex flex-col gap-3">
        {[...gated, ...plain].map((p) => (
          <UpdateRow
            key={p.id}
            plugin={p}
            onOpen={() => onOpen(p.id)}
            onUpdate={() => onUpdate(p)}
          />
        ))}
      </div>
    </div>
  );
}

function UpdateRow({
  plugin,
  onOpen,
  onUpdate,
}: {
  plugin: DemoPlugin;
  onOpen: () => void;
  onUpdate: () => void;
}) {
  const gated = !!plugin.addedCapabilities?.length;
  const notes = plugin.history.find((h) => h.version === plugin.latestVersion);

  return (
    <Card className="overflow-hidden py-0 gap-0">
      <div className="flex items-start gap-3 p-3">
        <PluginIcon name={plugin.icon} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={onOpen}
              className="truncate text-sm font-semibold hover:text-accent-brand"
            >
              {plugin.name}
            </button>
            <span className="shrink-0 text-[11px] text-muted-foreground">
              {plugin.version} to {plugin.latestVersion}
            </span>
            <SourceBadge source={plugin.source} />
          </div>
          {notes && (
            <span className="text-[11px] leading-snug text-muted-foreground">
              {notes.notes}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">Auto</span>
            <FakeSwitch
              checked={plugin.autoUpdate}
              onChange={(v) => setAutoUpdate(plugin.id, v)}
            />
          </label>
          <Button size="xs" onClick={onUpdate}>
            {gated ? "Review" : "Update"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function DetailView({
  plugin,
  onInstall,
  onUpdate,
  onUninstall,
}: {
  plugin: DemoPlugin;
  onInstall: () => void;
  onUpdate: () => void;
  onUninstall: () => void;
}) {
  const enabled = plugin.state === "enabled";
  const required = plugin.required === true;
  const ordered = (["high", "medium", "low"] as const).flatMap((risk) =>
    plugin.capabilities.filter((c) => CAPABILITY_INFO[c].risk === risk),
  );

  return (
    <div
      className={`mx-auto flex w-full max-w-5xl flex-col ${PANEL.gap} ${PANEL.body}`}
    >
      <Card className="flex-row items-start gap-4 px-4 py-4">
        <PluginIcon name={plugin.icon} size="lg" muted={!enabled} />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold tracking-tight">{plugin.name}</h1>
            <SourceBadge source={plugin.source} />
          </div>
          <span className="text-xs leading-relaxed text-muted-foreground">
            {plugin.about ?? plugin.description}
          </span>
          <Facts className="text-[11px] text-muted-foreground/70">
            <span>{plugin.author}</span>
            <span>v{plugin.version}</span>
            <span>{plugin.downloads} installs</span>
          </Facts>
        </div>
        <div className="flex shrink-0 flex-col gap-1.5">
          {plugin.latestVersion && (
            <Button size="sm" className="gap-1.5" onClick={onUpdate}>
              <Download className="size-3.5" />
              Update to {plugin.latestVersion}
            </Button>
          )}
          {plugin.installed ? (
            <>
              <Button
                variant="outline"
                size="sm"
                disabled={required}
                title={required ? REQUIRED_REASON : undefined}
                onClick={() => setPluginEnabled(plugin.id, !enabled)}
              >
                {enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="gap-1.5"
                disabled={required}
                title={required ? REQUIRED_REASON : undefined}
                onClick={onUninstall}
              >
                <Trash2 className="size-3.5" />
                Uninstall
              </Button>
            </>
          ) : (
            <Button size="sm" className="gap-1.5" onClick={onInstall}>
              <Download className="size-3.5" />
              {plugin.tier === "store" ? "Install" : "Enable"}
            </Button>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2 lg:col-span-2">
          <SectionCard title="What it can do" icon={null}>
            <div className="divide-y divide-border">
              {ordered.map((cap) => {
                const info = CAPABILITY_INFO[cap];
                const severe = info.risk === "high";
                return (
                  <div
                    key={cap}
                    className="flex items-start gap-2.5 px-4 py-2.5"
                  >
                    {/* Only the severe rows are badged; a filler glyph on the
                        rest would read as a list marker. */}
                    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
                      {severe && (
                        <span className="flex size-4 items-center justify-center border border-destructive/50 bg-destructive/10 text-[10px] font-bold text-destructive">
                          !
                        </span>
                      )}
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="text-xs font-medium leading-snug">
                        {info.title}
                      </span>
                      <span className="text-[11px] leading-snug text-muted-foreground">
                        {info.detail}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground/50">
                      {cap}
                    </span>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard title="Version history" icon={null}>
            <div className="divide-y divide-border">
              {plugin.history.map((h) => (
                <div
                  key={h.version}
                  className="flex flex-col gap-0.5 px-4 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold">{h.version}</span>
                    {h.version === plugin.version && plugin.installed && (
                      <span className="border border-accent-brand/40 bg-accent-brand/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-brand">
                        Installed
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground">
                      {h.publishedAt}
                    </span>
                  </div>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    {h.notes}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>

        <div className="flex flex-col gap-2">
          <SectionCard title="Adds to Termix" icon={null}>
            <div className="flex flex-col gap-2 px-4 py-3">
              <div className="flex flex-wrap gap-1">
                {plugin.contributes.map((c) => (
                  <span
                    key={c}
                    className="border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <span className="text-[11px] leading-snug text-muted-foreground/70">
                Uninstall and every one of these disappears. Nothing is left
                greyed out.
              </span>
            </div>
          </SectionCard>

          {plugin.installed && enabled && (
            <SectionCard title="Resource use" icon={null}>
              <div className="flex items-center gap-6 px-4 py-3">
                <Usage icon={Cpu} value={plugin.cpu} />
                <Usage icon={MemoryStick} value={plugin.ram} />
              </div>
            </SectionCard>
          )}

          {plugin.installed && (
            <SectionCard title="Updates" icon={null}>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xs font-medium">Update on its own</span>
                  <span className="text-[11px] leading-snug text-muted-foreground">
                    Never when the update asks for something new.
                  </span>
                </div>
                <FakeSwitch
                  checked={plugin.autoUpdate}
                  onChange={(v) => setAutoUpdate(plugin.id, v)}
                />
              </div>
            </SectionCard>
          )}

          <a
            href={`https://${plugin.repository}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 border border-border bg-card px-3 py-2.5 text-[11px] text-muted-foreground transition-colors hover:border-accent-brand/40 hover:text-foreground"
          >
            <ExternalLink className="size-3.5 shrink-0" />
            <span className="truncate">{plugin.repository}</span>
          </a>

          {plugin.source === "community" && (
            <div className="flex items-start gap-2 border border-warning/30 bg-warning/5 px-3 py-2.5">
              <TriangleAlert className="mt-px size-3.5 shrink-0 text-warning" />
              <span className="text-[11px] leading-snug text-muted-foreground">
                Community plugins are reviewed before listing, not audited. One
                that can run commands on your servers is trusted with your
                servers.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
