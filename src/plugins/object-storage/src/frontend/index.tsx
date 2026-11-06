import { useCallback, useEffect, useMemo, useState } from "react";
import { storageWidget } from "./HomepageWidget";
import { KeyRound, Package, Pencil, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  usePermission,
  usePluginApi,
  useTranslation,
  type TabProps,
  type TermixApp,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  BackButton,
  Button,
  EmptyState,
  Input,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanePrompt,
  PanelList,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
  ToolbarSelect,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Account,
  AccountInput,
  BucketRow,
  ProviderInfo,
} from "../shared/types";
import { createApi, errorMessage } from "./api";
import { AccountForm } from "./AccountForm";
import { ObjectBrowser } from "./ObjectBrowser";
import { SettingsPanel } from "./SettingsPanel";
import { StorageCard } from "./StorageCard";
import { UsagePanel } from "./UsagePanel";
import { formatBytes, limitTone } from "./format";

const TAB_ID = "object-storage";

type Section = "buckets" | "accounts";
type View = "objects" | "usage" | "settings";

type Overlay =
  | { kind: "bucket"; accountId: number; bucket: string }
  | { kind: "account"; account: Account | null }
  | null;

interface Entry extends BucketRow {
  accountId: number;
  accountName: string;
}

function StorageTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canEdit = usePermission("edit");
  const canManage = usePermission("manage");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [section, setSection] = useState<Section>("buckets");
  const [view, setView] = useState<View>("objects");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [errors, setErrors] = useState<
    Array<{ accountId: number; name: string; error: string }>
  >([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState<{
    accountId: number;
    name: string;
  } | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [known, list] = await Promise.all([
        api.providers(),
        api.accounts(),
      ]);
      setProviders(known);
      setAccounts(list);
      const results = await Promise.all(
        list.map(async (account) => {
          try {
            const buckets = await api.buckets(account.id);
            return { account, buckets, error: null as string | null };
          } catch (error) {
            return { account, buckets: [], error: errorMessage(error) };
          }
        }),
      );
      setEntries(
        results.flatMap(({ account, buckets }) =>
          buckets.map((bucket) => ({
            ...bucket,
            accountId: account.id,
            accountName: account.name,
          })),
        ),
      );
      setErrors(
        results
          .filter((item) => item.error)
          .map((item) => ({
            accountId: item.account.id,
            name: item.account.name,
            error: item.error as string,
          })),
      );
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setLoaded(true);
      setBusy(false);
    }
  }, [api]);

  useEffect(() => {
    if (isVisible) void reload();
  }, [isVisible, reload]);

  async function saveAccount(account: Account | null, input: AccountInput) {
    try {
      if (account) await api.updateAccount(account.id, input);
      else await api.createAccount(input);
      toast.success(t("saved"));
      setOverlay(null);
      await reload();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function testAccount(account: Account) {
    try {
      const result = await api.testAccount(account.id);
      toast.success(t("account.testOk", { count: result.buckets }));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      await reload();
    }
  }

  async function removeAccount(account: Account) {
    const ok = await confirm({
      title: t("account.deleteConfirm", { name: account.name }),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await api.removeAccount(account.id);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function createBucket() {
    if (!creating?.name.trim()) return;
    try {
      await api.createBucket(creating.accountId, creating.name.trim());
      setCreating(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function removeBucket(entry: Entry) {
    const ok = await confirm({
      title: t("buckets.deleteConfirm", { name: entry.name }),
      description: t("buckets.deleteHint"),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await api.deleteBucket(entry.accountId, entry.name);
      setOverlay(null);
      await reload();
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (overlay?.kind === "account") {
    return (
      <AccountForm
        account={overlay.account}
        providers={providers}
        onBack={() => setOverlay(null)}
        onSave={(input) => saveAccount(overlay.account, input)}
      />
    );
  }

  if (overlay?.kind === "bucket") {
    const entry =
      entries.find(
        (item) =>
          item.accountId === overlay.accountId && item.name === overlay.bucket,
      ) ?? null;
    return (
      <PanelShell
        icon={<Package className="size-4" />}
        title={overlay.bucket}
        status={accounts.find((a) => a.id === overlay.accountId)?.name}
        leading={
          <BackButton
            onClick={() => {
              setOverlay(null);
              setView("objects");
            }}
            label={t("back")}
          />
        }
        actions={
          canManage && entry ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void removeBucket(entry)}
            >
              <Trash2 className="size-4" />
              {t("buckets.delete")}
            </Button>
          ) : undefined
        }
        tabs={
          <TabStrip
            tabs={[
              { id: "objects", label: t("view.objects") },
              { id: "usage", label: t("view.usage") },
              ...(canManage
                ? [{ id: "settings", label: t("view.settings") }]
                : []),
            ]}
            activeTab={view}
            onTabChange={(id) => setView(id as View)}
          />
        }
        scroll={false}
      >
        {view === "objects" && (
          <ObjectBrowser
            api={api}
            accountId={overlay.accountId}
            bucket={overlay.bucket}
            canEdit={canEdit}
          />
        )}
        {view === "usage" && (
          <UsagePanel
            api={api}
            accountId={overlay.accountId}
            bucket={overlay.bucket}
            row={entry}
            canScan={canEdit}
            onScanned={() => void reload()}
          />
        )}
        {view === "settings" && canManage && (
          <SettingsPanel
            api={api}
            accountId={overlay.accountId}
            bucket={overlay.bucket}
            row={entry}
            onLimit={() => void reload()}
          />
        )}
      </PanelShell>
    );
  }

  const failing = accounts.filter((account) => account.status === "error");

  return (
    <PanelShell
      icon={<Package className="size-4" />}
      title={t("tab.title")}
      status={
        failing.length
          ? t("status.failing", { count: failing.length })
          : t("status.buckets", { count: entries.length })
      }
      actions={
        <>
          <RefreshButton onClick={() => void reload()} loading={busy} />
          {canManage && section === "accounts" && (
            <AddButton
              label={t("account.add")}
              onClick={() => setOverlay({ kind: "account", account: null })}
            />
          )}
          {canManage && section === "buckets" && accounts.length > 0 && (
            <AddButton
              label={t("buckets.add")}
              onClick={() =>
                setCreating({ accountId: accounts[0].id, name: "" })
              }
            />
          )}
        </>
      }
      tabs={
        <TabStrip
          tabs={[
            { id: "buckets", label: t("section.buckets") },
            { id: "accounts", label: t("section.accounts") },
          ]}
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
        />
      }
      scroll
    >
      {!loaded ? (
        <LoadingState />
      ) : section === "buckets" ? (
        <>
          {errors.map((item) => (
            <p
              key={item.accountId}
              className="border-b border-border px-3 py-2 text-xs text-destructive"
            >
              {item.name}: {item.error}
            </p>
          ))}
          <PanelList
            empty={
              <EmptyState
                icon={Package}
                title={t(accounts.length ? "buckets.empty" : "accounts.empty")}
                hint={
                  accounts.length
                    ? t("buckets.emptyHint")
                    : canManage
                      ? t("accounts.emptyHint")
                      : undefined
                }
              />
            }
          >
            {entries.map((entry, index) => {
              const percent =
                entry.maxBytes && entry.bytes !== null
                  ? Math.round((entry.bytes / entry.maxBytes) * 100)
                  : null;
              return (
                <ListRow
                  key={`${entry.accountId}:${entry.name}`}
                  stripe={index}
                  icon={<Package className="size-3.5" />}
                  title={entry.name}
                  badges={
                    <>
                      <ListBadge tone="muted">{entry.accountName}</ListBadge>
                      {percent !== null && percent >= 80 && (
                        <ListBadge
                          tone={
                            limitTone(percent) === "bad"
                              ? "destructive"
                              : "warning"
                          }
                        >
                          {percent}%
                        </ListBadge>
                      )}
                    </>
                  }
                  meta={
                    entry.bytes === null
                      ? t("buckets.notScanned")
                      : `${formatBytes(entry.bytes)} | ${t("usage.objects", { count: entry.objects ?? 0 })}${entry.partial ? ` | ${t("usage.partial")}` : ""}`
                  }
                  onClick={() => {
                    setView("objects");
                    setOverlay({
                      kind: "bucket",
                      accountId: entry.accountId,
                      bucket: entry.name,
                    });
                  }}
                />
              );
            })}
          </PanelList>
        </>
      ) : (
        <PanelList
          empty={
            <EmptyState
              icon={KeyRound}
              title={t("accounts.empty")}
              hint={canManage ? t("accounts.emptyHint") : undefined}
            />
          }
        >
          {accounts.map((account, index) => (
            <ListRow
              key={account.id}
              stripe={index}
              tone={account.status === "error" ? "destructive" : "none"}
              icon={<KeyRound className="size-3.5" />}
              title={account.name}
              badges={
                <>
                  <ListBadge tone="muted">
                    {t(`providers.${account.provider}`)}
                  </ListBadge>
                  <ListBadge
                    tone={
                      account.status === "ok"
                        ? "success"
                        : account.status === "error"
                          ? "destructive"
                          : "muted"
                    }
                  >
                    {t(`account.status.${account.status}`)}
                  </ListBadge>
                </>
              }
              meta={account.lastError ?? account.endpoint}
              actions={
                canManage && (
                  <>
                    <ListRowAction
                      label={t("account.test")}
                      onClick={() => void testAccount(account)}
                    >
                      <Plug className="size-3.5" />
                    </ListRowAction>
                    <ListRowAction
                      label={t("edit")}
                      onClick={() => setOverlay({ kind: "account", account })}
                    >
                      <Pencil className="size-3.5" />
                    </ListRowAction>
                    <ListRowAction
                      label={t("delete")}
                      tone="destructive"
                      onClick={() => void removeAccount(account)}
                    >
                      <Trash2 className="size-3.5" />
                    </ListRowAction>
                  </>
                )
              }
            />
          ))}
        </PanelList>
      )}

      <PanePrompt
        open={!!creating}
        title={t("buckets.add")}
        description={t("buckets.nameHint")}
        onCancel={() => setCreating(null)}
        actions={
          <>
            <Button variant="outline" onClick={() => setCreating(null)}>
              {t("cancel")}
            </Button>
            <Button onClick={() => void createBucket()}>
              {t("buckets.create")}
            </Button>
          </>
        }
      >
        {creating && (
          <div className="space-y-2">
            {accounts.length > 1 && (
              <ToolbarSelect
                className="w-full"
                label={t("operations.account")}
                value={String(creating.accountId)}
                onChange={(next) =>
                  setCreating({ ...creating, accountId: Number(next) })
                }
                options={accounts.map((account) => ({
                  value: String(account.id),
                  label: account.name,
                }))}
              />
            )}
            <Input
              autoFocus
              value={creating.name}
              onChange={(event) =>
                setCreating({ ...creating, name: event.target.value })
              }
              onKeyDown={(event) =>
                event.key === "Enter" && void createBucket()
              }
              placeholder={t("buckets.namePlaceholder")}
            />
          </div>
        )}
      </PanePrompt>
    </PanelShell>
  );
}

export function activate(app: TermixApp): void {
  app.registerRailItem({
    id: TAB_ID,
    icon: Package,
    titleKey: "tab.title",
    kind: "tab",
    permission: "view",
  });
  app.registerTab(TAB_ID, StorageTab, {
    icon: Package,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerExtension("homepage.widgets", storageWidget(app.t));

  app.registerDashboardCard({
    id: "object-storage-usage",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 180,
    frame: "framed",
    component: StorageCard,
  });
}
