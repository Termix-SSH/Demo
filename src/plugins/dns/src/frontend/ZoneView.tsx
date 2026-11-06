import { useCallback, useEffect, useMemo, useState } from "react";
import { Globe, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  AddButton,
  BackButton,
  DataTable,
  DataTableRow,
  EmptyState,
  Input,
  ListBadge,
  LoadingState,
  PanelShell,
  RefreshButton,
  TabStrip,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type {
  DnsRecord,
  ProviderInfo,
  RecordInput,
  ZoneRef,
} from "../shared/types";
import { errorMessage, type DnsApi } from "./api";
import { CopiesPanel } from "./CopiesPanel";
import { FilesPanel } from "./FilesPanel";
import { formatTtl } from "./format";
import { HealthPanel } from "./HealthPanel";
import { RecordForm } from "./RecordForm";

type Section = "records" | "health" | "copies" | "files";

const th =
  "px-3 py-1.5 text-left text-[10px] font-bold uppercase tracking-widest text-muted-foreground";
const td = "px-3 py-1.5 text-xs";
const iconButton =
  "inline-flex size-7 items-center justify-center border border-transparent text-muted-foreground hover:border-border hover:text-foreground disabled:opacity-40";

export function ZoneView({
  api,
  zone,
  provider,
  canEdit,
  canManage,
  onBack,
}: {
  api: DnsApi;
  zone: ZoneRef;
  provider: ProviderInfo;
  canEdit: boolean;
  canManage: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [section, setSection] = useState<Section>("records");
  const [records, setRecords] = useState<DnsRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState<{ record: DnsRecord | null } | null>(null);
  const features = provider.features;

  const load = useCallback(
    async (fresh = false) => {
      setBusy(true);
      try {
        setRecords(await api.records(zone.accountId, zone.id, fresh));
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setLoaded(true);
        setBusy(false);
      }
    },
    [api, zone.accountId, zone.id],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return records
      .filter(
        (record) =>
          !needle ||
          [record.type, record.name, record.content]
            .join(" ")
            .toLowerCase()
            .includes(needle),
      )
      .sort((a, b) =>
        a.name === b.name
          ? a.type.localeCompare(b.type)
          : a.name === "@"
            ? -1
            : b.name === "@"
              ? 1
              : a.name.localeCompare(b.name),
      );
  }, [records, filter]);

  async function save(input: RecordInput, record: DnsRecord | null) {
    try {
      await api.saveRecord(zone.accountId, zone.id, input, record?.id);
      toast.success(t("saved"));
      setForm(null);
      await load(true);
      return true;
    } catch (error) {
      toast.error(errorMessage(error));
      return false;
    }
  }

  async function remove(record: DnsRecord) {
    const ok = await confirm({
      title: t("record.deleteConfirm", {
        name: record.name,
        type: record.type,
      }),
      confirmLabel: t("delete"),
    });
    if (!ok) return;
    try {
      await api.deleteRecord(zone.accountId, zone.id, record.id);
      await load(true);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  if (form) {
    return (
      <RecordForm
        zoneName={zone.name}
        record={form.record}
        features={features}
        onBack={() => setForm(null)}
        onSave={(input) => save(input, form.record)}
      />
    );
  }

  return (
    <PanelShell
      icon={<Globe className="size-4" />}
      title={zone.name}
      status={`${zone.accountName} | ${t(`providers.${zone.provider}`)}`}
      leading={<BackButton onClick={onBack} label={t("back")} />}
      actions={
        <>
          <RefreshButton
            onClick={() => void load(true)}
            loading={busy}
            label={t("refresh")}
          />
          {canEdit && section === "records" && (
            <AddButton
              label={t("record.add")}
              onClick={() => setForm({ record: null })}
            />
          )}
        </>
      }
      tabs={
        <TabStrip
          tabs={[
            { id: "records", label: t("zone.records") },
            { id: "health", label: t("zone.health") },
            { id: "copies", label: t("zone.copies") },
            { id: "files", label: t("zone.files") },
          ]}
          activeTab={section}
          onTabChange={(id) => setSection(id as Section)}
        />
      }
      scroll
    >
      {section === "records" && (
        <>
          <div className="border-b border-border px-3 py-2">
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t("zone.filter")}
              className="h-8 text-xs"
            />
          </div>
          {!loaded && <LoadingState />}
          {loaded && shown.length === 0 && (
            <EmptyState icon={Globe} title={t("zone.empty")} />
          )}
          {shown.length > 0 && (
            <DataTable>
              <thead>
                <tr>
                  <th className={th}>{t("record.type")}</th>
                  <th className={th}>{t("record.name")}</th>
                  <th className={th}>{t("record.value")}</th>
                  <th className={th}>{t("record.ttl")}</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody>
                {shown.map((record) => (
                  <DataTableRow key={record.id}>
                    <td className={td}>
                      <ListBadge tone="muted">{record.type}</ListBadge>
                    </td>
                    <td className={`${td} font-mono`}>{record.name}</td>
                    <td className={`${td} break-all font-mono`}>
                      {record.priority != null && (
                        <span className="mr-2 text-muted-foreground">
                          {record.priority}
                        </span>
                      )}
                      {record.content}
                      {record.proxied && (
                        <ListBadge tone="warning" className="ml-2">
                          {t("record.proxiedBadge")}
                        </ListBadge>
                      )}
                      {record.comment && (
                        <span className="ml-2 text-muted-foreground">
                          {record.comment}
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {formatTtl(record.ttl, features.autoTtl)}
                    </td>
                    <td className={`${td} whitespace-nowrap text-right`}>
                      {canEdit && !record.readOnly && (
                        <>
                          <button
                            type="button"
                            className={iconButton}
                            title={t("edit")}
                            onClick={() => setForm({ record })}
                          >
                            <Pencil className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            className={iconButton}
                            title={t("delete")}
                            onClick={() => void remove(record)}
                          >
                            <Trash2 className="size-3.5" />
                          </button>
                        </>
                      )}
                      {record.readOnly && (
                        <span className="text-muted-foreground">
                          {t("record.readOnly")}
                        </span>
                      )}
                    </td>
                  </DataTableRow>
                ))}
              </tbody>
            </DataTable>
          )}
        </>
      )}
      {section === "health" && (
        <HealthPanel api={api} accountId={zone.accountId} zoneId={zone.id} />
      )}
      {section === "copies" && (
        <CopiesPanel
          api={api}
          accountId={zone.accountId}
          zoneId={zone.id}
          canEdit={canEdit}
          canManage={canManage}
          onRestored={() => void load(true)}
        />
      )}
      {section === "files" && (
        <FilesPanel
          api={api}
          accountId={zone.accountId}
          zoneId={zone.id}
          canEdit={canEdit}
          onChanged={() => void load(true)}
        />
      )}
    </PanelShell>
  );
}
