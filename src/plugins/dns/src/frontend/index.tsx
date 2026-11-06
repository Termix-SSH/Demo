import { useCallback, useEffect, useMemo, useState } from "react";
import { dnsWidget } from "./HomepageWidget";
import { Globe, KeyRound, Pencil, Plug, Trash2 } from "lucide-react";
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
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  Account,
  AccountInput,
  DomainRow,
  Link,
  LinkInput,
  ProviderInfo,
} from "../shared/types";
import { createApi, errorMessage, type ZoneList } from "./api";
import { AccountForm } from "./AccountForm";
import { DnsCard } from "./DnsCard";
import { DomainsView } from "./DomainsView";
import { LinkForm } from "./LinkForm";
import { LinksView } from "./LinksView";
import { ZoneView } from "./ZoneView";

const TAB_ID = "dns";

type Section = "zones" | "domains" | "links" | "accounts";

type Overlay =
  | { kind: "zone"; accountId: number; zoneId: string }
  | { kind: "account"; account: Account | null }
  | { kind: "link"; link: Link | null }
  | null;

function DnsTab({ isVisible }: TabProps) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const canEdit = usePermission("edit");
  const canManage = usePermission("manage");
  const pluginApi = usePluginApi();
  const api = useMemo(() => createApi(pluginApi), [pluginApi]);
  const [section, setSection] = useState<Section>("zones");
  const [overlay, setOverlay] = useState<Overlay>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [zoneList, setZoneList] = useState<ZoneList>({ zones: [], errors: [] });
  const [domains, setDomains] = useState<DomainRow[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setBusy(true);
    try {
      const [known, list, zones, doms, lnks] = await Promise.all([
        api.providers(),
        api.accounts(),
        api.zones(),
        api.domains(),
        api.links(),
      ]);
      setProviders(known);
      setAccounts(list);
      setZoneList(zones);
      setDomains(doms);
      setLinks(lnks);
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
      toast.success(
        t("account.testOk", {
          zones: result.zones,
          domains: result.domains ?? 0,
        }),
      );
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

  async function saveLink(link: Link | null, input: LinkInput) {
    try {
      if (link) await api.updateLink(link.id, input);
      else await api.createLink(input);
      toast.success(t("saved"));
      setOverlay(null);
      await reload();
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function refreshDomains() {
    setBusy(true);
    try {
      const result = await api.refreshDomains();
      if (result.failed > 0) {
        toast.error(t("domains.refreshFailed", { count: result.failed }));
      }
      setDomains(await api.domains());
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  if (overlay?.kind === "zone") {
    const zone = zoneList.zones.find(
      (item) =>
        item.accountId === overlay.accountId && item.id === overlay.zoneId,
    );
    const provider = providers.find((item) => item.id === zone?.provider);
    if (zone && provider) {
      return (
        <ZoneView
          api={api}
          zone={zone}
          provider={provider}
          canEdit={canEdit}
          canManage={canManage}
          onBack={() => setOverlay(null)}
        />
      );
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
  if (overlay?.kind === "link") {
    return (
      <LinkForm
        link={overlay.link}
        api={api}
        zones={zoneList.zones}
        providers={providers}
        onBack={() => setOverlay(null)}
        onSave={(input) => saveLink(overlay.link, input)}
      />
    );
  }

  return (
    <PanelShell
      icon={<Globe className="size-4" />}
      title={t("tab.title")}
      status={t("summary", {
        zones: zoneList.zones.length,
        domains: domains.length,
      })}
      actions={
        <>
          <RefreshButton
            onClick={() =>
              void (section === "domains" && canEdit
                ? refreshDomains()
                : reload())
            }
            loading={busy}
            label={t("refresh")}
          />
          {canManage && section === "accounts" && (
            <AddButton
              label={t("account.add")}
              onClick={() => setOverlay({ kind: "account", account: null })}
            />
          )}
          {canManage && section === "links" && (
            <AddButton
              label={t("link.add")}
              onClick={() => setOverlay({ kind: "link", link: null })}
            />
          )}
        </>
      }
      tabs={
        <TabStrip
          tabs={[
            { id: "zones", label: t("section.zones") },
            { id: "domains", label: t("section.domains") },
            { id: "links", label: t("section.links") },
            { id: "accounts", label: t("section.accounts") },
          ]}
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
        />
      }
      scroll
    >
      {!loaded && <LoadingState />}
      {section === "zones" && (
        <>
          {zoneList.errors.map((item) => (
            <p
              key={item.accountId}
              className="border-b border-border px-3 py-2 text-xs text-destructive"
            >
              {item.name}: {item.error}
            </p>
          ))}
          <PanelList
            empty={
              loaded ? (
                <EmptyState
                  icon={Globe}
                  title={t("zones.empty")}
                  hint={t("zones.emptyHint")}
                />
              ) : null
            }
          >
            {zoneList.zones.map((zone, index) => (
              <ListRow
                key={`${zone.accountId}-${zone.id}`}
                stripe={index}
                icon={<Globe />}
                title={zone.name}
                badges={
                  <ListBadge tone="muted">
                    {t(`providers.${zone.provider}`)}
                  </ListBadge>
                }
                meta={zone.accountName}
                onClick={() =>
                  setOverlay({
                    kind: "zone",
                    accountId: zone.accountId,
                    zoneId: zone.id,
                  })
                }
              />
            ))}
          </PanelList>
        </>
      )}
      {section === "domains" && (
        <DomainsView
          api={api}
          domains={domains}
          canManage={canManage}
          loaded={loaded}
          onChanged={() => void reload()}
        />
      )}
      {section === "links" && (
        <LinksView
          api={api}
          links={links}
          canEdit={canEdit}
          canManage={canManage}
          loaded={loaded}
          onEdit={(link) => setOverlay({ kind: "link", link })}
          onChanged={() => void reload()}
        />
      )}
      {section === "accounts" && (
        <PanelList
          empty={
            loaded ? (
              <EmptyState
                icon={KeyRound}
                title={t("account.empty")}
                hint={t("account.emptyHint")}
              />
            ) : null
          }
        >
          {accounts.map((account, index) => (
            <ListRow
              key={account.id}
              stripe={index}
              tone={account.status === "error" ? "destructive" : "none"}
              icon={<KeyRound />}
              title={account.name}
              badges={
                <ListBadge tone="muted">
                  {t(`providers.${account.provider}`)}
                </ListBadge>
              }
              meta={
                account.status === "error"
                  ? (account.lastError ?? t("account.failed"))
                  : account.lastSyncAt
                    ? t("account.lastSync", {
                        date: new Date(account.lastSyncAt).toLocaleString(),
                      })
                    : t("account.never")
              }
              actions={
                canManage ? (
                  <>
                    <ListRowAction
                      label={t("account.test")}
                      onClick={() => void testAccount(account)}
                    >
                      <Plug />
                    </ListRowAction>
                    <ListRowAction
                      label={t("edit")}
                      onClick={() => setOverlay({ kind: "account", account })}
                    >
                      <Pencil />
                    </ListRowAction>
                    <ListRowAction
                      label={t("delete")}
                      tone="destructive"
                      onClick={() => void removeAccount(account)}
                    >
                      <Trash2 />
                    </ListRowAction>
                  </>
                ) : undefined
              }
            />
          ))}
        </PanelList>
      )}
    </PanelShell>
  );
}

export function activate(app: TermixApp): void {
  app.registerRailItem({
    id: TAB_ID,
    icon: Globe,
    titleKey: "tab.title",
    kind: "tab",
    permission: "view",
  });
  app.registerTab(TAB_ID, DnsTab, {
    icon: Globe,
    titleKey: "tab.title",
    singleton: true,
    hostless: true,
  });
  app.registerExtension("homepage.widgets", dnsWidget(app.t));

  app.registerDashboardCard({
    id: "dns-domains",
    titleKey: "card.title",
    defaultPanel: "side",
    defaultHeight: 180,
    frame: "framed",
    component: DnsCard,
  });
}
