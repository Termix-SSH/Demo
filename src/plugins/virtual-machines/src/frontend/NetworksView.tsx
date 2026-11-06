import { useCallback, useEffect, useState } from "react";
import { Network, Play, Square, Trash2 } from "lucide-react";
import { useTranslation } from "@termix-ssh/plugin-sdk/frontend";
import {
  Button,
  EmptyState,
  ListBadge,
  ListRow,
  ListRowAction,
  LoadingState,
  PanelList,
  SectionCard,
  SelectField,
  TextField,
  TileStack,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { LeaseRow, NetworkRow } from "../shared/types";
import {
  createNetwork,
  deleteNetwork,
  errorMessage,
  getLeases,
  getNetworks,
  networkAction,
} from "./api";
import { statusText } from "./format";
import { useAction } from "./useAction";

type Kind = "nat" | "isolated" | "bridge";

export function NetworksView({
  hostId,
  isVisible,
}: {
  hostId: number;
  isVisible: boolean;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const [rows, setRows] = useState<NetworkRow[] | null>(null);
  const [failed, setFailed] = useState("");
  const [selected, setSelected] = useState("");
  const [leases, setLeases] = useState<LeaseRow[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("nat");
  const [subnet, setSubnet] = useState("192.168.150.1/24");
  const [bridge, setBridge] = useState("");

  const load = useCallback(async () => {
    try {
      setRows(await getNetworks(hostId));
      setFailed("");
    } catch (e) {
      setFailed(errorMessage(e, t("tab.error")));
    }
  }, [hostId, t]);
  const action = useAction(load);

  useEffect(() => {
    if (isVisible) void load();
  }, [isVisible, load]);

  useEffect(() => {
    if (!selected) return;
    getLeases(hostId, selected)
      .then(setLeases)
      .catch(() => setLeases([]));
  }, [hostId, selected]);

  if (failed && !rows) {
    return <p className="px-3 py-2 text-xs text-destructive">{failed}</p>;
  }
  if (!rows) return <LoadingState label={t("common.loading")} />;

  return (
    <TileStack>
      <SectionCard
        title={t("network.title")}
        icon={<Network className="size-3.5" />}
      >
        <PanelList empty={<EmptyState title={t("network.none")} />}>
          {rows.map((row) => (
            <ListRow
              key={row.name}
              title={row.name}
              selected={row.name === selected}
              onClick={() => setSelected(row.name)}
              badges={
                <ListBadge tone={row.active ? "success" : "muted"}>
                  {row.active ? t("storage.active") : t("storage.inactive")}
                </ListBadge>
              }
              meta={statusText([
                row.mode,
                row.subnet,
                row.bridge,
                row.autostart && t("vm.autostart"),
              ])}
              trailing={
                <>
                  <ListRowAction
                    label={row.active ? t("storage.stop") : t("storage.start")}
                    disabled={action.busy}
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (row.active) {
                        const ok = await confirm({
                          title: t("network.stopTitle", { name: row.name }),
                          description: t("network.stopText"),
                          confirmLabel: t("storage.stop"),
                        });
                        if (!ok) return;
                      }
                      await action.run(() =>
                        networkAction(
                          hostId,
                          row.name,
                          row.active ? "stop" : "start",
                        ),
                      );
                    }}
                  >
                    {row.active ? (
                      <Square className="size-3.5" />
                    ) : (
                      <Play className="size-3.5" />
                    )}
                  </ListRowAction>
                  <ListRowAction
                    label={t("common.delete")}
                    tone="destructive"
                    disabled={action.busy}
                    onClick={async (event) => {
                      event.stopPropagation();
                      const ok = await confirm({
                        title: t("network.deleteTitle", { name: row.name }),
                        description: t("network.stopText"),
                        confirmLabel: t("common.delete"),
                      });
                      if (ok) {
                        await action.run(() => deleteNetwork(hostId, row.name));
                      }
                    }}
                  >
                    <Trash2 className="size-3.5" />
                  </ListRowAction>
                </>
              }
            />
          ))}
        </PanelList>
        <div className="grid items-end gap-3 py-3 sm:grid-cols-[1fr_9rem_1fr_auto]">
          <TextField
            label={t("network.name")}
            value={name}
            onChange={setName}
          />
          <SelectField
            label={t("network.kind")}
            value={kind}
            onChange={(next) => setKind(next as Kind)}
            options={[
              { value: "nat", label: t("network.nat") },
              { value: "isolated", label: t("network.isolated") },
              { value: "bridge", label: t("network.bridge") },
            ]}
          />
          {kind === "bridge" ? (
            <TextField
              label={t("hardware.bridge")}
              value={bridge}
              onChange={setBridge}
              placeholder="br0"
            />
          ) : (
            <TextField
              label={t("network.subnet")}
              value={subnet}
              onChange={setSubnet}
              mono
            />
          )}
          <Button
            disabled={action.busy || !name}
            onClick={async () => {
              const ok = await action.run(() =>
                createNetwork(hostId, { name, type: kind, subnet, bridge }),
              );
              if (ok) setName("");
            }}
          >
            {t("network.add")}
          </Button>
        </div>
      </SectionCard>
      {selected && (
        <SectionCard
          title={t("network.leases", { name: selected })}
          icon={<Network className="size-3.5" />}
        >
          <PanelList empty={<EmptyState title={t("network.noLeases")} />}>
            {leases.map((lease) => (
              <ListRow
                key={lease.mac}
                title={lease.ip}
                meta={statusText([lease.hostname, lease.mac, lease.expires])}
              />
            ))}
          </PanelList>
        </SectionCard>
      )}
    </TileStack>
  );
}
