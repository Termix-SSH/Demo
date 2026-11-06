import { Pause, Play, Power, RotateCw } from "lucide-react";
import {
  usePluginPanelView,
  useTranslation,
} from "@termix-ssh/plugin-sdk/frontend";
import {
  DataView,
  EmptyState,
  ListRowAction,
  StatusBadge,
  StatTile,
  useConfirm,
} from "@termix-ssh/plugin-sdk/ui";
import type { PowerAction, VmRow } from "../shared/types";
import { power } from "./api";
import { formatBytes, percentOf, stateTone, statusText } from "./format";
import { useAction } from "./useAction";

export function useStateLabel() {
  const { t } = useTranslation();
  return (state: string) => t(`state.${state}`);
}

/** Power buttons for a VM in its current state. */
export function PowerButtons({
  hostId,
  vm,
  onChanged,
}: {
  hostId: number;
  vm: VmRow;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const confirm = useConfirm();
  const { busy, run } = useAction(onChanged);

  const press = async (action: PowerAction) => {
    if (action === "shutdown" || action === "stop") {
      const ok = await confirm({
        title: t(`power.${action}Title`, { name: vm.name }),
        description: t(`power.${action}Text`),
        confirmLabel: t(`power.${action}`),
      });
      if (!ok) return;
    }
    await run(() => power(hostId, vm.uuid, action));
  };

  const button = (
    action: PowerAction,
    Icon: typeof Play,
    tone?: "destructive",
  ) => (
    <ListRowAction
      key={action}
      label={t(`power.${action}`)}
      tone={tone}
      disabled={busy}
      onClick={(event) => {
        event.stopPropagation();
        void press(action);
      }}
    >
      <Icon className="size-3.5" />
    </ListRowAction>
  );

  if (vm.state === "running") {
    return (
      <>
        {button("reboot", RotateCw)}
        {button("suspend", Pause)}
        {button("shutdown", Power, "destructive")}
      </>
    );
  }
  if (vm.state === "paused") return button("resume", Play);
  return button("start", Play);
}

export function VmList({
  hostId,
  vms,
  onOpen,
  onChanged,
}: {
  hostId: number;
  vms: VmRow[];
  onOpen: (uuid: string) => void;
  onChanged: () => unknown;
}) {
  const { t } = useTranslation();
  const stateLabel = useStateLabel();
  const { view, density, columns } = usePluginPanelView("vms");

  return (
    <DataView
      items={vms}
      view={view}
      density={density}
      size={columns}
      getKey={(vm) => vm.uuid}
      onRowClick={(vm) => onOpen(vm.uuid)}
      empty={<EmptyState title={t("vm.none")} hint={t("vm.noneHint")} />}
      renderCard={(vm) => (
        <div
          role="button"
          tabIndex={0}
          className="h-full cursor-pointer"
          onClick={() => onOpen(vm.uuid)}
          onKeyDown={(event) => {
            if (event.key === "Enter") onOpen(vm.uuid);
          }}
        >
          <StatTile
            label={vm.name}
            value={stateLabel(vm.state)}
            hint={statusText([
              t("vm.cpus", { count: vm.vcpus }),
              formatBytes(vm.maxMemoryKib * 1024),
              vm.ips[0],
            ])}
            percent={
              vm.usedKib === null
                ? undefined
                : percentOf(vm.usedKib, vm.maxMemoryKib)
            }
            actions={
              <PowerButtons hostId={hostId} vm={vm} onChanged={onChanged} />
            }
          />
        </div>
      )}
      columns={{ base: 1, md: 2, xl: 3 }}
      listColumns={[
        {
          key: "name",
          header: t("vm.name"),
          width: "minmax(0,2fr)",
          cell: (vm) => vm.name,
        },
        {
          key: "state",
          header: t("vm.state"),
          width: "120px",
          cell: (vm) => (
            <StatusBadge tone={stateTone(vm.state)}>
              {stateLabel(vm.state)}
            </StatusBadge>
          ),
        },
        {
          key: "size",
          header: t("vm.size"),
          width: "160px",
          hideBelow: "md",
          cell: (vm) =>
            statusText([
              t("vm.cpus", { count: vm.vcpus }),
              formatBytes(vm.maxMemoryKib * 1024),
            ]),
        },
        {
          key: "ip",
          header: t("vm.ip"),
          width: "160px",
          hideBelow: "md",
          cell: (vm) => vm.ips[0] ?? "",
        },
        {
          key: "actions",
          header: "",
          width: "120px",
          align: "end",
          cell: (vm) => (
            <PowerButtons hostId={hostId} vm={vm} onChanged={onChanged} />
          ),
        },
      ]}
    />
  );
}
