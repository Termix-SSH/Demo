import { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Power,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
} from "lucide-react";
import { useToast, useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  FormFooter,
  ListBadge,
  ListRow,
  ListRowAction,
  PanelList,
  TextField,
  useConfirm,
  ToolbarBand,
  LoadingState,
  PanelShell,
} from "@termix-ssh/plugin-sdk/ui";
import type { ClientConfig, ClientView, InterfaceView } from "../shared/types";
import {
  addClient,
  errorCode,
  errorMessage,
  getClientConfig,
  listClients,
  removeClient,
  rotateClient,
  setClientEnabled,
} from "./api";
import { ClientConfigView } from "./ClientConfigView";
import { formatAgo, formatBytes, isConnected } from "./format";

type Mode =
  { kind: "list" } | { kind: "add" } | { kind: "config"; config: ClientConfig };

export function ClientsView({
  hostId,
  item,
}: {
  hostId: number;
  item: InterfaceView;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirm = useConfirm();
  const [clients, setClients] = useState<ClientView[] | null>(null);
  const [failed, setFailed] = useState("");
  const [mode, setMode] = useState<Mode>({ kind: "list" });
  const [name, setName] = useState("");
  const [allowed, setAllowed] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setClients(await listClients(hostId, item.name));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("clients.loadFailed")));
    }
  }, [hostId, item.name, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed)
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  if (!clients) return <LoadingState />;

  if (mode.kind === "config") {
    return (
      <ClientConfigView
        config={mode.config}
        onBack={() => {
          setMode({ kind: "list" });
          void load();
        }}
      />
    );
  }

  const create = async () => {
    setSaving(true);
    setError("");
    try {
      const config = await addClient(hostId, item.name, {
        name: name.trim(),
        allowedIps: allowed.trim() || undefined,
      });
      setName("");
      setAllowed("");
      setMode({ kind: "config", config });
    } catch (e) {
      setError(
        errorCode(e) === "endpoint"
          ? t("clients.needEndpoint")
          : errorMessage(e, t("clients.addFailed")),
      );
    } finally {
      setSaving(false);
    }
  };

  if (mode.kind === "add") {
    return (
      <PanelShell
        chrome={false}
        footer={
          <FormFooter
            onCancel={() => setMode({ kind: "list" })}
            onSave={() => void create()}
            saving={saving}
            saveLabel={t("clients.create")}
            cancelLabel={t("common.cancel")}
            disabled={!name.trim()}
          />
        }
      >
        <div className="flex flex-col gap-3 p-3">
          <TextField
            label={t("clients.name")}
            hint={t("clients.nameHint")}
            value={name}
            onChange={setName}
            placeholder="phone"
            mono
          />
          <TextField
            label={t("clients.allowed")}
            hint={t("clients.allowedHint", { value: item.allowedIps })}
            value={allowed}
            onChange={setAllowed}
            placeholder={item.allowedIps}
            mono
          />
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      </PanelShell>
    );
  }

  const run = async (job: () => Promise<unknown>, fallback: string) => {
    try {
      await job();
      await load();
    } catch (e) {
      toast.error(errorMessage(e, fallback));
    }
  };

  const show = async (client: ClientView) => {
    try {
      setMode({
        kind: "config",
        config: await getClientConfig(hostId, item.name, client.name),
      });
    } catch (e) {
      toast.error(errorMessage(e, t("clients.configFailed")));
    }
  };

  const rotate = async (client: ClientView) => {
    const ok = await confirm({
      title: t("clients.rotateTitle", { name: client.name }),
      description: t("clients.rotateDesc"),
      confirmLabel: t("clients.rotate"),
    });
    if (!ok) return;
    try {
      const config = await rotateClient(hostId, item.name, client.name);
      setMode({ kind: "config", config });
    } catch (e) {
      toast.error(errorMessage(e, t("clients.saveFailed")));
    }
  };

  const remove = async (client: ClientView) => {
    const ok = await confirm({
      title: t("clients.deleteTitle", { name: client.name }),
      description: t("clients.deleteDesc"),
      confirmLabel: t("common.delete"),
    });
    if (ok) {
      await run(
        () => removeClient(hostId, item.name, client.name),
        t("clients.deleteFailed"),
      );
    }
  };

  return (
    <div className="flex flex-col">
      <ToolbarBand>
        <Button variant="outline" onClick={() => setMode({ kind: "add" })}>
          {t("clients.add")}
        </Button>
        <Button variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCw className="size-4" />
        </Button>
      </ToolbarBand>
      {clients.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-muted-foreground/60">
          {t("clients.empty")}
        </p>
      ) : (
        <PanelList>
          {clients.map((client, index) => (
            <ListRow
              key={client.name}
              stripe={index}
              icon={<Smartphone className="size-4" />}
              title={client.name}
              dimmed={!client.enabled}
              tone={isConnected(client.latestHandshake) ? "brand" : undefined}
              badges={
                <>
                  {!client.enabled && <ListBadge>{t("clients.off")}</ListBadge>}
                  {client.enabled && isConnected(client.latestHandshake) && (
                    <ListBadge>{t("clients.connected")}</ListBadge>
                  )}
                  {!client.managed && (
                    <ListBadge>{t("clients.external")}</ListBadge>
                  )}
                </>
              }
              meta={
                <span className="font-mono">
                  {client.allowedIps.join(", ")}
                  {client.latestHandshake > 0
                    ? ` | ${t("clients.handshake", { ago: formatAgo(client.latestHandshake) })} | ${formatBytes(client.rx)} / ${formatBytes(client.tx)}`
                    : ""}
                </span>
              }
              actions={
                <>
                  {client.hasConfig && (
                    <ListRowAction
                      label={t("clients.showConfig")}
                      onClick={() => void show(client)}
                    >
                      <QrCode className="size-4" />
                    </ListRowAction>
                  )}
                  {client.managed && (
                    <ListRowAction
                      label={t("clients.rotate")}
                      onClick={() => void rotate(client)}
                    >
                      <KeyRound className="size-4" />
                    </ListRowAction>
                  )}
                  <ListRowAction
                    label={
                      client.enabled
                        ? t("clients.turnOff")
                        : t("clients.turnOn")
                    }
                    onClick={() =>
                      void run(
                        () =>
                          setClientEnabled(
                            hostId,
                            item.name,
                            client.name,
                            !client.enabled,
                          ),
                        t("clients.saveFailed"),
                      )
                    }
                  >
                    <Power className="size-4" />
                  </ListRowAction>
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    onClick={() => void remove(client)}
                  >
                    <Trash2 className="size-4" />
                  </ListRowAction>
                </>
              }
            />
          ))}
        </PanelList>
      )}
    </div>
  );
}
